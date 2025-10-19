import sqlite3
import datetime as _dt
from fastapi import HTTPException
from ..db import conn

VALID_GENDERS = {"MALE", "FEMALE", "UNKNOWN"}
VALID_STATUSES = {"ALIVE", "DEAD", "UNKNOWN"}
VALID_COLORS = {"COLORADO", "MARRON", "NEGRO", "OTHERS"}

def _normalize_text(value: str | None) -> str | None:
    return (value or "").strip().upper() or None

def insert_registration(created_by_or_key: str, body) -> None:
    if not body.animalNumber:
        raise HTTPException(status_code=400, detail="animalNumber required")

    created_at = body.createdAt if (body.createdAt and isinstance(body.createdAt, str)) else None
    if not created_at:
        created_at = _dt.datetime.utcnow().isoformat()

    animal = _normalize_text(body.animalNumber)
    mother = _normalize_text(body.motherId)
    father = _normalize_text(body.fatherId)

    weight = None
    if body.weight is not None:
        try:
            weight = float(body.weight)
            if not (0 <= weight <= 10000):
                raise HTTPException(status_code=400, detail="Weight must be between 0 and 10000 kg")
        except (ValueError, TypeError):
            raise HTTPException(status_code=400, detail="Invalid weight value")

    gender = _normalize_text(body.gender)
    status = _normalize_text(body.status)
    color = _normalize_text(body.color)
    notes = _normalize_text(body.notes)
    notes_mother = _normalize_text(body.notesMother)

    if gender and gender not in VALID_GENDERS:
        raise HTTPException(status_code=400, detail=f"Invalid gender. Must be one of: {', '.join(VALID_GENDERS)}")
    if status and status not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {', '.join(VALID_STATUSES)}")
    if color and color not in VALID_COLORS:
        raise HTTPException(status_code=400, detail=f"Invalid color. Must be one of: {', '.join(VALID_COLORS)}")

    try:
        with conn:
            cursor = conn.execute(
                """
                INSERT INTO registrations (
                    animal_number, created_at, user_key, created_by,
                    mother_id, father_id, born_date, weight, gender, status, color, notes, notes_mother, short_id
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, substr(replace(hex(randomblob(16)), 'E', ''), 1, 10))
                """,
                (
                    animal,
                    created_at,
                    None,  # legacy user_key deprecated when using Firebase
                    created_by_or_key,
                    mother,
                    father,
                    body.bornDate,
                    weight,
                    gender,
                    status,
                    color,
                    notes,
                    notes_mother,
                ),
            )
            # Return the ID of the inserted record
            return cursor.lastrowid
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=409, detail="Duplicate registration for this animal and mother")
    except sqlite3.Error as e:
        raise HTTPException(status_code=500, detail=f"DB error: {e}")

def delete_registration(created_by_or_key: str, animal_number: str, created_at: str | None) -> None:
    try:
        with conn:
            if created_at:
                conn.execute(
                    """
                    DELETE FROM registrations
                    WHERE id IN (
                        SELECT id FROM registrations
                        WHERE ((created_by = ?) OR (user_key = ?)) AND animal_number = ? AND created_at = ?
                        ORDER BY id DESC LIMIT 1
                    )
                    """,
                    (created_by_or_key, created_by_or_key, animal_number, created_at),
                )
            else:
                conn.execute(
                    """
                    DELETE FROM registrations
                    WHERE id IN (
                        SELECT id FROM registrations
                        WHERE ((created_by = ?) OR (user_key = ?)) AND animal_number = ?
                        ORDER BY id DESC LIMIT 1
                    )
                    """,
                    (created_by_or_key, created_by_or_key, animal_number),
                )
    except sqlite3.Error:
        raise HTTPException(status_code=500, detail="DB error")

