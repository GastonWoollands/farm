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

print("[DEBUG] DB_PATH =", DB_PATH)
print("[DEBUG] Data dir exists:", data_dir.exists())
print("[DEBUG] Writable:", os.access(data_dir, os.W_OK))
print("[DEBUG] Absolute path:", data_dir.resolve())
print("[DEBUG] User:", os.getenv("USER", "unknown"))

# Intentar crear la carpeta si no existe
try:
    data_dir.mkdir(parents=True, exist_ok=True)
    print("[DEBUG] Data dir created / exists")
except Exception as e:
    print("[DEBUG] Failed to create data dir:", e)

# Intentar abrir DB
try:
    conn = sqlite3.connect(db_path, check_same_thread=False)
    print("[DEBUG] SQLite connection successful")
except sqlite3.OperationalError as e:
    print("[DEBUG] SQLite connection failed:", e)
    raise

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
]:
    _add_column_if_missing(_col, _type)

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


