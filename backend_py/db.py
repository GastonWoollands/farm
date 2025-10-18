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

conn.execute(
    """
    CREATE TABLE IF NOT EXISTS registrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        short_id TEXT UNIQUE,
        animal_number TEXT NOT NULL,
        created_at TEXT NOT NULL,
        user_key TEXT,
        created_by TEXT,
        mother_id TEXT,
        born_date TEXT,
        weight REAL,
        gender TEXT,
        status TEXT,
        color TEXT,
        notes TEXT,
        notes_mother TEXT
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
        event_date TEXT NOT NULL DEFAULT (datetime('now')),
        notes TEXT,
        FOREIGN KEY (animal_id) REFERENCES registrations (id) ON DELETE CASCADE
    )
    """
)
conn.commit()

def _add_column_if_missing(column: str, coltype: str) -> None:
    try:
        conn.execute(f"ALTER TABLE registrations ADD COLUMN {column} {coltype}")
        conn.commit()
    except sqlite3.OperationalError:
        pass

for _col, _type in [
    ("mother_id", "TEXT"),
    ("born_date", "TEXT"),
    ("weight", "REAL"),
    ("gender", "TEXT"),
    ("status", "TEXT"),
    ("color", "TEXT"),
    ("notes", "TEXT"),
    ("notes_mother", "TEXT"),
    ("short_id", "TEXT"),
    ("created_by", "TEXT"),
    ("updated_at", "TEXT DEFAULT (datetime('now'))"),
]:
    _add_column_if_missing(_col, _type)

# Add animal_number column to existing events_state table if it doesn't exist
try:
    conn.execute("ALTER TABLE events_state ADD COLUMN animal_number TEXT")
    conn.commit()
except sqlite3.OperationalError:
    pass  # Column already exists

# Update existing records to set updated_at = created_at
conn.execute("UPDATE registrations SET updated_at = created_at WHERE updated_at IS NULL")
conn.commit()

def create_unique_index() -> None:
    try:
        conn.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS uniq_user_animal_mother ON registrations(user_key, animal_number, IFNULL(mother_id, ''))"
        )
        conn.commit()
    except sqlite3.OperationalError:
        try:
            conn.execute(
                """
                DELETE FROM registrations
                WHERE rowid NOT IN (
                    SELECT MIN(rowid) FROM registrations
                    GROUP BY user_key, animal_number, IFNULL(mother_id, '')
                )
                """
            )
            conn.commit()
            conn.execute(
                "CREATE UNIQUE INDEX IF NOT EXISTS uniq_user_animal_mother ON registrations(user_key, animal_number, IFNULL(mother_id, ''))"
            )
            conn.commit()
        except sqlite3.OperationalError:
            pass
    # New index for Firebase user-based uniqueness
    try:
        conn.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS uniq_createdby_animal_mother ON registrations(created_by, animal_number, IFNULL(mother_id, ''))"
        )
        conn.commit()
    except sqlite3.OperationalError:
        pass

create_unique_index()

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
        END;
        """)
        conn.commit()
    except sqlite3.Error as e:
        print(f"Error creating events trigger: {e}")

create_events_trigger()


