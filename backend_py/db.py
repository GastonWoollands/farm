import os
import sqlite3
from pathlib import Path
from .config import DB_PATH

# Ensure data directory exists
Path(DB_PATH).parent.mkdir(parents=True, exist_ok=True)

db_path = Path(DB_PATH)
data_dir = db_path.parent
data_dir.mkdir(parents=True, exist_ok=True)

try:
    os.chmod(data_dir, 0o777)
except PermissionError:
    pass

# Initialize DB and table
conn = sqlite3.connect(DB_PATH, check_same_thread=False)

# Create animal_types lookup table
conn.execute(
    """
    CREATE TABLE IF NOT EXISTS animal_types (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        description TEXT
    )
    """
)

# Create inseminations_ids lookup table
conn.execute(
    """
    CREATE TABLE IF NOT EXISTS inseminations_ids (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        insemination_round_id TEXT NOT NULL UNIQUE,
        initial_date DATE NOT NULL,
        end_date DATE NOT NULL,
        notes TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
    )
    """
)

# Insert default animal types
conn.execute(
    """
    INSERT OR IGNORE INTO animal_types (id, name, description) VALUES 
    (1, 'cow', 'Female cattle'),
    (2, 'bull', 'Male cattle')
    """
)

# Insert initial insemination data
conn.execute(
    """
    INSERT OR IGNORE INTO inseminations_ids (insemination_round_id, initial_date, end_date, notes) VALUES 
    ('2024', '2024-10-31', '2024-11-18', 'initial insemination data')
    """
)

conn.execute(
    """
    CREATE TABLE IF NOT EXISTS registrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        short_id TEXT UNIQUE,
        animal_number TEXT NOT NULL,
        created_at TEXT NOT NULL,
        user_key TEXT,
        created_by TEXT,
        company_id INTEGER,
        mother_id TEXT,
        father_id TEXT,
        born_date TEXT,
        weight REAL,
        gender TEXT,
        animal_type INTEGER,
        status TEXT,
        color TEXT,
        notes TEXT,
        notes_mother TEXT,
        insemination_round_id TEXT,
        insemination_identifier TEXT,
        scrotal_circumference REAL,
        FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE SET NULL
    )
    """
)

# Create events_state table for tracking all changes
conn.execute(
    """
    CREATE TABLE IF NOT EXISTS events_state (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        animal_id INTEGER NOT NULL,
        animal_number TEXT NOT NULL,
        event_type TEXT NOT NULL,
        modified_field TEXT,
        old_value TEXT,
        new_value TEXT,
        user_id TEXT NOT NULL,
        company_id INTEGER,
        event_date TEXT NOT NULL DEFAULT (datetime('now')),
        notes TEXT,
        FOREIGN KEY (animal_id) REFERENCES registrations (id) ON DELETE CASCADE,
        FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE SET NULL
    )
    """
)
conn.commit()

def _add_column_safely(table_name: str, column_name: str, column_type: str) -> None:
    """Safely add a column to a table if it doesn't exist"""
    try:
        # Check if column already exists
        cursor = conn.execute(f"PRAGMA table_info({table_name})")
        columns = [row[1] for row in cursor.fetchall()]
        
        if column_name not in columns:
            conn.execute(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_type}")
            conn.commit()
            print(f"Added {column_name} to {table_name} table")
        else:
            print(f"Column {column_name} already exists in {table_name} table")
    except sqlite3.Error as e:
        print(f"Error adding {column_name} to {table_name}: {e}")

# Add animal_number column to existing events_state table if it doesn't exist
try:
    conn.execute("ALTER TABLE events_state ADD COLUMN animal_number TEXT")
    conn.commit()
except sqlite3.OperationalError:
    pass  # Column already exists


