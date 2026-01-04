"""
Registration Projector Service

This module projects snapshot data into the registrations table.
The registrations table is a derived projection from events/snapshots,
NOT the source of truth.

Key principles:
- Registrations are derived from snapshots (which come from events)
- This ensures registrations stay in sync with event-sourced data
- Export/dashboard functions continue to read from registrations unchanged
"""

import logging
import sqlite3
from datetime import datetime
from typing import Dict, Optional, Any

from ..db import conn

logger = logging.getLogger(__name__)


def generate_short_id() -> str:
    """Generate a unique short_id for registrations."""
    cursor = conn.execute(
        "SELECT substr(replace(hex(randomblob(16)), 'E', ''), 1, 10)"
    )
    return cursor.fetchone()[0]


def project_registration_from_snapshot(
    animal_id: int,
    snapshot: Dict[str, Any],
    created_by: str,
    created_at: str,
) -> int:
    """
    Project snapshot data into the registrations table.
    
    This is a derived write - the registration is populated from snapshot data,
    which itself is derived from domain events.
    
    Args:
        animal_id: The animal ID (used as registration id)
        snapshot: The snapshot data to project
        created_by: User who created the registration
        created_at: Creation timestamp
    
    Returns:
        The registration ID
    """
    if not snapshot:
        logger.warning(f"Cannot project registration for animal_id={animal_id}: no snapshot")
        return animal_id
    
    # Map snapshot fields to registration fields
    animal_number = snapshot.get('animal_number')
    company_id = snapshot.get('company_id')
    
    if not animal_number:
        logger.warning(f"Cannot project registration: missing animal_number in snapshot")
        return animal_id
    
    # Map snapshot -> registration field names
    mother_id = snapshot.get('mother_id')
    father_id = snapshot.get('father_id')
    born_date = snapshot.get('birth_date')  # snapshot uses birth_date
    weight = snapshot.get('current_weight')  # Use current_weight for birth weight
    current_weight = snapshot.get('current_weight')
    gender = snapshot.get('gender')
    status = snapshot.get('current_status')  # snapshot uses current_status
    color = snapshot.get('color')
    notes = snapshot.get('notes')
    notes_mother = snapshot.get('notes_mother')
    insemination_round_id = snapshot.get('insemination_round_id')
    insemination_identifier = snapshot.get('insemination_identifier')
    scrotal_circumference = snapshot.get('scrotal_circumference')
    rp_animal = snapshot.get('rp_animal')
    rp_mother = snapshot.get('rp_mother')
    mother_weight = snapshot.get('mother_weight')
    weaning_weight = snapshot.get('weaning_weight')
    death_date = snapshot.get('death_date')
    sold_date = snapshot.get('sold_date')
    animal_idv = snapshot.get('animal_idv')
    
    # Determine animal_type based on gender
    animal_type = None
    if gender:
        if gender == 'FEMALE':
            animal_type = 1  # Cow
        elif gender == 'MALE':
            animal_type = 2  # Bull
    
    try:
        # Check if registration already exists
        cursor = conn.execute(
            "SELECT id, short_id FROM registrations WHERE id = ?",
            (animal_id,)
        )
        existing = cursor.fetchone()
        
        if existing:
            # UPDATE existing registration
            conn.execute(
                """
                UPDATE registrations SET
                    animal_number = ?,
                    mother_id = ?,
                    father_id = ?,
                    born_date = ?,
                    weight = ?,
                    current_weight = ?,
                    gender = ?,
                    animal_type = ?,
                    status = ?,
                    color = ?,
                    notes = ?,
                    notes_mother = ?,
                    insemination_round_id = ?,
                    insemination_identifier = ?,
                    scrotal_circumference = ?,
                    rp_animal = ?,
                    rp_mother = ?,
                    mother_weight = ?,
                    weaning_weight = ?,
                    death_date = ?,
                    sold_date = ?,
                    animal_idv = ?,
                    updated_at = datetime('now')
                WHERE id = ?
                """,
                (
                    animal_number,
                    mother_id,
                    father_id,
                    born_date,
                    weight,
                    current_weight,
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
                    death_date,
                    sold_date,
                    animal_idv,
                    animal_id,
                )
            )
            conn.commit()
            logger.debug(f"Updated registration for animal_id={animal_id}")
        else:
            # INSERT new registration
            short_id = generate_short_id()
            conn.execute(
                """
                INSERT INTO registrations (
                    id, animal_number, created_at, user_key, created_by, company_id,
                    mother_id, father_id, born_date, weight, current_weight, gender, animal_type, 
                    status, color, notes, notes_mother, short_id,
                    insemination_round_id, insemination_identifier, scrotal_circumference, 
                    rp_animal, rp_mother, mother_weight, weaning_weight,
                    death_date, sold_date, animal_idv
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    animal_id,
                    animal_number,
                    created_at,
                    None,  # legacy user_key deprecated
                    created_by,
                    company_id,
                    mother_id,
                    father_id,
                    born_date,
                    weight,
                    current_weight,
                    gender,
                    animal_type,
                    status,
                    color,
                    notes,
                    notes_mother,
                    short_id,
                    insemination_round_id,
                    insemination_identifier,
                    scrotal_circumference,
                    rp_animal,
                    rp_mother,
                    mother_weight,
                    weaning_weight,
                    death_date,
                    sold_date,
                    animal_idv,
                )
            )
            conn.commit()
            logger.debug(f"Inserted registration for animal_id={animal_id}")
        
        return animal_id
        
    except sqlite3.Error as e:
        logger.error(f"Error projecting registration for animal_id={animal_id}: {e}")
        raise


def project_registration_from_snapshot_data(
    animal_id: int,
    animal_number: str,
    company_id: int,
    created_by: str,
    created_at: str,
    born_date: Optional[str] = None,
    weight: Optional[float] = None,
    current_weight: Optional[float] = None,
    gender: Optional[str] = None,
    status: Optional[str] = None,
    color: Optional[str] = None,
    mother_id: Optional[str] = None,
    father_id: Optional[str] = None,
    notes: Optional[str] = None,
    notes_mother: Optional[str] = None,
    rp_animal: Optional[str] = None,
    rp_mother: Optional[str] = None,
    mother_weight: Optional[float] = None,
    weaning_weight: Optional[float] = None,
    scrotal_circumference: Optional[float] = None,
    insemination_round_id: Optional[str] = None,
    insemination_identifier: Optional[str] = None,
    death_date: Optional[str] = None,
    sold_date: Optional[str] = None,
    animal_idv: Optional[str] = None,
) -> int:
    """
    Project registration from individual field values.
    
    Convenience wrapper when you have individual fields instead of a snapshot dict.
    
    Returns:
        The registration ID
    """
    snapshot = {
        'animal_number': animal_number,
        'company_id': company_id,
        'birth_date': born_date,
        'current_weight': current_weight or weight,
        'gender': gender,
        'current_status': status,
        'color': color,
        'mother_id': mother_id,
        'father_id': father_id,
        'notes': notes,
        'notes_mother': notes_mother,
        'rp_animal': rp_animal,
        'rp_mother': rp_mother,
        'mother_weight': mother_weight,
        'weaning_weight': weaning_weight,
        'scrotal_circumference': scrotal_circumference,
        'insemination_round_id': insemination_round_id,
        'insemination_identifier': insemination_identifier,
        'death_date': death_date,
        'sold_date': sold_date,
        'animal_idv': animal_idv,
    }
    
    return project_registration_from_snapshot(
        animal_id=animal_id,
        snapshot=snapshot,
        created_by=created_by,
        created_at=created_at,
    )

