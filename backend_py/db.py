import sqlite3
from pathlib import Path
from .config import DB_PATH

# Ensure data directory exists
Path(DB_PATH).parent.mkdir(parents=True, exist_ok=True)

# Initialize DB and table
conn = sqlite3.connect(DB_PATH, check_same_thread=False)

conn.execute(
    """
    CREATE TABLE IF NOT EXISTS registrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        short_id TEXT UNIQUE,
        animal_number TEXT NOT NULL,
        created_at TEXT NOT NULL,
        user_key TEXT NOT NULL,
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

create_unique_index()