def create_unique_index() -> None:
    try:
        conn.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS uniq_user_animal_mother_father ON registrations(user_key, animal_number, IFNULL(mother_id, ''), IFNULL(father_id, ''))"
        )
        conn.commit()
    except sqlite3.OperationalError:
        try:
            conn.execute(
                """
                DELETE FROM registrations
                WHERE rowid NOT IN (
                    SELECT MIN(rowid) FROM registrations
                    GROUP BY user_key, animal_number, IFNULL(mother_id, ''), IFNULL(father_id, '')
                )
                """
            )
            conn.commit()
            conn.execute(
                "CREATE UNIQUE INDEX IF NOT EXISTS uniq_user_animal_mother_father ON registrations(user_key, animal_number, IFNULL(mother_id, ''), IFNULL(father_id, ''))"
            )
            conn.commit()
        except sqlite3.OperationalError:
            pass
    # New index for Firebase user-based uniqueness
    try:
        conn.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS uniq_createdby_animal_mother_father ON registrations(created_by, animal_number, IFNULL(mother_id, ''), IFNULL(father_id, ''))"
        )
        conn.commit()
    except sqlite3.OperationalError:
        pass

create_unique_index()

# Create indexes for new insemination tracking columns
try:
    conn.execute("CREATE INDEX IF NOT EXISTS idx_registrations_insemination_round_id ON registrations(insemination_round_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_registrations_insemination_identifier ON registrations(insemination_identifier)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_registrations_mother_insemination ON registrations(mother_id, insemination_round_id, insemination_identifier)")
    conn.commit()
except sqlite3.Error as e:
    print(f"Error creating insemination indexes: {e}")

