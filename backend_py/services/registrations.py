import sqlite3
import datetime as _dt
from datetime import timedelta
from typing import Optional
from fastapi import HTTPException
from ..db import conn
from .auth_service import get_data_filter_clause
from .event_emitter import (
    emit_birth_registered,
    emit_death_recorded,
    emit_field_change,
)
from .snapshot_projector import project_animal_snapshot
from ..events.event_types import EventType

VALID_GENDERS = {"MALE", "FEMALE", "UNKNOWN"}
VALID_STATUSES = {"ALIVE", "DEAD", "UNKNOWN"}
VALID_COLORS = {"COLORADO", "MARRON", "NEGRO", "OTHERS"}

def _normalize_text(value: str | None) -> str | None:
    return (value or "").strip().upper() or None

def _auto_assign_insemination_round_id(born_date: str, company_id: int | None) -> Optional[str]:
    """
    Auto-assign insemination_round_id based on birth date.
    Logic: born_date - 300 days = estimated insemination_date, extract year,
    find matching insemination_round_id in inseminations_ids table (round definitions) 
    or inseminations table (actual insemination records) for company.
    
    Args:
        born_date: Birth date in YYYY-MM-DD format
        company_id: Company ID to filter inseminations (can be None for legacy records)
    
    Returns:
        Matching insemination_round_id if found, None otherwise
    """
    if not born_date:
        return None
    
    try:
        # Parse birth date
        birth_dt = _dt.datetime.strptime(born_date, '%Y-%m-%d').date()
        # Calculate estimated insemination date (300 days before birth)
        estimated_insem_date = birth_dt - timedelta(days=300)
        estimated_year = str(estimated_insem_date.year)
        
        # First, try to find in inseminations_ids table (round definitions) - this is more reliable
        if company_id:
            cursor = conn.execute("""
                SELECT insemination_round_id 
                FROM inseminations_ids 
                WHERE company_id = ? 
                AND (insemination_round_id = ? OR insemination_round_id LIKE ?)
                ORDER BY insemination_round_id DESC
                LIMIT 1
            """, (company_id, estimated_year, f"{estimated_year}%"))
        else:
            # For legacy records without company_id
            cursor = conn.execute("""
                SELECT insemination_round_id 
                FROM inseminations_ids 
                WHERE (insemination_round_id = ? OR insemination_round_id LIKE ?)
                ORDER BY insemination_round_id DESC
                LIMIT 1
            """, (estimated_year, f"{estimated_year}%"))
        
        result = cursor.fetchone()
        if result:
            return result[0]
        
        # If not found in inseminations_ids, try inseminations table as fallback
        if company_id:
            cursor = conn.execute("""
                SELECT DISTINCT insemination_round_id 
                FROM inseminations 
                WHERE company_id = ? 
                AND (insemination_round_id = ? OR insemination_round_id LIKE ?)
                ORDER BY insemination_round_id DESC
                LIMIT 1
            """, (company_id, estimated_year, f"{estimated_year}%"))
        else:
            # For legacy records without company_id
            cursor = conn.execute("""
                SELECT DISTINCT insemination_round_id 
                FROM inseminations 
                WHERE (insemination_round_id = ? OR insemination_round_id LIKE ?)
                ORDER BY insemination_round_id DESC
                LIMIT 1
            """, (estimated_year, f"{estimated_year}%"))
        
        result = cursor.fetchone()
        return result[0] if result else None
    except Exception as e:
        # Log the error for debugging but don't raise
        import logging
        logging.error(f"Error in _auto_assign_insemination_round_id: {e}")
        return None

