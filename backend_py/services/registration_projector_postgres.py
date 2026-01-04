"""
Registration Projector Service - PostgreSQL Async Implementation

This module provides async PostgreSQL implementations for projecting snapshot data into the registrations table.
The registrations table is a derived projection from events/snapshots, NOT the source of truth.

Key principles:
- Registrations are derived from snapshots (which come from events)
- This ensures registrations stay in sync with event-sourced data
- Export/dashboard functions continue to read from registrations unchanged
"""

import logging
import secrets
from datetime import datetime
from typing import Dict, Optional, Any
from ..db_postgres import DatabaseConnection

logger = logging.getLogger(__name__)


def generate_short_id() -> str:
    """Generate a unique short_id for registrations."""
    # Generate random hex string (Postgres equivalent of SQLite randomblob)
    return secrets.token_hex(5)[:10].upper()


def _convert_to_date(date_str: Optional[str]) -> Optional[Any]:
    """Convert ISO date string to date object or None."""
    if not date_str:
        return None
    try:
        if isinstance(date_str, str):
            # Parse ISO format
            if 'T' in date_str:
                return datetime.fromisoformat(date_str.replace('Z', '+00:00')).date()
            else:
                return datetime.strptime(date_str, '%Y-%m-%d').date()
        return date_str
    except:
        return date_str


async def project_registration_from_snapshot(
    animal_id: int,
    snapshot: Dict[str, Any],
    created_by: str,
    created_at: str,
) -> int:
    """
    Project snapshot data into the registrations table (PostgreSQL async).
    
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
    
    # Convert date strings to date objects
    born_date_obj = _convert_to_date(born_date)
    death_date_obj = _convert_to_date(death_date)
    sold_date_obj = _convert_to_date(sold_date)
    
    # Convert created_at to timestamp
    try:
        if isinstance(created_at, str):
            created_at_ts = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
        else:
            created_at_ts = created_at
    except:
        created_at_ts = datetime.utcnow()
    
    # Determine animal_type based on gender
    animal_type = None
    if gender:
        if gender == 'FEMALE':
            animal_type = 1  # Cow
        elif gender == 'MALE':
            animal_type = 2  # Bull
    
    try:
        async with DatabaseConnection(company_id) as conn:
            # Check if registration already exists
            existing = await conn.fetchrow(
                "SELECT id, short_id FROM registrations WHERE id = $1",
                animal_id
            )
            
            if existing:
                # UPDATE existing registration
                await conn.execute(
                    """
                    UPDATE registrations SET
                        animal_number = $1,
                        mother_id = $2,
                        father_id = $3,
                        born_date = $4,
                        weight = $5,
                        current_weight = $6,
                        gender = $7,
                        animal_type = $8,
                        status = $9,
                        color = $10,
                        notes = $11,
                        notes_mother = $12,
                        insemination_round_id = $13,
                        insemination_identifier = $14,
                        scrotal_circumference = $15,
                        rp_animal = $16,
                        rp_mother = $17,
                        mother_weight = $18,
                        weaning_weight = $19,
                        death_date = $20,
                        sold_date = $21,
                        animal_idv = $22,
                        updated_at = NOW()
                    WHERE id = $23
                    """,
                    animal_number,
                    mother_id,
                    father_id,
                    born_date_obj,
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
                    death_date_obj,
                    sold_date_obj,
                    animal_idv,
                    animal_id,
                )
                logger.debug(f"Updated registration for animal_id={animal_id}")
            else:
                # INSERT new registration
                short_id = generate_short_id()
                await conn.execute(
                    """
                    INSERT INTO registrations (
                        id, animal_number, created_at, user_key, created_by, company_id,
                        mother_id, father_id, born_date, weight, current_weight, gender, animal_type, 
                        status, color, notes, notes_mother, short_id,
                        insemination_round_id, insemination_identifier, scrotal_circumference, 
                        rp_animal, rp_mother, mother_weight, weaning_weight,
                        death_date, sold_date, animal_idv
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28)
                    """,
                    animal_id,
                    animal_number,
                    created_at_ts,
                    None,  # legacy user_key deprecated
                    created_by,
                    company_id,
                    mother_id,
                    father_id,
                    born_date_obj,
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
                    death_date_obj,
                    sold_date_obj,
                    animal_idv,
                )
                logger.debug(f"Inserted registration for animal_id={animal_id}")
            
            return animal_id
            
    except Exception as e:
        logger.error(f"Error projecting registration for animal_id={animal_id}: {e}")
        raise


async def project_registration_from_snapshot_data(
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
    
    return await project_registration_from_snapshot(
        animal_id=animal_id,
        snapshot=snapshot,
        created_by=created_by,
        created_at=created_at,
    )

