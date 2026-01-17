import os
import threading
import logging
import psycopg2
import psycopg2.pool
import psycopg2.extras
import re
from psycopg2 import Error as PostgresError, IntegrityError, OperationalError
from .config import DATABASE_URL, DB_POOL_MIN_SIZE, DB_POOL_MAX_SIZE, DB_TIMEOUT

logger = logging.getLogger(__name__)

# =============================================================================
# EVENT SOURCING MIGRATION FLAG
# =============================================================================
# Set to False to disable legacy triggers that write to events_state.
# New architecture uses domain_events table with explicit event emission.
# Keep True during migration period for safety/backward compatibility.
ENABLE_LEGACY_TRIGGERS = True  # Set to False after full migration to event sourcing

# =============================================================================
# CONNECTION POOL
# =============================================================================
# Global connection pool instance
_pool = None


def init_pool():
    """Initialize the connection pool"""
    global _pool
    if _pool is not None:
        return _pool
    
    if not DATABASE_URL:
        raise ValueError("DATABASE_URL environment variable is required for PostgreSQL connection")
    
    try:
        _pool = psycopg2.pool.ThreadedConnectionPool(
            minconn=DB_POOL_MIN_SIZE,
            maxconn=DB_POOL_MAX_SIZE,
            dsn=DATABASE_URL,
            connect_timeout=DB_TIMEOUT
        )
        # Test the pool by getting and returning a connection
        test_conn = _pool.getconn()
        test_conn.close()
        _pool.putconn(test_conn)
        return _pool
    except Exception as e:
        raise RuntimeError(f"Failed to initialize connection pool: {e}")


def close_pool():
    """Close all connections in the pool"""
    global _pool
    if _pool is not None:
        _pool.closeall()
        _pool = None


def get_pool():
    """Get the connection pool instance"""
    if _pool is None:
        raise RuntimeError("Connection pool not initialized. Call init_pool() first.")
    return _pool


# =============================================================================
# POSTGRES CONNECTION WRAPPER
# =============================================================================
# This wrapper makes Postgres look like SQLite so existing code continues to work

class PostgresCursor:
    """Cursor wrapper that mimics SQLite cursor behavior"""
    def __init__(self, cursor):
        self._cursor = cursor
        self._lastrowid = None
    
    def __getattr__(self, name):
        return getattr(self._cursor, name)
    
    @property
    def lastrowid(self):
        """Return the last inserted row ID"""
        return self._lastrowid
    
    def _convert_value(self, value):
        """Convert date/datetime objects to ISO format strings"""
        from datetime import date, datetime
        
        if value is None:
            return None
        elif isinstance(value, date) and not isinstance(value, datetime):
            return value.isoformat()
        elif isinstance(value, datetime):
            return value.isoformat()
        else:
            return value
    
    def _convert_row(self, row):
        """Convert all values in a row tuple"""
        if row is None:
            return None
        return tuple(self._convert_value(val) for val in row)
    
    def fetchone(self):
        """Fetch one row and convert date/datetime objects to strings"""
        row = self._cursor.fetchone()
        return self._convert_row(row)
    
    def fetchall(self):
        """Fetch all rows and convert date/datetime objects to strings"""
        rows = self._cursor.fetchall()
        return [self._convert_row(row) for row in rows]
    
    def execute(self, query, params=None):
        return self._cursor.execute(query, params)
    
    @property
    def description(self):
        return self._cursor.description


