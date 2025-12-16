"""
PostgreSQL Database Connection Module with Async Support and RLS

This module provides async PostgreSQL connection pooling and RLS context management.
"""

import asyncpg
from typing import Optional
import logging
from .config import DATABASE_URL, DB_POOL_MIN_SIZE, DB_POOL_MAX_SIZE, DB_TIMEOUT

logger = logging.getLogger(__name__)

# Global connection pool
_pool: Optional[asyncpg.Pool] = None


async def init_db_pool():
    """
    Initialize the PostgreSQL connection pool.
    Should be called on application startup.
    """
    global _pool
    
    if _pool is not None:
        logger.warning("Database pool already initialized")
        return
    
    try:
        _pool = await asyncpg.create_pool(
            DATABASE_URL,
            min_size=DB_POOL_MIN_SIZE,
            max_size=DB_POOL_MAX_SIZE,
            command_timeout=DB_TIMEOUT,
            # SSL settings for Neon DB
            ssl='require' if 'neon' in DATABASE_URL else None
        )
        logger.info(f"✓ PostgreSQL connection pool initialized (min={DB_POOL_MIN_SIZE}, max={DB_POOL_MAX_SIZE})")
    except Exception as e:
        logger.error(f"Failed to initialize database pool: {e}")
        raise


async def close_db_pool():
    """
    Close the PostgreSQL connection pool.
    Should be called on application shutdown.
    """
    global _pool
    
    if _pool is not None:
        await _pool.close()
        _pool = None
        logger.info("✓ PostgreSQL connection pool closed")


def get_pool() -> asyncpg.Pool:
    """
    Get the global connection pool.
    Raises an error if pool is not initialized.
    """
    if _pool is None:
        raise RuntimeError("Database pool not initialized. Call init_db_pool() first.")
    return _pool


async def set_user_context(connection: asyncpg.Connection, company_id: Optional[int]):
    """
    Set the current user's company_id in the session for RLS policies.
    
    Args:
        connection: The database connection
        company_id: The user's company ID, or None for no filtering
    """
    if company_id is not None:
        await connection.execute("SET LOCAL app.current_company_id = $1", company_id)
    else:
        # Setting to NULL for users without company (they'll see nothing due to RLS)
        await connection.execute("SET LOCAL app.current_company_id = NULL")


class DatabaseConnection:
    """
    Context manager for database connections with automatic RLS context setting.
    
    Usage:
        async with DatabaseConnection(user['company_id']) as conn:
            result = await conn.fetchrow("SELECT * FROM registrations WHERE id = $1", id)
    """
    
    def __init__(self, company_id: Optional[int] = None):
        self.company_id = company_id
        self.connection: Optional[asyncpg.Connection] = None
        self.pool = get_pool()
    
    async def __aenter__(self) -> asyncpg.Connection:
        """Acquire connection and set RLS context"""
        self.connection = await self.pool.acquire()
        await set_user_context(self.connection, self.company_id)
        return self.connection
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Release connection back to pool"""
        if self.connection:
            await self.pool.release(self.connection)
            self.connection = None


async def health_check() -> dict:
    """
    Check database connection health.
    Returns dict with status and details.
    """
    try:
        pool = get_pool()
        async with pool.acquire() as conn:
            # Simple query to test connection
            result = await conn.fetchval("SELECT 1")
            if result == 1:
                return {
                    "status": "healthy",
                    "database": "postgresql",
                    "pool_size": pool.get_size(),
                    "pool_free": pool.get_idle_size()
                }
            else:
                return {
                    "status": "unhealthy",
                    "database": "postgresql",
                    "error": "Unexpected query result"
                }
    except Exception as e:
        logger.error(f"Database health check failed: {e}")
        return {
            "status": "unhealthy",
            "database": "postgresql",
            "error": str(e)
        }


# Utility functions for common operations
async def execute_query(
    query: str,
    *args,
    company_id: Optional[int] = None,
    fetch_one: bool = False,
    fetch_all: bool = False,
    fetch_val: bool = False
):
    """
    Execute a database query with automatic RLS context.
    
    Args:
        query: SQL query with $1, $2, etc. placeholders
        *args: Query parameters
        company_id: User's company ID for RLS
        fetch_one: Return single row
        fetch_all: Return all rows
        fetch_val: Return single value
        
    Returns:
        Query result based on fetch mode, or None for INSERT/UPDATE/DELETE
    """
    async with DatabaseConnection(company_id) as conn:
        if fetch_val:
            return await conn.fetchval(query, *args)
        elif fetch_one:
            return await conn.fetchrow(query, *args)
        elif fetch_all:
            return await conn.fetch(query, *args)
        else:
            return await conn.execute(query, *args)


async def execute_many(
    query: str,
    records: list,
    company_id: Optional[int] = None
):
    """
    Execute a query for multiple records (bulk insert/update).
    
    Args:
        query: SQL query with $1, $2, etc. placeholders
        records: List of tuples containing query parameters
        company_id: User's company ID for RLS
    """
    async with DatabaseConnection(company_id) as conn:
        await conn.executemany(query, records)


# For backward compatibility during migration
# This allows existing code to gradually adopt the new async pattern
class LegacyConnectionWrapper:
    """
    Provides a synchronous-style interface for gradual migration.
    DO NOT USE IN NEW CODE - use async DatabaseConnection instead.
    """
    def __init__(self):
        raise RuntimeError(
            "Legacy synchronous database access is not supported with PostgreSQL. "
            "Please use async DatabaseConnection or execute_query instead."
        )


# Export the old 'conn' name to catch legacy usage
conn = LegacyConnectionWrapper

