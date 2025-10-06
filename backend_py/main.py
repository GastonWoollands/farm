import os
import sqlite3
from pathlib import Path
from fastapi import FastAPI, Header, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import csv
import io
import uuid
import random
import datetime as _dt


# Configuration via environment variables with sensible defaults
PORT = int(os.getenv("PORT", "8000"))
DB_PATH = os.getenv("DB_PATH", str(Path(__file__).parent / "data" / "farm.db"))
VALID_KEYS = [k.strip() for k in os.getenv("VALID_KEYS", "test-key").split(",") if k.strip()]
ADMIN_SECRET = os.getenv("ADMIN_SECRET", "")

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

# Best-effort migrations for older DBs missing new columns
def _add_column_if_missing(column: str, coltype: str) -> None:
    try:
        conn.execute(f"ALTER TABLE registrations ADD COLUMN {column} {coltype}")
        conn.commit()
    except sqlite3.OperationalError:
        # Likely the column already exists; ignore
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

def _create_unique_index():
    try:
        conn.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS uniq_user_animal_mother ON registrations(user_key, animal_number, IFNULL(mother_id, ''))"
        )
        conn.commit()
    except sqlite3.OperationalError:
        # Attempt to clean dupes then retry
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

_create_unique_index()


def _generate_short_id() -> str:
    digits = ''.join(ch for ch in uuid.uuid4().hex if ch.isdigit())
    if len(digits) < 10:
        digits += ''.join(str(random.randint(0, 9)) for _ in range(10 - len(digits)))
    return digits[:10]


class ValidateKeyBody(BaseModel):
    key: str


class RegisterBody(BaseModel):
    animalNumber: str
    createdAt: str | None = None
    motherId: str | None = None
    bornDate: str | None = None
    weight: float | None = None
    gender: str | None = None
    status: str | None = None
    color: str | None = None
    notes: str | None = None
    notesMother: str | None = None