class PooledPostgresConnection:
    """Postgres connection wrapper that uses connection pool and mimics SQLite interface"""
    def __init__(self, pool):
        self.pool = pool
        self._thread_local = threading.local()
    
    def _get_connection(self):
        """Get connection from pool or thread-local storage"""
        if hasattr(self._thread_local, 'connection'):
            return self._thread_local.connection
        
        try:
            conn = self.pool.getconn()
            conn.autocommit = False
            return conn
        except Exception as e:
            raise RuntimeError(f"Failed to get connection from pool: {e}")
    
    def _return_connection(self, conn):
        """Return connection to pool if not in transaction context"""
        if not hasattr(self._thread_local, 'connection'):
            try:
                self.pool.putconn(conn)
            except Exception as e:
                print(f"Warning: Failed to return connection to pool: {e}")
    
    def _convert_query(self, query):
        """Convert SQLite-style queries to PostgreSQL-compatible queries"""
        # Convert ? placeholders to %s
        converted = query.replace('?', '%s')
        
        pattern = r"(?i)substr\s*\(\s*replace\s*\(\s*hex\s*\(\s*randomblob\s*\(\s*\d+\s*\)\s*\)\s*,\s*([\"']?)E\1\s*,\s*([\"']?)\2\s*\)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)"
        def replace_short_id_pattern(match):
            start = int(match.group(3))
            length = int(match.group(4))
            return f"substring(replace(translate(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 'E', ''), {start}, {length})"
        
        converted = re.sub(pattern, replace_short_id_pattern, converted)
        
        pattern2 = r"(?i)hex\s*\(\s*randomblob\s*\(\s*\d+\s*\)\s*\)"
        def replace_randomblob_hex(match):
            return "translate(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')"
        
        converted = re.sub(pattern2, replace_randomblob_hex, converted)
        
        return converted
    
    def execute(self, query, params=None):
        """Execute a query and return a cursor-like object"""
        conn = self._get_connection()
        converted_query = self._convert_query(query)
        cursor = conn.cursor()
        
        try:
            query_upper = converted_query.strip().upper()
            if (query_upper.startswith('INSERT') and 
                'RETURNING' not in query_upper and 
                'ON CONFLICT' not in query_upper):
                if ';' in converted_query:
                    parts = converted_query.rsplit(';', 1)
                    converted_query = parts[0] + ' RETURNING id;' + parts[1] if len(parts) > 1 else parts[0] + ' RETURNING id'
                else:
                    converted_query = converted_query.rstrip() + ' RETURNING id'
            
            if logger.isEnabledFor(logging.DEBUG):
                logger.debug(f"Executing query: {converted_query[:200]}...")
                if params:
                    logger.debug(f"With params: {params}")
            
            if params:
                cursor.execute(converted_query, params)
            else:
                cursor.execute(converted_query)
            
            lastrowid = None
            if query_upper.startswith('INSERT'):
                if 'RETURNING' in converted_query.upper():
                    result = cursor.fetchone()
                    if result:
                        lastrowid = result[0]
            
            wrapped_cursor = PostgresCursor(cursor)
            wrapped_cursor._lastrowid = lastrowid
            return wrapped_cursor
        except Exception as e:
            cursor.close()
            logger.error(f"Database query execution failed: {str(e)}", exc_info=True)
            logger.error(f"Original query: {query[:500]}")
            logger.error(f"Converted query: {converted_query[:500]}")
            if params:
                logger.error(f"Query params: {params}")
            if not hasattr(self._thread_local, 'connection'):
                self._return_connection(conn)
            raise
        finally:
            if not hasattr(self._thread_local, 'connection'):
                self._return_connection(conn)
    
    def commit(self):
        """Commit the current transaction"""
        if hasattr(self._thread_local, 'connection'):
            self._thread_local.connection.commit()
        else:
            raise RuntimeError("Cannot commit: not in a transaction context")
    
    def rollback(self):
        """Rollback the current transaction"""
        if hasattr(self._thread_local, 'connection'):
            self._thread_local.connection.rollback()
        else:
            raise RuntimeError("Cannot rollback: not in a transaction context")
    
    def __enter__(self):
        """Context manager entry - start transaction and hold connection"""
        conn = self._get_connection()
        self._thread_local.connection = conn
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit - commit or rollback and return connection"""
        if not hasattr(self._thread_local, 'connection'):
            return False
        
        conn = self._thread_local.connection
        try:
            if exc_type is None:
                conn.commit()
            else:
                conn.rollback()
        finally:
            delattr(self._thread_local, 'connection')
            self._return_connection(conn)
        
        return False
    
    def close(self):
        """Close is a no-op for pooled connections - they're managed by the pool"""
        pass
    
    @property
    def total_changes(self):
        """Return number of rows modified in last transaction"""
        return 0


# =============================================================================
# GLOBAL CONNECTION INSTANCE
# =============================================================================

class LazyConnection:
    """Lazy wrapper that initializes connection on first access"""
    def __init__(self):
        self._conn = None
    
    def _ensure_conn(self):
        """Ensure connection is initialized"""
        if self._conn is None:
            try:
                pool = get_pool()
            except RuntimeError:
                if DATABASE_URL:
                    init_pool()
                    pool = get_pool()
                else:
                    raise RuntimeError("DATABASE_URL not set and pool not initialized")
            self._conn = PooledPostgresConnection(pool)
        return self._conn
    
    def __getattr__(self, name):
        """Delegate all attribute access to the actual connection"""
        return getattr(self._ensure_conn(), name)
    
    def __enter__(self):
        """Context manager entry - enter underlying connection context and return self"""
        self._ensure_conn().__enter__()
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit - exit underlying connection context"""
        if self._conn is not None:
            return self._conn.__exit__(exc_type, exc_val, exc_tb)
        return False


conn = LazyConnection()


def get_conn():
    """Get the global connection instance (for explicit access)"""
    return conn._ensure_conn()