# Create trigger for automatic event tracking
def create_events_trigger():
    """Create trigger to automatically track changes in events_state table"""
    try:
        conn.execute("DROP TRIGGER IF EXISTS track_registration_insert")
        conn.execute("DROP TRIGGER IF EXISTS track_registration_update")
        
        # Create INSERT trigger (birth event)
        conn.execute("""
        CREATE TRIGGER track_registration_insert
        AFTER INSERT ON registrations
        FOR EACH ROW
        BEGIN
            INSERT INTO events_state (
                animal_id, animal_number, event_type, modified_field, old_value, new_value, 
                user_id, event_date, notes
            ) VALUES (
                NEW.id, NEW.animal_number, 'born', NULL, NULL, NEW.status, 
                COALESCE(NEW.created_by, NEW.user_key, 'system'), 
                datetime('now'), NEW.notes
            );
        END;
        """)
        
        # Create UPDATE trigger (track field changes)
        conn.execute("""
        CREATE TRIGGER track_registration_update
        AFTER UPDATE ON registrations
        FOR EACH ROW
        BEGIN
            -- Track status changes (death event)
            INSERT INTO events_state (
                animal_id, animal_number, event_type, modified_field, old_value, new_value, 
                user_id, event_date, notes
            ) 
            SELECT NEW.id, NEW.animal_number, 'death', 'status', OLD.status, NEW.status, 
                   COALESCE(NEW.created_by, NEW.user_key, 'system'), 
                   datetime('now'), NEW.notes
            WHERE OLD.status != NEW.status AND NEW.status = 'DEAD';
            
            -- Track other field changes (corrections)
            INSERT INTO events_state (
                animal_id, animal_number, event_type, modified_field, old_value, new_value, 
                user_id, event_date, notes
            ) 
            SELECT NEW.id, NEW.animal_number, 'correccion', 'animal_number', OLD.animal_number, NEW.animal_number, 
                   COALESCE(NEW.created_by, NEW.user_key, 'system'), 
                   datetime('now'), NEW.notes
            WHERE OLD.animal_number != NEW.animal_number;
            
            INSERT INTO events_state (
                animal_id, animal_number, event_type, modified_field, old_value, new_value, 
                user_id, event_date, notes
            ) 
            SELECT NEW.id, NEW.animal_number, 'correccion', 'mother_id', 
                   COALESCE(OLD.mother_id, 'NULL'), 
                   COALESCE(NEW.mother_id, 'NULL'), 
                   COALESCE(NEW.created_by, NEW.user_key, 'system'), 
                   datetime('now'), NEW.notes
            WHERE (OLD.mother_id IS NULL AND NEW.mother_id IS NOT NULL) 
               OR (OLD.mother_id IS NOT NULL AND NEW.mother_id IS NULL) 
               OR (OLD.mother_id != NEW.mother_id);
            
            INSERT INTO events_state (
                animal_id, animal_number, event_type, modified_field, old_value, new_value, 
                user_id, event_date, notes
            ) 
            SELECT NEW.id, NEW.animal_number, 'correccion', 'father_id', 
                   COALESCE(OLD.father_id, 'NULL'), 
                   COALESCE(NEW.father_id, 'NULL'), 
                   COALESCE(NEW.created_by, NEW.user_key, 'system'), 
                   datetime('now'), NEW.notes
            WHERE (OLD.father_id IS NULL AND NEW.father_id IS NOT NULL) 
               OR (OLD.father_id IS NOT NULL AND NEW.father_id IS NULL) 
               OR (OLD.father_id != NEW.father_id);
            
            INSERT INTO events_state (
                animal_id, animal_number, event_type, modified_field, old_value, new_value, 
                user_id, event_date, notes
            ) 
            SELECT NEW.id, NEW.animal_number, 'correccion', 'born_date', OLD.born_date, NEW.born_date, 
                   COALESCE(NEW.created_by, NEW.user_key, 'system'), 
                   datetime('now'), NEW.notes
            WHERE OLD.born_date != NEW.born_date;
            
            INSERT INTO events_state (
                animal_id, animal_number, event_type, modified_field, old_value, new_value, 
                user_id, event_date, notes
            ) 
            SELECT NEW.id, NEW.animal_number, 'correccion', 'weight', 
                   COALESCE(CAST(OLD.weight AS TEXT), 'NULL'), 
                   COALESCE(CAST(NEW.weight AS TEXT), 'NULL'), 
                   COALESCE(NEW.created_by, NEW.user_key, 'system'), 
                   datetime('now'), NEW.notes
            WHERE (OLD.weight IS NULL AND NEW.weight IS NOT NULL) 
               OR (OLD.weight IS NOT NULL AND NEW.weight IS NULL) 
               OR (OLD.weight != NEW.weight);
            
            INSERT INTO events_state (
                animal_id, animal_number, event_type, modified_field, old_value, new_value, 
                user_id, event_date, notes
            ) 
            SELECT NEW.id, NEW.animal_number, 'correccion', 'gender', 
                   COALESCE(OLD.gender, 'NULL'), 
                   COALESCE(NEW.gender, 'NULL'), 
                   COALESCE(NEW.created_by, NEW.user_key, 'system'), 
                   datetime('now'), NEW.notes
            WHERE (OLD.gender IS NULL AND NEW.gender IS NOT NULL) 
               OR (OLD.gender IS NOT NULL AND NEW.gender IS NULL) 
               OR (OLD.gender != NEW.gender);
            
            INSERT INTO events_state (
                animal_id, animal_number, event_type, modified_field, old_value, new_value, 
                user_id, event_date, notes
            ) 
            SELECT NEW.id, NEW.animal_number, 'correccion', 'status', OLD.status, NEW.status, 
                   COALESCE(NEW.created_by, NEW.user_key, 'system'), 
                   datetime('now'), NEW.notes
            WHERE OLD.status != NEW.status AND NEW.status != 'DEAD';
            
            INSERT INTO events_state (
                animal_id, animal_number, event_type, modified_field, old_value, new_value, 
                user_id, event_date, notes
            ) 
            SELECT NEW.id, NEW.animal_number, 'correccion', 'color', OLD.color, NEW.color, 
                   COALESCE(NEW.created_by, NEW.user_key, 'system'), 
                   datetime('now'), NEW.notes
            WHERE OLD.color != NEW.color;
            
            INSERT INTO events_state (
                animal_id, animal_number, event_type, modified_field, old_value, new_value, 
                user_id, event_date, notes
            ) 
            SELECT NEW.id, NEW.animal_number, 'correccion', 'notes', OLD.notes, NEW.notes, 
                   COALESCE(NEW.created_by, NEW.user_key, 'system'), 
                   datetime('now'), NEW.notes
            WHERE OLD.notes != NEW.notes;
            
            INSERT INTO events_state (
                animal_id, animal_number, event_type, modified_field, old_value, new_value, 
                user_id, event_date, notes
            ) 
            SELECT NEW.id, NEW.animal_number, 'correccion', 'notes_mother', OLD.notes_mother, NEW.notes_mother, 
                   COALESCE(NEW.created_by, NEW.user_key, 'system'), 
                   datetime('now'), NEW.notes
            WHERE OLD.notes_mother != NEW.notes_mother;
            
            INSERT INTO events_state (
                animal_id, animal_number, event_type, modified_field, old_value, new_value, 
                user_id, event_date, notes
            ) 
            SELECT NEW.id, NEW.animal_number, 'correccion', 'scrotal_circumference', 
                   COALESCE(CAST(OLD.scrotal_circumference AS TEXT), 'NULL'), 
                   COALESCE(CAST(NEW.scrotal_circumference AS TEXT), 'NULL'), 
                   COALESCE(NEW.created_by, NEW.user_key, 'system'), 
                   datetime('now'), NEW.notes
            WHERE (OLD.scrotal_circumference IS NULL AND NEW.scrotal_circumference IS NOT NULL) 
               OR (OLD.scrotal_circumference IS NOT NULL AND NEW.scrotal_circumference IS NULL) 
               OR (OLD.scrotal_circumference != NEW.scrotal_circumference);
        END;
        """)
        conn.commit()
    except sqlite3.Error as e:
        print(f"Error creating events trigger: {e}")