def insert_registration(created_by_or_key: str, body, company_id: int = None) -> None:
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

    scrotal_circumference = None
    if body.scrotalCircumference is not None:
        try:
            scrotal_circumference = float(body.scrotalCircumference)
            if not (0 <= scrotal_circumference <= 100):
                raise HTTPException(status_code=400, detail="Scrotal circumference must be between 0 and 100 cm")
        except (ValueError, TypeError):
            raise HTTPException(status_code=400, detail="Invalid scrotal circumference value")

    gender = _normalize_text(body.gender)
    
    # Determine animal_type based on gender
    animal_type = None
    if gender:
        if gender == 'FEMALE':
            animal_type = 1  # Cow
        elif gender == 'MALE':
            animal_type = 2  # Bull
        # UNKNOWN gender will have animal_type = None
    
    status = _normalize_text(body.status)
    color = _normalize_text(body.color)
    notes = _normalize_text(body.notes)
    notes_mother = _normalize_text(body.notesMother)
    insemination_round_id = _normalize_text(body.inseminationRoundId)
    insemination_identifier = _normalize_text(body.inseminationIdentifier)
    rp_animal = _normalize_text(body.rpAnimal)
    rp_mother = _normalize_text(body.rpMother)

    # Handle mother_weight validation
    mother_weight = None
    if body.motherWeight is not None:
        try:
            mother_weight = float(body.motherWeight)
            if not (0 <= mother_weight <= 10000):
                raise HTTPException(status_code=400, detail="Mother weight must be between 0 and 10000 kg")
        except (ValueError, TypeError):
            raise HTTPException(status_code=400, detail="Invalid mother weight value")

    # Handle weaning_weight validation
    weaning_weight = None
    if body.weaningWeight is not None:
        try:
            weaning_weight = float(body.weaningWeight)
            if not (0 <= weaning_weight <= 10000):
                raise HTTPException(status_code=400, detail="Weaning weight must be between 0 and 10000 kg")
        except (ValueError, TypeError):
            raise HTTPException(status_code=400, detail="Invalid weaning weight value")

    # Auto-assign insemination_round_id if missing and born_date is provided
    if not insemination_round_id and body.bornDate:
        auto_assigned_round_id = _auto_assign_insemination_round_id(body.bornDate, company_id)
        if auto_assigned_round_id:
            insemination_round_id = _normalize_text(auto_assigned_round_id)

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
                    animal_number, created_at, user_key, created_by, company_id,
                    mother_id, father_id, born_date, weight, gender, animal_type, status, color, notes, notes_mother, short_id,
                    insemination_round_id, insemination_identifier, scrotal_circumference, rp_animal, rp_mother, mother_weight, weaning_weight
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, substr(replace(hex(randomblob(16)), 'E', ''), 1, 10), ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    animal,
                    created_at,
                    None,  # legacy user_key deprecated when using Firebase
                    created_by_or_key,
                    company_id,  # company_id for multi-tenant filtering
                    mother,
                    father,
                    body.bornDate,
                    weight,
                    gender,
                    animal_type,
                    status,
                    color,
                    notes,
                    notes_mother,
                    insemination_round_id,
                    insemination_identifier,
                    scrotal_circumference,
                    rp_animal,
                    rp_mother,
                    mother_weight,
                    weaning_weight,
                ),
            )
            animal_id = cursor.lastrowid
            
            # Emit domain event (Event Sourcing)
            if company_id:  # Only emit for multi-tenant records
                try:
                    emit_birth_registered(
                        animal_id=animal_id,
                        animal_number=animal,
                        company_id=company_id,
                        user_id=created_by_or_key,
                        born_date=body.bornDate,
                        weight=weight,
                        gender=gender,
                        status=status,
                        color=color,
                        mother_id=mother,
                        father_id=father,
                        notes=notes,
                        notes_mother=notes_mother,
                        rp_animal=rp_animal,
                        rp_mother=rp_mother,
                        mother_weight=mother_weight,
                        weaning_weight=weaning_weight,
                        scrotal_circumference=scrotal_circumference,
                        insemination_round_id=insemination_round_id,
                        insemination_identifier=insemination_identifier,
                    )
                    # Project snapshot
                    project_animal_snapshot(animal_id, company_id)
                except Exception as e:
                    # Log but don't fail - triggers still work as backup
                    import logging
                    logging.warning(f"Failed to emit birth event for animal {animal_id}: {e}")
            
            return animal_id
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

