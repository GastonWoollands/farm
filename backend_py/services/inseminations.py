import datetime as _dt
import logging
from fastapi import HTTPException
from psycopg2 import Error as PostgresError, IntegrityError
from ..db import conn
from ..models import InseminationBody, UpdateInseminationBody
from .auth_service import get_data_filter_clause
from .event_emitter import (
    emit_insemination_recorded,
    emit_insemination_cancelled,
    emit_field_change,
)
from .snapshot_projector import project_animal_snapshot_by_number, project_animal_snapshot
from ..events.event_types import EventType

def _normalize_text(value: str | None) -> str | None:
    """Normalize text input - strip whitespace and convert to uppercase"""
    return (value or "").strip().upper() or None

def _validate_date(date_str: str) -> str:
    """Validate and normalize date string to YYYY-MM-DD format
    
    Prioritizes dd/mm/yyyy format for better user-friendliness.
    Supports: dd/mm/yyyy, yyyy-mm-dd, dd-mm-yyyy, and other common formats.
    """
    if not date_str:
        raise HTTPException(status_code=400, detail="Date is required")
    
    try:
        # Try to parse the date and return in YYYY-MM-DD format
        if isinstance(date_str, str):
            # Handle various date formats
            date_str = date_str.strip()
            
            # Try ISO format first (for API consistency)
            try:
                parsed_date = _dt.datetime.fromisoformat(date_str.replace('Z', '+00:00'))
                return parsed_date.strftime("%Y-%m-%d")
            except ValueError:
                pass
            
            # Prioritize dd/mm/yyyy format (user-friendly format)
            formats = [
                "%d/%m/%Y",       # 15/01/2024 (PRIORITY - dd/mm/yyyy)
                "%d/%m/%y",       # 15/01/24 (short year)
                "%d-%m-%Y",       # 15-01-2024
                "%Y-%m-%d",       # 2024-01-15
                "%m/%d/%Y",       # 01/15/2024 (fallback for mm/dd/yyyy)
                "%Y-%m-%d %H:%M:%S",  # 2024-01-15 10:30:00
            ]
            
            for fmt in formats:
                try:
                    parsed_date = _dt.datetime.strptime(date_str, fmt)
                    return parsed_date.strftime("%Y-%m-%d")
                except ValueError:
                    continue
            
            raise ValueError(f"Could not parse date: {date_str}. Expected format: dd/mm/yyyy (e.g., 15/01/2024)")
        else:
            # If it's already a datetime object
            if hasattr(date_str, 'strftime'):
                return date_str.strftime("%Y-%m-%d")
            else:
                raise ValueError(f"Invalid date type: {type(date_str)}")
                
    except Exception as e:
        error_msg = str(e)
        if "Could not parse date" in error_msg:
            raise HTTPException(status_code=400, detail=f"Invalid date format: {error_msg}")
        raise HTTPException(status_code=400, detail=f"Invalid date format: {error_msg}. Use dd/mm/yyyy format (e.g., 15/01/2024)")

