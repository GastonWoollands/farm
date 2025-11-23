import sqlite3
import datetime as _dt
from fastapi import HTTPException
from ..db import conn
from ..models import InseminationBody, UpdateInseminationBody
from .auth_service import get_data_filter_clause

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
            
            # Trigger background father assignment for this mother
            # This runs in a separate thread and doesn't block the response
            try:
                from .father_assignment_background import trigger_father_assignment_for_mother
                trigger_father_assignment_for_mother(mother_id)
            except Exception as e:
                # Log but don't fail the request if background task fails
                import logging
                logging.warning(f"Failed to trigger background father assignment for {mother_id}: {e}")
            
            return insemination_db_id
    except sqlite3.IntegrityError as e:
        if "UNIQUE constraint failed" in str(e):
            raise HTTPException(status_code=409, detail="Duplicate insemination for this mother on the same date")
        raise HTTPException(status_code=500, detail=f"Database integrity error: {e}")
    except sqlite3.Error as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")

def update_insemination(created_by: str, insemination_id: int, body: UpdateInseminationBody) -> None:
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
            # Check if insemination exists and belongs to user
            cursor = conn.execute(
                """
                SELECT id FROM inseminations 
                WHERE id = ? AND created_by = ?
                """,
                (insemination_id, created_by)
            )
            if not cursor.fetchone():
                raise HTTPException(status_code=404, detail="Insemination record not found or access denied")
            
            # Update the record
            conn.execute(
                """
                UPDATE inseminations SET
                    insemination_identifier = ?, insemination_round_id = ?, mother_id = ?, mother_visual_id = ?, 
                    bull_id = ?, insemination_date = ?, animal_type = ?, notes = ?, updated_at = datetime('now')
                WHERE id = ?
                """,
                (
                    insemination_identifier, insemination_round_id, mother_id, mother_visual_id,
                    bull_id, insemination_date, animal_type, notes, insemination_id
                )
            )
    except sqlite3.IntegrityError as e:
        if "UNIQUE constraint failed" in str(e):
            raise HTTPException(status_code=409, detail="Duplicate insemination for this mother on the same date")
        raise HTTPException(status_code=500, detail=f"Database integrity error: {e}")
    except sqlite3.Error as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")

def delete_insemination(created_by: str, insemination_id: int) -> None:
    """Delete an insemination record"""
    try:
        with conn:
            cursor = conn.execute(
                """
                DELETE FROM inseminations
                WHERE id = ? AND created_by = ?
                """,
                (insemination_id, created_by)
            )
            if cursor.rowcount == 0:
                raise HTTPException(status_code=404, detail="Insemination record not found or access denied")
    except sqlite3.Error as e:
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
    except sqlite3.Error as e:
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
    except sqlite3.Error as e:
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
    except sqlite3.Error as e:
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
    except sqlite3.Error as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")