def update_registration(created_by_or_key: str, animal_id: int, body, company_id: int | None = None) -> None:
    """Update an existing registration record.
    Requires company_id - only users within the same company can update records.
    """
    # Require company_id for all updates
    if not company_id:
        raise HTTPException(status_code=403, detail="Company assignment required to update records")
    
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

    scrotal_circumference = None
    if body.scrotalCircumference is not None:
        try:
            scrotal_circumference = float(body.scrotalCircumference)
            if not (0 <= scrotal_circumference <= 100):
                raise HTTPException(status_code=400, detail="Scrotal circumference must be between 0 and 100 cm")
        except (ValueError, TypeError):
            raise HTTPException(status_code=400, detail="Invalid scrotal circumference value")

    gender = _normalize_text(body.gender)
    
    # Determine animal_type based on gender
    animal_type = None
    if gender:
        if gender == 'FEMALE':
            animal_type = 1  # Cow
        elif gender == 'MALE':
            animal_type = 2  # Bull
        # UNKNOWN gender will have animal_type = None
    
    status = _normalize_text(body.status)
    color = _normalize_text(body.color)
    notes = _normalize_text(body.notes)
    notes_mother = _normalize_text(body.notesMother)
    insemination_round_id = _normalize_text(body.inseminationRoundId)
    insemination_identifier = _normalize_text(body.inseminationIdentifier)
    rp_animal = _normalize_text(body.rpAnimal)
    rp_mother = _normalize_text(body.rpMother)

    # Handle mother_weight validation
    mother_weight = None
    if body.motherWeight is not None:
        try:
            mother_weight = float(body.motherWeight)
            if not (0 <= mother_weight <= 10000):
                raise HTTPException(status_code=400, detail="Mother weight must be between 0 and 10000 kg")
        except (ValueError, TypeError):
            raise HTTPException(status_code=400, detail="Invalid mother weight value")

    # Handle weaning_weight validation
    weaning_weight = None
    if body.weaningWeight is not None:
        try:
            weaning_weight = float(body.weaningWeight)
            if not (0 <= weaning_weight <= 10000):
                raise HTTPException(status_code=400, detail="Weaning weight must be between 0 and 10000 kg")
        except (ValueError, TypeError):
            raise HTTPException(status_code=400, detail="Invalid weaning weight value")

    if gender and gender not in VALID_GENDERS:
        raise HTTPException(status_code=400, detail=f"Invalid gender. Must be one of: {', '.join(VALID_GENDERS)}")
    if status and status not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {', '.join(VALID_STATUSES)}")
    if color and color not in VALID_COLORS:
        raise HTTPException(status_code=400, detail=f"Invalid color. Must be one of: {', '.join(VALID_COLORS)}")

    try:
        with conn:
            # Check if record exists and belongs to the same company, and get current values
            cursor = conn.execute(
                """
                SELECT company_id, animal_number, mother_id, father_id, born_date, weight,
                       gender, status, color, notes, notes_mother, rp_animal, rp_mother,
                       mother_weight, weaning_weight, scrotal_circumference
                FROM registrations 
                WHERE id = ? AND company_id = ?
                """,
                (animal_id, company_id)
            )
            record = cursor.fetchone()
            if not record:
                raise HTTPException(status_code=404, detail="Record not found or access denied")
            
            # Store old values for event emission
            old_values = {
                'animal_number': record[1],
                'mother_id': record[2],
                'father_id': record[3],
                'born_date': record[4],
                'weight': record[5],
                'gender': record[6],
                'status': record[7],
                'color': record[8],
                'notes': record[9],
                'notes_mother': record[10],
                'rp_animal': record[11],
                'rp_mother': record[12],
                'mother_weight': record[13],
                'weaning_weight': record[14],
                'scrotal_circumference': record[15],
            }
            
            # Auto-assign insemination_round_id if missing and born_date is provided
            if not insemination_round_id and body.bornDate:
                auto_assigned_round_id = _auto_assign_insemination_round_id(body.bornDate, company_id)
                if auto_assigned_round_id:
                    insemination_round_id = _normalize_text(auto_assigned_round_id)
            
            # Update the record
            conn.execute(
                """
                UPDATE registrations SET
                    animal_number = ?, mother_id = ?, father_id = ?, born_date = ?, weight = ?,
                    gender = ?, animal_type = ?, status = ?, color = ?, notes = ?, notes_mother = ?,
                    insemination_round_id = ?, insemination_identifier = ?, scrotal_circumference = ?,
                    rp_animal = ?, rp_mother = ?, mother_weight = ?, weaning_weight = ?,
                    updated_at = datetime('now')
                WHERE id = ?
                """,
                (
                    animal, mother, father, body.bornDate, weight,
                    gender, animal_type, status, color, notes, notes_mother,
                    insemination_round_id, insemination_identifier, scrotal_circumference,
                    rp_animal, rp_mother, mother_weight, weaning_weight,
                    animal_id
                )
            )
            
            # Emit domain events for changes (Event Sourcing)
            if company_id:
                try:
                    # Map of field -> (old_value, new_value, event_type)
                    field_changes = [
                        ('weight', old_values['weight'], weight, EventType.WEIGHT_RECORDED),
                        ('weaning_weight', old_values['weaning_weight'], weaning_weight, EventType.WEANING_WEIGHT_RECORDED),
                        ('mother_id', old_values['mother_id'], mother, EventType.MOTHER_ASSIGNED),
                        ('father_id', old_values['father_id'], father, EventType.FATHER_ASSIGNED),
                        ('gender', old_values['gender'], gender, EventType.GENDER_CORRECTED),
                        ('color', old_values['color'], color, EventType.COLOR_RECORDED),
                        ('animal_number', old_values['animal_number'], animal, EventType.ANIMAL_NUMBER_CORRECTED),
                        ('born_date', old_values['born_date'], body.bornDate, EventType.BIRTH_DATE_CORRECTED),
                        ('notes', old_values['notes'], notes, EventType.NOTES_UPDATED),
                        ('notes_mother', old_values['notes_mother'], notes_mother, EventType.MOTHER_NOTES_UPDATED),
                        ('rp_animal', old_values['rp_animal'], rp_animal, EventType.RP_ANIMAL_UPDATED),
                        ('rp_mother', old_values['rp_mother'], rp_mother, EventType.RP_MOTHER_UPDATED),
                        ('mother_weight', old_values['mother_weight'], mother_weight, EventType.MOTHER_WEIGHT_RECORDED),
                        ('scrotal_circumference', old_values['scrotal_circumference'], scrotal_circumference, EventType.SCROTAL_CIRCUMFERENCE_RECORDED),
                    ]
                    
                    # Special handling for status -> death
                    if old_values['status'] != status:
                        if status == 'DEAD':
                            emit_death_recorded(
                                animal_id=animal_id,
                                animal_number=animal,
                                company_id=company_id,
                                user_id=created_by_or_key,
                                death_date=_dt.datetime.utcnow().isoformat(),
                                previous_status=old_values['status'],
                                notes=notes,
                            )
                        else:
                            emit_field_change(
                                event_type=EventType.STATUS_CHANGED,
                                animal_id=animal_id,
                                animal_number=animal,
                                company_id=company_id,
                                user_id=created_by_or_key,
                                field_name='status',
                                old_value=old_values['status'],
                                new_value=status,
                                notes=notes,
                            )
                    
                    # Emit events for other field changes
                    for field_name, old_val, new_val, event_type in field_changes:
                        if old_val != new_val:
                            emit_field_change(
                                event_type=event_type,
                                animal_id=animal_id,
                                animal_number=animal,
                                company_id=company_id,
                                user_id=created_by_or_key,
                                field_name=field_name,
                                old_value=old_val,
                                new_value=new_val,
                                notes=notes,
                            )
                    
                    # Project snapshot
                    project_animal_snapshot(animal_id, company_id)
                    
                except Exception as e:
                    # Log but don't fail - triggers still work as backup
                    import logging
                    logging.warning(f"Failed to emit update events for animal {animal_id}: {e}")
                    
    except sqlite3.Error as e:
        raise HTTPException(status_code=500, detail=f"DB error: {e}")