create_events_trigger()

# Update existing records to set updated_at = created_at (after all columns are added)
try:
    conn.execute("UPDATE registrations SET updated_at = created_at WHERE updated_at IS NULL")
    conn.commit()
except sqlite3.OperationalError:
    pass  # Column doesn't exist, skip update

# Initialize inseminations table
def create_inseminations_table():
    """Create the inseminations table and related structures"""
    try:
        # Create the inseminations table
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS inseminations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                insemination_identifier TEXT NOT NULL,
                insemination_round_id TEXT NOT NULL,
                mother_id TEXT NOT NULL,
                mother_visual_id TEXT,
                bull_id TEXT,
                insemination_date DATE NOT NULL,
                registration_date TEXT NOT NULL DEFAULT (datetime('now')),
                animal_type TEXT,
                notes TEXT,
                created_by TEXT NOT NULL,
                company_id INTEGER,
                updated_at TEXT DEFAULT (datetime('now')),
                FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE SET NULL
            )
            """
        )
        
        # Create unique constraint to prevent duplicate inseminations for same cow on same date
        conn.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS uniq_mother_insemination_date ON inseminations(mother_id, insemination_date)"
        )
        
        # Create indexes for performance optimization
        conn.execute("CREATE INDEX IF NOT EXISTS idx_inseminations_mother_id ON inseminations(mother_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_inseminations_mother_visual_id ON inseminations(mother_visual_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_inseminations_round_id ON inseminations(insemination_round_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_inseminations_insemination_date ON inseminations(insemination_date)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_inseminations_bull_id ON inseminations(bull_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_inseminations_created_by ON inseminations(created_by)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_inseminations_registration_date ON inseminations(registration_date)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_inseminations_mother_visual_date ON inseminations(mother_visual_id, insemination_date DESC)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_inseminations_round_date ON inseminations(insemination_round_id, insemination_date DESC)")
        
        # Create triggers for automatic event tracking
        conn.execute("DROP TRIGGER IF EXISTS track_insemination_insert")
        conn.execute("DROP TRIGGER IF EXISTS track_insemination_update")
        conn.execute("DROP TRIGGER IF EXISTS track_insemination_delete")
        
        # Create INSERT trigger (insemination event)
        conn.execute("""
        CREATE TRIGGER track_insemination_insert
        AFTER INSERT ON inseminations
        FOR EACH ROW
        BEGIN
            INSERT INTO events_state (
                animal_id, animal_number, event_type, modified_field, old_value, new_value, 
                user_id, event_date, notes
            ) VALUES (
                NEW.mother_id, 
                NEW.mother_visual_id, 
                'inseminacion', 
                'insemination_date', 
                NULL, 
                NEW.insemination_date, 
                NEW.created_by, 
                datetime('now'), 
                NEW.notes
            );
        END;
        """)
        
        # Create UPDATE trigger (track field changes)
        conn.execute("""
        CREATE TRIGGER track_insemination_update
        AFTER UPDATE ON inseminations
        FOR EACH ROW
        BEGIN
            -- Track insemination date changes
            INSERT INTO events_state (
                animal_id, animal_number, event_type, modified_field, old_value, new_value, 
                user_id, event_date, notes
            ) 
            SELECT NEW.mother_id, NEW.mother_visual_id, 'correccion', 'insemination_date', 
                   OLD.insemination_date, NEW.insemination_date, 
                   NEW.created_by, datetime('now'), NEW.notes
            WHERE OLD.insemination_date != NEW.insemination_date;
            
            -- Track bull_id changes
            INSERT INTO events_state (
                animal_id, animal_number, event_type, modified_field, old_value, new_value, 
                user_id, event_date, notes
            ) 
            SELECT NEW.mother_id, NEW.mother_visual_id, 'correccion', 'bull_id', 
                   COALESCE(OLD.bull_id, 'NULL'), COALESCE(NEW.bull_id, 'NULL'), 
                   NEW.created_by, datetime('now'), NEW.notes
            WHERE (OLD.bull_id IS NULL AND NEW.bull_id IS NOT NULL) 
               OR (OLD.bull_id IS NOT NULL AND NEW.bull_id IS NULL) 
               OR (OLD.bull_id != NEW.bull_id);
            
            -- Track notes changes
            INSERT INTO events_state (
                animal_id, animal_number, event_type, modified_field, old_value, new_value, 
                user_id, event_date, notes
            ) 
            SELECT NEW.mother_id, NEW.mother_visual_id, 'correccion', 'insemination_notes', 
                   OLD.notes, NEW.notes, 
                   NEW.created_by, datetime('now'), NEW.notes
            WHERE OLD.notes != NEW.notes;
        END;
        """)
        
        # Create DELETE trigger
        conn.execute("""
        CREATE TRIGGER track_insemination_delete
        AFTER DELETE ON inseminations
        FOR EACH ROW
        BEGIN
            INSERT INTO events_state (
                animal_id, animal_number, event_type, modified_field, old_value, new_value, 
                user_id, event_date, notes
            ) VALUES (
                OLD.mother_id, 
                OLD.mother_visual_id, 
                'eliminacion_inseminacion', 
                'insemination_date', 
                OLD.insemination_date, 
                NULL, 
                OLD.created_by, 
                datetime('now'), 
                'Inseminación eliminada'
            );
        END;
        """)
        
        conn.commit()
        
        # Add animal_type column to existing inseminations table if it doesn't exist
        try:
            conn.execute("ALTER TABLE inseminations ADD COLUMN animal_type TEXT")
            conn.commit()
        except sqlite3.OperationalError:
            pass  # Column already exists
        
        # Add insemination_round_id column to existing inseminations table if it doesn't exist
        try:
            conn.execute("ALTER TABLE inseminations ADD COLUMN insemination_round_id TEXT")
            conn.commit()
        except sqlite3.OperationalError:
            pass  # Column already exists
        
        # Make mother_visual_id nullable (migration for existing databases)
        try:
            # SQLite doesn't support ALTER COLUMN, so we need to recreate the table
            # But first check if the column is already nullable by checking the schema
            cursor = conn.execute("PRAGMA table_info(inseminations)")
            columns = cursor.fetchall()
            mother_visual_id_col = next((col for col in columns if col[1] == 'mother_visual_id'), None)
            
            if mother_visual_id_col and mother_visual_id_col[3] == 1:  # 1 means NOT NULL
                print("Migrating mother_visual_id to nullable...")
                # Create new table with nullable mother_visual_id
                conn.execute("""
                    CREATE TABLE inseminations_new (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        insemination_identifier TEXT NOT NULL,
                        insemination_round_id TEXT NOT NULL,
                        mother_id TEXT NOT NULL,
                        mother_visual_id TEXT,
                        bull_id TEXT,
                        insemination_date DATE NOT NULL,
                        registration_date TEXT NOT NULL DEFAULT (datetime('now')),
                        animal_type TEXT,
                        notes TEXT,
                        created_by TEXT NOT NULL,
                        updated_at TEXT DEFAULT (datetime('now'))
                    )
                """)
                
                # Copy data from old table to new table
                conn.execute("""
                    INSERT INTO inseminations_new 
                    SELECT id, insemination_identifier, insemination_round_id, mother_id, 
                           mother_visual_id, bull_id, insemination_date, registration_date, 
                           animal_type, notes, created_by, updated_at
                    FROM inseminations
                """)
                
                # Drop old table and rename new one
                conn.execute("DROP TABLE inseminations")
                conn.execute("ALTER TABLE inseminations_new RENAME TO inseminations")
                
                # Recreate indexes
                conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS uniq_mother_insemination_date ON inseminations(mother_id, insemination_date)")
                conn.execute("CREATE INDEX IF NOT EXISTS idx_inseminations_mother_id ON inseminations(mother_id)")
                conn.execute("CREATE INDEX IF NOT EXISTS idx_inseminations_mother_visual_id ON inseminations(mother_visual_id)")
                conn.execute("CREATE INDEX IF NOT EXISTS idx_inseminations_round_id ON inseminations(insemination_round_id)")
                conn.execute("CREATE INDEX IF NOT EXISTS idx_inseminations_insemination_date ON inseminations(insemination_date)")
                conn.execute("CREATE INDEX IF NOT EXISTS idx_inseminations_bull_id ON inseminations(bull_id)")
                conn.execute("CREATE INDEX IF NOT EXISTS idx_inseminations_created_by ON inseminations(created_by)")
                conn.execute("CREATE INDEX IF NOT EXISTS idx_inseminations_registration_date ON inseminations(registration_date)")
                conn.execute("CREATE INDEX IF NOT EXISTS idx_inseminations_mother_visual_date ON inseminations(mother_visual_id, insemination_date DESC)")
                conn.execute("CREATE INDEX IF NOT EXISTS idx_inseminations_round_date ON inseminations(insemination_round_id, insemination_date DESC)")
                
                conn.commit()
                print("Migration completed - mother_visual_id is now nullable")
        except sqlite3.OperationalError as e:
            print(f"Migration skipped: {e}")
            pass  # Migration already applied or not needed
        
        # Migrate insemination_date from TEXT to DATE, mother_id from INTEGER to TEXT, and remove foreign key if needed
        try:
            # Check if insemination_date column exists and is TEXT type, or mother_id is INTEGER
            cursor = conn.execute("PRAGMA table_info(inseminations)")
            columns = cursor.fetchall()
            insemination_date_col = next((col for col in columns if col[1] == 'insemination_date'), None)
            mother_id_col = next((col for col in columns if col[1] == 'mother_id'), None)
            
            # Check if foreign key constraint exists
            cursor = conn.execute("PRAGMA foreign_key_list(inseminations)")
            fk_exists = len(cursor.fetchall()) > 0
            
            needs_migration = (
                (insemination_date_col and insemination_date_col[2] == 'TEXT') or
                (mother_id_col and mother_id_col[2] == 'INTEGER') or
                fk_exists
            )
            
            if needs_migration:
                print("Migrating inseminations table to fix data types and remove foreign key...")
                # Create a new table with correct types
                conn.execute("""
                CREATE TABLE inseminations_new (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    insemination_identifier TEXT NOT NULL,
                    insemination_round_id TEXT NOT NULL,
                    mother_id TEXT NOT NULL,
                    mother_visual_id TEXT NOT NULL,
                    bull_id TEXT,
                    insemination_date DATE NOT NULL,
                    registration_date TEXT NOT NULL DEFAULT (datetime('now')),
                    animal_type TEXT,
                    notes TEXT,
                    created_by TEXT NOT NULL,
                    updated_at TEXT DEFAULT (datetime('now'))
                )
                """)
                
                # Copy data from old table to new table
                conn.execute("""
                INSERT INTO inseminations_new 
                SELECT id, insemination_identifier, 
                       strftime('%Y%m', insemination_date) as insemination_round_id,
                       CAST(mother_id AS TEXT) as mother_id, mother_visual_id, bull_id,
                       date(insemination_date), registration_date, animal_type, notes, 
                       created_by, updated_at
                FROM inseminations
                """)
                
                # Drop old table and rename new table
                conn.execute("DROP TABLE inseminations")
                conn.execute("ALTER TABLE inseminations_new RENAME TO inseminations")
                
                # Recreate indexes with updated constraints
                conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS uniq_mother_insemination_date ON inseminations(mother_id, insemination_date)")
                conn.execute("CREATE INDEX IF NOT EXISTS idx_inseminations_mother_id ON inseminations(mother_id)")
                conn.execute("CREATE INDEX IF NOT EXISTS idx_inseminations_mother_visual_id ON inseminations(mother_visual_id)")
                conn.execute("CREATE INDEX IF NOT EXISTS idx_inseminations_round_id ON inseminations(insemination_round_id)")
                conn.execute("CREATE INDEX IF NOT EXISTS idx_inseminations_insemination_date ON inseminations(insemination_date)")
                conn.execute("CREATE INDEX IF NOT EXISTS idx_inseminations_bull_id ON inseminations(bull_id)")
                conn.execute("CREATE INDEX IF NOT EXISTS idx_inseminations_created_by ON inseminations(created_by)")
                conn.execute("CREATE INDEX IF NOT EXISTS idx_inseminations_registration_date ON inseminations(registration_date)")
                conn.execute("CREATE INDEX IF NOT EXISTS idx_inseminations_mother_date ON inseminations(mother_id, insemination_date DESC)")
                conn.execute("CREATE INDEX IF NOT EXISTS idx_inseminations_round_date ON inseminations(insemination_round_id, insemination_date DESC)")
                
                conn.commit()
                print("Migration completed successfully - Data types fixed, foreign key removed")
        except sqlite3.Error as e:
            print(f"Migration error (non-critical): {e}")
            # Continue execution even if migration fails
        
    except sqlite3.Error as e:
        print(f"Error creating inseminations table: {e}")

create_inseminations_table()

# Multi-tenant migration
def migrate_to_multi_tenant():
    """Migrate from single-user to multi-tenant architecture"""
    try:
        # Create companies table
        conn.execute("""
            CREATE TABLE IF NOT EXISTS companies (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                description TEXT,
                created_at TEXT DEFAULT (datetime('now')),
                updated_at TEXT DEFAULT (datetime('now')),
                is_active BOOLEAN DEFAULT 1
            )
        """)
        
        # Create users table
        conn.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                firebase_uid TEXT NOT NULL UNIQUE,
                email TEXT NOT NULL UNIQUE,
                display_name TEXT,
                company_id INTEGER,
                role TEXT DEFAULT 'admin',
                is_active BOOLEAN DEFAULT 1,
                created_at TEXT DEFAULT (datetime('now')),
                updated_at TEXT DEFAULT (datetime('now')),
                FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE SET NULL
            )
        """)
        
        # Create roles table
        conn.execute("""
            CREATE TABLE IF NOT EXISTS roles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                description TEXT,
                permissions TEXT,
                created_at TEXT DEFAULT (datetime('now'))
            )
        """)
        
        # Insert default roles
        conn.execute("""
            INSERT OR IGNORE INTO roles (id, name, description) VALUES 
            (1, 'admin', 'Full access to company data'),
            (2, 'manager', 'Manage data but limited admin functions'),
            (3, 'viewer', 'Read-only access to company data')
        """)
        
        # Add company_id columns to existing tables if they don't exist
        _add_column_safely("registrations", "company_id", "INTEGER")
        _add_column_safely("events_state", "company_id", "INTEGER")
        _add_column_safely("inseminations", "company_id", "INTEGER")
        
        # Create indexes
        conn.execute("CREATE INDEX IF NOT EXISTS idx_users_firebase_uid ON users(firebase_uid)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_users_company_id ON users(company_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_companies_name ON companies(name)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_registrations_company_id ON registrations(company_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_inseminations_company_id ON inseminations(company_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_events_state_company_id ON events_state(company_id)")
        
        conn.commit()
        print("Multi-tenant migration completed successfully")
        
    except sqlite3.Error as e:
        print(f"Multi-tenant migration error: {e}")


