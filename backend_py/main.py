import os
import sqlite3
from pathlib import Path
from fastapi import FastAPI, Header, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import csv
import io


# Configuration via environment variables with sensible defaults
PORT = int(os.getenv("PORT", "8000"))
DB_PATH = os.getenv("DB_PATH", str(Path(__file__).parent / "data" / "farm.db"))
VALID_KEYS = [k.strip() for k in os.getenv("VALID_KEYS", "test-key").split(",") if k.strip()]

# Ensure data directory exists
Path(DB_PATH).parent.mkdir(parents=True, exist_ok=True)

# Initialize DB and table
conn = sqlite3.connect(DB_PATH, check_same_thread=False)
conn.execute(
    """
    CREATE TABLE IF NOT EXISTS registrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        animal_number TEXT NOT NULL,
        created_at TEXT NOT NULL,
        user_key TEXT NOT NULL,
        mother_id TEXT,
        weight REAL,
        gender TEXT,
        status TEXT,
        notes TEXT
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
    ("weight", "REAL"),
    ("gender", "TEXT"),
    ("status", "TEXT"),
    ("notes", "TEXT"),
]:
    _add_column_if_missing(_col, _type)


class ValidateKeyBody(BaseModel):
    key: str


class RegisterBody(BaseModel):
    animalNumber: str
    createdAt: str | None = None
    motherId: str | None = None
    weight: float | None = None
    gender: str | None = None
    status: str | None = None
    notes: str | None = None


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
    if not x_user_key or x_user_key not in VALID_KEYS:
        raise HTTPException(status_code=401, detail="Invalid or missing user key")
    if not body.animalNumber:
        raise HTTPException(status_code=400, detail="animalNumber required")

    created_at = body.createdAt if (body.createdAt and isinstance(body.createdAt, str)) else None
    if not created_at:
        import datetime as _dt
        created_at = _dt.datetime.utcnow().isoformat()

    try:
        with conn:  # transaction
            conn.execute(
                """
                INSERT INTO registrations (animal_number, created_at, user_key, mother_id, weight, gender, status, notes)
                VALUES (?,?,?,?,?,?,?,?)
                """,
                (
                    body.animalNumber,
                    created_at,
                    x_user_key,
                    body.motherId,
                    body.weight,
                    body.gender,
                    body.status,
                    body.notes,
                ),
            )
    except sqlite3.Error:
        raise HTTPException(status_code=500, detail="DB error")

    return {"ok": True}


@app.get("/export")
def export_records(x_user_key: str | None = Header(default=None), format: str = "json"):
    # Validate key
    if not x_user_key or x_user_key not in VALID_KEYS:
        raise HTTPException(status_code=401, detail="Invalid or missing user key")

    # Fetch all records for this key
    cur = conn.execute(
        """
        SELECT id, animal_number, created_at, user_key, mother_id, weight, gender, status, notes
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


# Run with: uvicorn backend_py.main:app --host 0.0.0.0 --port 8000