def find_and_update_registration(created_by_or_key: str, body, company_id: int | None = None) -> bool:
    """Find and update a registration record by animalNumber and createdAt.
    Requires company_id - only users within the same company can update records.
    """
    # Require company_id for all updates
    if not company_id:
        print(f"Access denied: company_id required. User={created_by_or_key} attempted update without company assignment.")
        return False
    
    # Normalize animal_number to match database storage format
    animal_number = _normalize_text(body.animalNumber)
    created_at = body.createdAt
    
    print(f"find_and_update_registration called with: animal_number={animal_number}, created_at={created_at}, user={created_by_or_key}, company_id={company_id}")
    
    if not animal_number or not created_at:
        print("Missing animal_number or created_at")
        return False
    
    try:
        with conn:
            # Multi-tenant: only users in same company can update records
            where_clause = "animal_number = ? AND created_at = ? AND company_id = ?"
            params = (animal_number, created_at, company_id)
            
            # Find the record by animalNumber and createdAt
            # animal_number is already normalized to match database storage format
            cursor = conn.execute(
                f"""
                SELECT id FROM registrations 
                WHERE {where_clause}
                """,
                params
            )
            record = cursor.fetchone()
            
            if not record:
                # Try to find if record exists but with different access
                cursor_check = conn.execute(
                    """
                    SELECT id, created_by, user_key, company_id FROM registrations 
                    WHERE animal_number = ? AND created_at = ?
                    """,
                    (animal_number, created_at)
                )
                check_record = cursor_check.fetchone()
                if check_record:
                    print(f"Record exists but access denied. Record user_key={check_record[2]}, created_by={check_record[1]}, company_id={check_record[3]}, requested user={created_by_or_key}, requested company_id={company_id}")
                else:
                    print(f"No record found in database for animal_number={animal_number}, created_at={created_at}")
                return False
            
            animal_id = record[0]
            print(f"Found record with ID: {animal_id}")
            
            # Update the record using the existing update_registration logic
            from ..models import RegisterBody
            update_body = RegisterBody(
                animalNumber=body.animalNumber,
                motherId=body.motherId,
                rpAnimal=body.rpAnimal,
                rpMother=body.rpMother,
                fatherId=body.fatherId,
                bornDate=body.bornDate,
                weight=body.weight,
                motherWeight=body.motherWeight,
                weaningWeight=body.weaningWeight,
                gender=body.gender,
                status=body.status,
                color=body.color,
                notes=body.notes,
                notesMother=body.notesMother,
                inseminationRoundId=body.inseminationRoundId,
                inseminationIdentifier=body.inseminationIdentifier,
                scrotalCircumference=body.scrotalCircumference
            )
            
            update_registration(created_by_or_key, animal_id, update_body, company_id)
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
               weight, gender, animal_type, status, color, notes, notes_mother, created_at,
               insemination_round_id, insemination_identifier, scrotal_circumference,
               rp_animal, rp_mother, mother_weight, weaning_weight
        FROM registrations
        WHERE {where_sql}
        ORDER BY id ASC
        """,
        tuple(params),
    )
    cols = [d[0] for d in cur.description]
    return [dict(zip(cols, r)) for r in cur.fetchall()]


# Multi-tenant functions
def get_registrations_multi_tenant(user: dict, limit: int = 100) -> list[dict]:
    """Get registrations with multi-tenant filtering"""
    try:
        company_id = user.get('company_id')
        firebase_uid = user.get('firebase_uid')
        
        where_clause, params = get_data_filter_clause(company_id, firebase_uid)
        params.append(limit)
        
        cursor = conn.execute(
            f"""
            SELECT id, animal_number, created_at, mother_id, born_date, weight, 
                   gender, status, color, notes, notes_mother, insemination_round_id,
                   insemination_identifier, scrotal_circumference, animal_type,
                   rp_animal, rp_mother, mother_weight, weaning_weight
            FROM registrations
            WHERE {where_clause}
            ORDER BY id DESC
            LIMIT ?
            """,
            params
        )
        
        rows = cursor.fetchall()
        return [
            {
                "id": row[0],
                "animalNumber": row[1],
                "createdAt": row[2],
                "motherId": row[3],
                "bornDate": row[4],
                "weight": row[5],
                "gender": row[6],
                "status": row[7],
                "color": row[8],
                "notes": row[9],
                "notesMother": row[10],
                "inseminationRoundId": row[11],
                "inseminationIdentifier": row[12],
                "scrotalCircumference": row[13],
                "animalType": row[14],
                "rpAnimal": row[15] if len(row) > 15 else None,
                "rpMother": row[16] if len(row) > 16 else None,
                "motherWeight": row[17] if len(row) > 17 else None,
                "weaningWeight": row[18] if len(row) > 18 else None
            }
            for row in rows
        ]
    except sqlite3.Error as e:
        raise HTTPException(status_code=500, detail=f"DB error: {e}")


def export_rows_multi_tenant(user: dict, date: str = None, start: str = None, end: str = None) -> list[dict]:
    """Export registrations with multi-tenant filtering"""
    try:
        company_id = user.get('company_id')
        firebase_uid = user.get('firebase_uid')
        
        where_clause, params = get_data_filter_clause(company_id, firebase_uid)
        
        if date:
            where_clause += " AND date(born_date) = date(?)"
            params.append(date)
        else:
            if start:
                where_clause += " AND date(born_date) >= date(?)"
                params.append(start)
            if end:
                where_clause += " AND date(born_date) <= date(?)"
                params.append(end)
        
        cursor = conn.execute(
            f"""
            SELECT animal_number, born_date, mother_id, father_id,
                   weight, gender, animal_type, status, color, notes, notes_mother, 
                   created_at, insemination_round_id, insemination_identifier, 
                   scrotal_circumference, rp_animal, rp_mother, mother_weight, weaning_weight
            FROM registrations
            WHERE {where_clause}
            ORDER BY id ASC
            """,
            tuple(params)
        )
        
        cols = [d[0] for d in cursor.description]
        return [dict(zip(cols, r)) for r in cursor.fetchall()]
    except sqlite3.Error as e:
        raise HTTPException(status_code=500, detail=f"DB error: {e}")


def get_registration_stats_multi_tenant(user: dict) -> dict:
    """Get registration statistics with multi-tenant filtering"""
    try:
        company_id = user.get('company_id')
        firebase_uid = user.get('firebase_uid')
        
        where_clause, params = get_data_filter_clause(company_id, firebase_uid)
        
        # Total registrations
        cursor = conn.execute(
            f"SELECT COUNT(*) FROM registrations WHERE {where_clause}",
            params
        )
        total_registrations = cursor.fetchone()[0]
        
        # By gender
        cursor = conn.execute(
            f"""
            SELECT gender, COUNT(*) 
            FROM registrations 
            WHERE {where_clause} AND gender IS NOT NULL
            GROUP BY gender
            """,
            params
        )
        gender_stats = dict(cursor.fetchall())
        
        # By animal type
        cursor = conn.execute(
            f"""
            SELECT animal_type, COUNT(*) 
            FROM registrations 
            WHERE {where_clause} AND animal_type IS NOT NULL
            GROUP BY animal_type
            """,
            params
        )
        animal_type_stats = dict(cursor.fetchall())
        
        # Recent registrations (last 30 days)
        cursor = conn.execute(
            f"""
            SELECT COUNT(*) 
            FROM registrations 
            WHERE {where_clause} 
            AND date(created_at) >= date('now', '-30 days')
            """,
            params
        )
        recent_registrations = cursor.fetchone()[0]
        
        return {
            "total_registrations": total_registrations,
            "gender_stats": gender_stats,
            "animal_type_stats": animal_type_stats,
            "recent_registrations": recent_registrations,
            "company_id": company_id,
            "is_company_data": company_id is not None
        }
    except sqlite3.Error as e:
        raise HTTPException(status_code=500, detail=f"DB error: {e}")