def insert_insemination(created_by: str, body: InseminationBody, company_id: int = None) -> int:
    """Insert a new insemination record and trigger background father assignment"""
    if not body.inseminationIdentifier:
        raise HTTPException(status_code=400, detail="inseminationIdentifier is required")
    
    if not body.inseminationRoundId:
        raise HTTPException(status_code=400, detail="inseminationRoundId is required")
    
    if not body.motherId:
        raise HTTPException(status_code=400, detail="motherId is required")
    
    if not body.inseminationDate:
        raise HTTPException(status_code=400, detail="inseminationDate is required")
    
    # Validate and normalize inputs
    insemination_id = _normalize_text(body.inseminationIdentifier)
    insemination_round_id = _normalize_text(body.inseminationRoundId)
    mother_id = _normalize_text(body.motherId)
    mother_visual_id = _normalize_text(body.motherVisualId) if body.motherVisualId else None
    bull_id = _normalize_text(body.bullId)
    insemination_date = _validate_date(body.inseminationDate)
    animal_type = _normalize_text(body.animalType)
    notes = _normalize_text(body.notes)
    
    # No need to verify mother exists in registrations - inseminations can be for unregistered cows
    
    try:
        with conn:
            cursor = conn.execute(
                """
                INSERT INTO inseminations (
                    insemination_identifier, insemination_round_id, mother_id, mother_visual_id, bull_id,
                    insemination_date, animal_type, notes, created_by, company_id
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    insemination_id,
                    insemination_round_id,
                    mother_id,
                    mother_visual_id,
                    bull_id,
                    insemination_date,
                    animal_type,
                    notes,
                    created_by,
                    company_id
                )
            )
            insemination_db_id = cursor.lastrowid
            
            # Emit domain event (Event Sourcing)
            if company_id:
                try:
                    # Check if mother already has events
                    from .event_emitter import ensure_animal_has_events, get_events_for_animal_by_number
                    from .snapshot_projector import get_snapshot_by_number
                    
                    mother_events = get_events_for_animal_by_number(mother_id, company_id)
                    snapshot_projected = False
                    
                    if len(mother_events) > 0:
                        # Mother has events - update values from snapshot
                        mother_snapshot = get_snapshot_by_number(mother_id, company_id)
                        
                        if mother_snapshot:
                            old_rp_animal = mother_snapshot.get('rp_animal')
                            mother_animal_id = mother_snapshot.get('animal_id')
                            
                            # Emit RP_ANIMAL_UPDATED if mother_visual_id is different
                            if mother_visual_id and mother_visual_id != old_rp_animal:
                                emit_field_change(
                                    event_type=EventType.RP_ANIMAL_UPDATED,
                                    animal_id=mother_animal_id,  # Can be None
                                    animal_number=mother_id,
                                    company_id=company_id,
                                    user_id=created_by,
                                    field_name='rp_animal',
                                    old_value=old_rp_animal or None,
                                    new_value=mother_visual_id,
                                    notes=f"Actualizado desde inseminación",
                                )
                                # Project snapshot after update event
                                if mother_animal_id:
                                    project_animal_snapshot(mother_animal_id, company_id)
                                else:
                                    project_animal_snapshot_by_number(mother_id, company_id)
                                snapshot_projected = True
                    else:
                        # Mother has no events - create them
                        ensure_animal_has_events(
                            animal_number=mother_id,
                            company_id=company_id,
                            user_id=created_by,
                            gender='FEMALE',
                            status='ALIVE',
                            rp_animal=mother_visual_id,
                        )
                        project_animal_snapshot_by_number(mother_id, company_id)
                        snapshot_projected = True
                    
                    # Emit insemination event
                    emit_insemination_recorded(
                        animal_number=mother_id,  # mother_id serves as animal identifier
                        company_id=company_id,
                        user_id=created_by,
                        insemination_id=insemination_db_id,
                        insemination_identifier=insemination_id,
                        insemination_round_id=insemination_round_id,
                        mother_id=mother_id,
                        insemination_date=insemination_date,
                        mother_visual_id=mother_visual_id,
                        bull_id=bull_id,
                        animal_type=animal_type,
                        notes=notes,
                    )
                    
                    # Project snapshot after insemination event (if not already projected)
                    if not snapshot_projected:
                        project_animal_snapshot_by_number(mother_id, company_id)
                except Exception as e:
                    logging.warning(f"Failed to emit insemination event for {mother_id}: {e}")
            
            # Trigger background father assignment for this mother
            # This runs in a separate thread and doesn't block the response
            try:
                from .father_assignment_background import trigger_father_assignment_for_mother
                trigger_father_assignment_for_mother(mother_id)
            except Exception as e:
                # Log but don't fail the request if background task fails
                logging.warning(f"Failed to trigger background father assignment for {mother_id}: {e}")
            
            return insemination_db_id
    except IntegrityError as e:
        if "UNIQUE constraint failed" in str(e):
            raise HTTPException(status_code=409, detail="Duplicate insemination for this mother on the same date")
        raise HTTPException(status_code=500, detail=f"Database integrity error: {e}")
    except PostgresError as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")

def update_insemination(created_by: str, insemination_id: int, body: UpdateInseminationBody, company_id: int = None) -> None:
    """Update an existing insemination record"""
    if not body.inseminationIdentifier:
        raise HTTPException(status_code=400, detail="inseminationIdentifier is required")
    
    if not body.inseminationRoundId:
        raise HTTPException(status_code=400, detail="inseminationRoundId is required")
    
    if not body.motherId:
        raise HTTPException(status_code=400, detail="motherId is required")
    
    if not body.inseminationDate:
        raise HTTPException(status_code=400, detail="inseminationDate is required")
    
    # Validate and normalize inputs
    insemination_identifier = _normalize_text(body.inseminationIdentifier)
    insemination_round_id = _normalize_text(body.inseminationRoundId)
    mother_id = _normalize_text(body.motherId)
    mother_visual_id = _normalize_text(body.motherVisualId) if body.motherVisualId else None
    bull_id = _normalize_text(body.bullId)
    insemination_date = _validate_date(body.inseminationDate)
    animal_type = _normalize_text(body.animalType)
    notes = _normalize_text(body.notes)
    
    try:
        with conn:
            # Check if insemination exists and belongs to user, get current values
            cursor = conn.execute(
                """
                SELECT id, insemination_date, bull_id, notes, company_id
                FROM inseminations 
                WHERE id = ? AND created_by = ?
                """,
                (insemination_id, created_by)
            )
            record = cursor.fetchone()
            if not record:
                raise HTTPException(status_code=404, detail="Insemination record not found or access denied")
            
            # Store old values for event emission
            old_insemination_date = record[1]
            old_bull_id = record[2]
            old_notes = record[3]
            record_company_id = record[4] or company_id
            
            # Update the record
            conn.execute(
                """
                UPDATE inseminations SET
                    insemination_identifier = ?, insemination_round_id = ?, mother_id = ?, mother_visual_id = ?, 
                    bull_id = ?, insemination_date = ?, animal_type = ?, notes = ?, updated_at = NOW()
                WHERE id = ?
                """,
                (
                    insemination_identifier, insemination_round_id, mother_id, mother_visual_id,
                    bull_id, insemination_date, animal_type, notes, insemination_id
                )
            )
            
            # Emit domain events for changes (Event Sourcing)
            if record_company_id:
                try:
                    # Track insemination date changes
                    if old_insemination_date != insemination_date:
                        emit_field_change(
                            event_type=EventType.INSEMINATION_DATE_CORRECTED,
                            animal_id=None,
                            animal_number=mother_id,
                            company_id=record_company_id,
                            user_id=created_by,
                            field_name='insemination_date',
                            old_value=old_insemination_date,
                            new_value=insemination_date,
                            notes=notes,
                        )
                    
                    # Track bull_id changes
                    if old_bull_id != bull_id:
                        emit_field_change(
                            event_type=EventType.BULL_ASSIGNED,
                            animal_id=None,
                            animal_number=mother_id,
                            company_id=record_company_id,
                            user_id=created_by,
                            field_name='bull_id',
                            old_value=old_bull_id,
                            new_value=bull_id,
                            notes=notes,
                        )
                    
                    # Track notes changes
                    if old_notes != notes:
                        emit_field_change(
                            event_type=EventType.INSEMINATION_NOTES_UPDATED,
                            animal_id=None,
                            animal_number=mother_id,
                            company_id=record_company_id,
                            user_id=created_by,
                            field_name='notes',
                            old_value=old_notes,
                            new_value=notes,
                            notes=notes,
                        )
                    
                    # Project snapshot for mother after all update events
                    if old_insemination_date != insemination_date or old_bull_id != bull_id or old_notes != notes:
                        project_animal_snapshot_by_number(mother_id, record_company_id)
                except Exception as e:
                    logging.warning(f"Failed to emit insemination update events: {e}")
                    
    except IntegrityError as e:
        if "UNIQUE constraint failed" in str(e):
            raise HTTPException(status_code=409, detail="Duplicate insemination for this mother on the same date")
        raise HTTPException(status_code=500, detail=f"Database integrity error: {e}")
    except PostgresError as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")

def delete_insemination(created_by: str, insemination_id: int, company_id: int = None) -> None:
    """Delete an insemination record.
    
    Note: This still performs a DELETE for backward compatibility with triggers,
    but also emits an insemination_cancelled event for the new event sourcing system.
    In the future, consider soft-delete with a 'cancelled' status instead.
    """
    try:
        with conn:
            # First, get the insemination details for the event
            cursor = conn.execute(
                """
                SELECT mother_id, insemination_date, bull_id, company_id
                FROM inseminations
                WHERE id = ? AND created_by = ?
                """,
                (insemination_id, created_by)
            )
            record = cursor.fetchone()
            if not record:
                raise HTTPException(status_code=404, detail="Insemination record not found or access denied")
            
            mother_id = record[0]
            insemination_date = record[1]
            bull_id = record[2]
            record_company_id = record[3] or company_id
            
            # Emit cancellation event before delete (Event Sourcing)
            if record_company_id:
                try:
                    emit_insemination_cancelled(
                        animal_number=mother_id,
                        company_id=record_company_id,
                        user_id=created_by,
                        insemination_id=insemination_id,
                        insemination_date=insemination_date,
                        reason="User requested deletion",
                        previous_bull_id=bull_id,
                    )
                    # Project snapshot for mother after cancellation event
                    project_animal_snapshot_by_number(mother_id, record_company_id)
                except Exception as e:
                    logging.warning(f"Failed to emit insemination_cancelled event: {e}")
            
            # Perform the delete (triggers still emit eliminacion_inseminacion for legacy)
            cursor = conn.execute(
                """
                DELETE FROM inseminations
                WHERE id = ? AND created_by = ?
                """,
                (insemination_id, created_by)
            )
            if cursor.rowcount == 0:
                raise HTTPException(status_code=404, detail="Insemination record not found or access denied")
    except PostgresError as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")

def get_inseminations_by_cow(created_by: str, mother_id: int) -> list[dict]:
    """Get all inseminations for a specific cow"""
    try:
        cursor = conn.execute(
            """
            SELECT i.id, i.insemination_identifier, i.insemination_round_id, i.mother_id, i.mother_visual_id,
                   i.bull_id, i.insemination_date, i.registration_date, i.animal_type, i.notes,
                   i.created_by, i.updated_at
            FROM inseminations i
            WHERE i.mother_id = ? AND i.created_by = ?
            ORDER BY i.insemination_date DESC
            """,
            (mother_id, created_by)
        )
        rows = cursor.fetchall()
        return [
            {
                "id": row[0],
                "inseminationIdentifier": row[1],
                "inseminationRoundId": row[2],
                "motherId": row[3],
                "motherVisualId": row[4],
                "bullId": row[5],
                "inseminationDate": row[6],
                "registrationDate": row[7],
                "animalType": row[8],
                "notes": row[9],
                "createdBy": row[10],
                "updatedAt": row[11]
            }
            for row in rows
        ]
    except PostgresError as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")

def get_inseminations_by_user(created_by: str, limit: int = 100) -> list[dict]:
    """Get recent inseminations for a user"""
    try:
        cursor = conn.execute(
            """
            SELECT i.id, i.insemination_identifier, i.insemination_round_id, i.mother_id, i.mother_visual_id,
                   i.bull_id, i.insemination_date, i.registration_date, i.animal_type, i.notes,
                   i.created_by, i.updated_at, r.animal_number
            FROM inseminations i
            JOIN registrations r ON i.mother_id = r.id
            WHERE i.created_by = ?
            ORDER BY i.insemination_date DESC
            LIMIT ?
            """,
            (created_by, limit)
        )
        rows = cursor.fetchall()
        return [
            {
                "id": row[0],
                "inseminationIdentifier": row[1],
                "motherId": row[2],
                "motherVisualId": row[3],
                "bullId": row[4],
                "inseminationDate": row[5],
                "registrationDate": row[6],
                "animalType": row[7],
                "notes": row[8],
                "createdBy": row[9],
                "updatedAt": row[10],
                "cowNumber": row[11]
            }
            for row in rows
        ]
    except PostgresError as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")

def get_insemination_statistics(created_by: str) -> dict:
    """Get insemination statistics for a user"""
    try:
        # Total inseminations
        cursor = conn.execute(
            "SELECT COUNT(*) FROM inseminations WHERE created_by = ?",
            (created_by,)
        )
        total_inseminations = cursor.fetchone()[0]
        
        # Unique cows inseminated
        cursor = conn.execute(
            "SELECT COUNT(DISTINCT mother_id) FROM inseminations WHERE created_by = ?",
            (created_by,)
        )
        unique_cows = cursor.fetchone()[0]
        
        # Unique bulls used
        cursor = conn.execute(
            "SELECT COUNT(DISTINCT bull_id) FROM inseminations WHERE created_by = ? AND bull_id IS NOT NULL",
            (created_by,)
        )
        unique_bulls = cursor.fetchone()[0]
        
        # Recent inseminations (last 30 days)
        cursor = conn.execute(
            """
            SELECT COUNT(*) FROM inseminations 
            WHERE created_by = ? AND julianday('now') - julianday(insemination_date) <= 30
            """,
            (created_by,)
        )
        recent_inseminations = cursor.fetchone()[0]
        
        return {
            "totalInseminations": total_inseminations,
            "uniqueCows": unique_cows,
            "uniqueBulls": unique_bulls,
            "recentInseminations": recent_inseminations
        }
    except PostgresError as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")

def export_inseminations(created_by: str, start_date: str = None, end_date: str = None) -> list[dict]:
    """Export insemination records for a user with optional date filtering"""
    where_conditions = ["i.created_by = ?"]
    params = [created_by]
    
    if start_date:
        where_conditions.append("date(i.insemination_date) >= date(?)")
        params.append(start_date)
    
    if end_date:
        where_conditions.append("date(i.insemination_date) <= date(?)")
        params.append(end_date)
    
    where_clause = " AND ".join(where_conditions)
    
    try:
        cursor = conn.execute(
            f"""
            SELECT i.insemination_identifier, i.insemination_round_id, i.mother_visual_id, i.bull_id,
                   i.insemination_date, i.registration_date, i.animal_type, i.notes,
                   r.animal_number, r.gender, r.status
            FROM inseminations i
            JOIN registrations r ON i.mother_id = r.id
            WHERE {where_clause}
            ORDER BY i.insemination_date DESC
            """,
            tuple(params)
        )
        rows = cursor.fetchall()
        return [
            {
                "inseminationIdentifier": row[0],
                "inseminationRoundId": row[1],
                "motherVisualId": row[2],
                "bullId": row[3],
                "inseminationDate": row[4],
                "registrationDate": row[5],
                "animalType": row[6],
                "notes": row[7],
                "cowNumber": row[8],
                "cowGender": row[9],
                "cowStatus": row[10]
            }
            for row in rows
        ]
    except PostgresError as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")