def update_registration(created_by_or_key: str, animal_id: int, body) -> None:
    """Update an existing registration record"""
    if not body.animalNumber:
        raise HTTPException(status_code=400, detail="animalNumber required")

    animal = _normalize_text(body.animalNumber)
    mother = _normalize_text(body.motherId)
    father = _normalize_text(body.fatherId)

    weight = None
    if body.weight is not None:
        try:
            weight = float(body.weight)
            if not (0 <= weight <= 10000):
                raise HTTPException(status_code=400, detail="Weight must be between 0 and 10000 kg")
        except (ValueError, TypeError):
            raise HTTPException(status_code=400, detail="Invalid weight value")

    gender = _normalize_text(body.gender)
    status = _normalize_text(body.status)
    color = _normalize_text(body.color)
    notes = _normalize_text(body.notes)
    notes_mother = _normalize_text(body.notesMother)

    if gender and gender not in VALID_GENDERS:
        raise HTTPException(status_code=400, detail=f"Invalid gender. Must be one of: {', '.join(VALID_GENDERS)}")
    if status and status not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {', '.join(VALID_STATUSES)}")
    if color and color not in VALID_COLORS:
        raise HTTPException(status_code=400, detail=f"Invalid color. Must be one of: {', '.join(VALID_COLORS)}")

    try:
        with conn:
            # Check if record exists and belongs to user
            cursor = conn.execute(
                """
                SELECT id FROM registrations 
                WHERE id = ? AND ((created_by = ?) OR (user_key = ?))
                """,
                (animal_id, created_by_or_key, created_by_or_key)
            )
            if not cursor.fetchone():
                raise HTTPException(status_code=404, detail="Record not found or access denied")

            # Update the record
            conn.execute(
                """
                UPDATE registrations SET
                    animal_number = ?, mother_id = ?, father_id = ?, born_date = ?, weight = ?,
                    gender = ?, status = ?, color = ?, notes = ?, notes_mother = ?,
                    updated_at = datetime('now')
                WHERE id = ?
                """,
                (
                    animal, mother, father, body.bornDate, weight,
                    gender, status, color, notes, notes_mother,
                    animal_id
                )
            )
    except sqlite3.Error as e:
        raise HTTPException(status_code=500, detail=f"DB error: {e}")

def find_and_update_registration(created_by_or_key: str, body) -> bool:
    """Find and update a registration record by animalNumber and createdAt"""
    animal_number = body.animalNumber
    created_at = body.createdAt
    
    print(f"find_and_update_registration called with: animal_number={animal_number}, created_at={created_at}, user={created_by_or_key}")
    
    if not animal_number or not created_at:
        print("Missing animal_number or created_at")
        return False
    
    try:
        with conn:
            # Find the record by animalNumber and createdAt
            cursor = conn.execute(
                """
                SELECT id FROM registrations 
                WHERE animal_number = ? AND created_at = ? 
                AND ((created_by = ?) OR (user_key = ?))
                """,
                (animal_number, created_at, created_by_or_key, created_by_or_key)
            )
            record = cursor.fetchone()
            
            if not record:
                print("No record found in database")
                return False
            
            animal_id = record[0]
            print(f"Found record with ID: {animal_id}")
            
            # Update the record using the existing update_registration logic
            from ..models import RegisterBody
            update_body = RegisterBody(
                animalNumber=body.animalNumber,
                motherId=body.motherId,
                fatherId=body.fatherId,
                bornDate=body.bornDate,
                weight=body.weight,
                gender=body.gender,
                status=body.status,
                color=body.color,
                notes=body.notes,
                notesMother=body.notesMother
            )
            
            update_registration(created_by_or_key, animal_id, update_body)
            print("Record updated successfully")
            return True
            
    except Exception as e:
        print(f"Error in find_and_update_registration: {e}")
        return False

def export_rows(created_by_or_key: str, date: str | None, start: str | None, end: str | None) -> list[dict]:
    where = ["((created_by = ?) OR (user_key = ?))"]
    params: list = [created_by_or_key, created_by_or_key]
    if date:
        where.append("date(born_date) = date(?)")
        params.append(date)
    else:
        if start:
            where.append("date(born_date) >= date(?)")
            params.append(start)
        if end:
            where.append("date(born_date) <= date(?)")
            params.append(end)
    where_sql = " AND ".join(where)
    cur = conn.execute(
        f"""
        SELECT animal_number, born_date, mother_id, father_id,
               weight, gender, status, color, notes, notes_mother, created_at
        FROM registrations
        WHERE {where_sql}
        ORDER BY id ASC
        """,
        tuple(params),
    )
    cols = [d[0] for d in cur.description]
    return [dict(zip(cols, r)) for r in cur.fetchall()]