def migrate_add_email_unique_constraint():
    """Add unique constraint to email column in users table"""
    try:
        # Check if email unique constraint already exists
        cursor = conn.execute("PRAGMA index_list(users)")
        indexes = cursor.fetchall()
        email_unique_exists = any('email' in str(index) for index in indexes)
        
        if not email_unique_exists:
            # First, remove any duplicate emails (keep the first one)
            conn.execute("""
                DELETE FROM users 
                WHERE id NOT IN (
                    SELECT MIN(id) 
                    FROM users 
                    GROUP BY email
                )
            """)
            
            # Add unique constraint to email
            conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique ON users(email)")
            conn.commit()
            print("Email unique constraint added successfully")
        else:
            print("Email unique constraint already exists")
            
    except sqlite3.Error as e:
        print(f"Email unique constraint migration error: {e}")


# Multi-tenant migration for existing production databases
migrate_to_multi_tenant()
migrate_add_email_unique_constraint()

# Add new registration fields migration
def migrate_add_registration_fields():
    """Add new fields to registrations table"""
    try:
        # Add new columns to registrations table
        _add_column_safely("registrations", "rp_animal", "TEXT")
        _add_column_safely("registrations", "rp_mother", "TEXT")
        _add_column_safely("registrations", "mother_weight", "REAL")
        
        # Add triggers for tracking changes to new fields
        conn.execute("""
            CREATE TRIGGER IF NOT EXISTS track_rp_animal_changes
            AFTER UPDATE ON registrations
            WHEN OLD.rp_animal != NEW.rp_animal
            BEGIN
                INSERT INTO events_state (animal_id, animal_number, event_type, modified_field, old_value, new_value, user_id, event_date, notes)
                SELECT NEW.id, NEW.animal_number, 'correccion', 'rp_animal', 
                       COALESCE(OLD.rp_animal, 'NULL'), 
                       COALESCE(NEW.rp_animal, 'NULL'), 
                       COALESCE(NEW.created_by, NEW.user_key, 'system'), 
                       datetime('now'), NEW.notes
                WHERE OLD.rp_animal != NEW.rp_animal;
            END
        """)
        
        conn.execute("""
            CREATE TRIGGER IF NOT EXISTS track_rp_mother_changes
            AFTER UPDATE ON registrations
            WHEN OLD.rp_mother != NEW.rp_mother
            BEGIN
                INSERT INTO events_state (animal_id, animal_number, event_type, modified_field, old_value, new_value, user_id, event_date, notes)
                SELECT NEW.id, NEW.animal_number, 'correccion', 'rp_mother', 
                       COALESCE(OLD.rp_mother, 'NULL'), 
                       COALESCE(NEW.rp_mother, 'NULL'), 
                       COALESCE(NEW.created_by, NEW.user_key, 'system'), 
                       datetime('now'), NEW.notes
                WHERE OLD.rp_mother != NEW.rp_mother;
            END
        """)
        
        conn.execute("""
            CREATE TRIGGER IF NOT EXISTS track_mother_weight_changes
            AFTER UPDATE ON registrations
            WHEN OLD.mother_weight != NEW.mother_weight
            BEGIN
                INSERT INTO events_state (animal_id, animal_number, event_type, modified_field, old_value, new_value, user_id, event_date, notes)
                SELECT NEW.id, NEW.animal_number, 'correccion', 'mother_weight', 
                       COALESCE(CAST(OLD.mother_weight AS TEXT), 'NULL'), 
                       COALESCE(CAST(NEW.mother_weight AS TEXT), 'NULL'), 
                       COALESCE(NEW.created_by, NEW.user_key, 'system'), 
                       datetime('now'), NEW.notes
                WHERE OLD.mother_weight != NEW.mother_weight;
            END
        """)
        
        conn.commit()
        print("Registration fields migration completed successfully")
    except sqlite3.Error as e:
        print(f"Registration fields migration error: {e}")

# Run the migration
migrate_add_registration_fields()