app = FastAPI(title="Farm Backend", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Keep simple for local testing
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/validate-key")
def validate_key(body: ValidateKeyBody):
    valid = body.key in VALID_KEYS
    return {"valid": valid}


@app.post("/register", status_code=201)
def register(body: RegisterBody, x_user_key: str | None = Header(default=None)):
    # Validations
    if not x_user_key or x_user_key not in VALID_KEYS:
        raise HTTPException(status_code=401, detail="Invalid or missing user key")
    if not body.animalNumber:
        raise HTTPException(status_code=400, detail="animalNumber required")

    # Creation date
    created_at = body.createdAt if (body.createdAt and isinstance(body.createdAt, str)) else None
    if not created_at:
        created_at = _dt.datetime.utcnow().isoformat()

    # Normalize and convert to uppercase
    animal = (body.animalNumber or '').strip().upper()
    mother = (body.motherId or '').strip().upper() or None
    
    # Ensure weight is properly handled as float or None
    weight = None
    if body.weight is not None:
        try:
            weight = float(body.weight)
            if not (weight >= 0 and weight <= 10000):  # Reasonable weight range
                raise HTTPException(status_code=400, detail="Weight must be between 0 and 10000 kg")
        except (ValueError, TypeError):
            raise HTTPException(status_code=400, detail="Invalid weight value")
    
    # Convert text fields to uppercase
    gender = (body.gender or '').upper() or None
    status = (body.status or '').upper() or None
    color = (body.color or '').upper() or None
    notes = (body.notes or '').strip().upper() or None
    notes_mother = (body.notesMother or '').strip().upper() or None
    
    # Validate dropdown values if provided
    valid_genders = {"MALE", "FEMALE", "UNKNOWN"}
    valid_statuses = {"ALIVE", "DEAD", "UNKNOWN"}
    valid_colors = {"COLORADO", "MARRON", "NEGRO", "OTHERS"}
    
    if gender and gender not in valid_genders:
        raise HTTPException(status_code=400, detail=f"Invalid gender. Must be one of: {', '.join(valid_genders)}")
    if status and status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {', '.join(valid_statuses)}")
    if color and color not in valid_colors:
        raise HTTPException(status_code=400, detail=f"Invalid color. Must be one of: {', '.join(valid_colors)}")

    try:
        with conn:  # transaction
            conn.execute(
                """
                INSERT INTO registrations (
                    animal_number, created_at, user_key,
                    mother_id, born_date, weight, gender, status, color, notes, notes_mother, short_id
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    animal,
                    created_at,
                    x_user_key,
                    mother,
                    body.bornDate,
                    weight,
                    gender,
                    status,
                    color,
                    notes,
                    notes_mother,
                    _generate_short_id(),
                ),
            )
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=409, detail="Duplicate registration for this animal and mother")
    except sqlite3.Error as e:
        raise HTTPException(status_code=500, detail=f"DB error: {e}")

    return {"ok": True}


@app.get("/export")
def export_records(x_user_key: str | None = Header(default=None), format: str = "json"):
    # Validate key
    if not x_user_key or x_user_key not in VALID_KEYS:
        raise HTTPException(status_code=401, detail="Invalid or missing user key")

    # Fetch all records for this key
    cur = conn.execute(
        """
        SELECT animal_number, born_date, mother_id, 
        weight, gender, status, color, notes, notes_mother, created_at
        FROM registrations
        WHERE user_key = ?
        ORDER BY id ASC
        """,
        (x_user_key,),
    )
    cols = [d[0] for d in cur.description]
    rows = [dict(zip(cols, r)) for r in cur.fetchall()]

    if (format or "").lower() == "csv":
        # Stream as CSV
        buf = io.StringIO()
        writer = csv.DictWriter(buf, fieldnames=cols)
        writer.writeheader()
        for row in rows:
            writer.writerow(row)
        csv_data = buf.getvalue()
        return Response(
            content=csv_data,
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=export.csv"},
        )

    # Default JSON
    return {"count": len(rows), "items": rows}


class DeleteBody(BaseModel):
    animalNumber: str
    createdAt: str | None = None


@app.delete("/register")
def delete_registration(body: DeleteBody, x_user_key: str | None = Header(default=None)):
    if not x_user_key or x_user_key not in VALID_KEYS:
        raise HTTPException(status_code=401, detail="Invalid or missing user key")

    try:
        with conn:
            if body.createdAt:
                cur = conn.execute(
                    """
                    DELETE FROM registrations
                    WHERE id IN (
                        SELECT id FROM registrations
                        WHERE user_key = ? AND animal_number = ? AND created_at = ?
                        ORDER BY id DESC LIMIT 1
                    )
                    """,
                    (x_user_key, body.animalNumber, body.createdAt),
                )
            else:
                cur = conn.execute(
                    """
                    DELETE FROM registrations
                    WHERE id IN (
                        SELECT id FROM registrations
                        WHERE user_key = ? AND animal_number = ?
                        ORDER BY id DESC LIMIT 1
                    )
                    """,
                    (x_user_key, body.animalNumber),
                )
    except sqlite3.Error:
        raise HTTPException(status_code=500, detail="DB error")

    # cur.rowcount may be -1 for SELECT-based deletes in sqlite3; return ok regardless
    return {"ok": True}


# --- Admin utilities (dangerous) ---
class ExecSqlBody(BaseModel):
    sql: str
    params: list | None = None


def _require_admin(secret: str | None):
    if not ADMIN_SECRET or not secret or secret != ADMIN_SECRET:
        raise HTTPException(status_code=403, detail="Forbidden")


@app.post("/admin/delete-all")
def admin_delete_all(x_admin_secret: str | None = Header(default=None), x_user_key: str | None = Header(default=None)):
    _require_admin(x_admin_secret)
    try:
        with conn:
            if x_user_key:
                conn.execute("DELETE FROM registrations WHERE user_key = ?", (x_user_key,))
            else:
                conn.execute("DELETE FROM registrations")
    except sqlite3.Error as e:
        raise HTTPException(status_code=500, detail=f"DB error: {e}")
    return {"ok": True}


@app.post("/admin/exec-sql")
def admin_exec_sql(body: ExecSqlBody, x_admin_secret: str | None = Header(default=None)):
    _require_admin(x_admin_secret)
    sql = (body.sql or "").strip()
    if not sql:
        raise HTTPException(status_code=400, detail="sql required")
    # VERY basic safety: disallow multiple statements
    if ";" in sql.strip().rstrip(";"):
        raise HTTPException(status_code=400, detail="Only single statement allowed")
    params = tuple(body.params or [])
    try:
        cur = conn.execute(sql, params)
        # Heuristic: if cursor has description, it's a SELECT
        if cur.description:
            cols = [d[0] for d in cur.description]
            rows = [dict(zip(cols, r)) for r in cur.fetchall()]
            return {"rows": rows}
        else:
            changed = conn.total_changes
            conn.commit()
            return {"ok": True, "changes": changed}
    except sqlite3.Error as e:
        raise HTTPException(status_code=400, detail=f"SQL error: {e}")

# Run with: uvicorn backend_py.main:app --host 0.0.0.0 --port 8000

