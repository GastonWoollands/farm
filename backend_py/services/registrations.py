import sqlite3
import json
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
    ensure_animal_has_events,
    get_events_for_animal_by_number,
)
from .snapshot_projector import project_animal_snapshot, project_animal_snapshot_by_number, get_snapshot_by_number, get_snapshot
from .registration_projector import project_registration_from_snapshot
from ..events.event_types import EventType

VALID_GENDERS = {"MALE", "FEMALE", "UNKNOWN"}
VALID_STATUSES = {"ALIVE", "DEAD", "UNKNOWN", "SOLD"}
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
    animal_idv = _normalize_text(body.animalIdv) if hasattr(body, 'animalIdv') else None

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

    # Handle current_weight validation
    current_weight = None
    if body.currentWeight is not None:
        try:
            current_weight = float(body.currentWeight)
            if not (0 <= current_weight <= 10000):
                raise HTTPException(status_code=400, detail="Current weight must be between 0 and 10000 kg")
        except (ValueError, TypeError):
            raise HTTPException(status_code=400, detail="Invalid current weight value")

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

    # Handle optional death_date (YYYY-MM-DD)
    death_date = None
    if hasattr(body, "deathDate") and body.deathDate:
        try:
            _dt.datetime.strptime(body.deathDate, "%Y-%m-%d")
            death_date = body.deathDate
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid deathDate format. Use YYYY-MM-DD")

    # Auto-set death_date if status is DEAD and not provided
    if status == "DEAD" and not death_date:
        death_date = _dt.datetime.utcnow().strftime("%Y-%m-%d")

    # Handle optional sold_date (YYYY-MM-DD)
    sold_date = None
    if hasattr(body, "soldDate") and body.soldDate:
        try:
            _dt.datetime.strptime(body.soldDate, "%Y-%m-%d")
            sold_date = body.soldDate
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid soldDate format. Use YYYY-MM-DD")

    # Auto-set sold_date if status is SOLD and not provided
    if status == "SOLD" and not sold_date:
        sold_date = _dt.datetime.utcnow().strftime("%Y-%m-%d")

    try:
        with conn:
            # Check if animal has domain events indicating it's a mother/father
            # Mothers/fathers should NOT be in registrations table
            if company_id:
                existing_events = get_events_for_animal_by_number(animal, company_id)
                if len(existing_events) > 0:
                    # Check if this is a mother_registered or father_registered event
                    for event in existing_events:
                        event_type = event.get('event_type', '')
                        if event_type in ['mother_registered', 'father_registered']:
                            raise HTTPException(
                                status_code=400,
                                detail=f"Animal {animal} is a mother/father and should not be in registrations table. Use update-by-number endpoint instead."
                            )
            
            # =========================================================================
            # EVENT-FIRST ARCHITECTURE
            # 1. Get animal_id (minimal INSERT to reserve ID)
            # 2. Emit event FIRST (source of truth)
            # 3. Project snapshot (derived from events)
            # 4. Project registration from snapshot (derived, for backwards compatibility)
            # =========================================================================
            
            # Step 1: Reserve animal_id with minimal INSERT
            cursor = conn.execute(
                """
                INSERT INTO registrations (
                    animal_number, created_at, created_by, company_id, short_id
                )
                VALUES (?, ?, ?, ?, substr(replace(hex(randomblob(16)), 'E', ''), 1, 10))
                """,
                (animal, created_at, created_by_or_key, company_id)
            )
            animal_id = cursor.lastrowid
            
            # Step 2: Emit domain event FIRST (source of truth)
            if company_id:
                try:
                    # Check if animal already has domain events (e.g., mother_registered, father_registered)
                    existing_events = get_events_for_animal_by_number(animal, company_id)
                    
                    if len(existing_events) > 0:
                        # Animal already has events - emit update events instead of birth_registered
                        old_values = {
                            'weight': None,
                            'current_weight': None,
                            'gender': None,
                            'status': None,
                            'color': None,
                            'notes': None,
                            'rp_animal': None,
                        }
                        
                        # Extract old values from existing events
                        for event in existing_events:
                            if event.get('payload'):
                                payload = event['payload'] if isinstance(event['payload'], dict) else json.loads(event['payload'])
                                if not old_values['weight'] and payload.get('weight'):
                                    old_values['weight'] = payload.get('weight')
                                if not old_values['current_weight'] and payload.get('current_weight'):
                                    old_values['current_weight'] = payload.get('current_weight')
                                if not old_values['gender'] and payload.get('gender'):
                                    old_values['gender'] = payload.get('gender')
                                if not old_values['status'] and payload.get('status'):
                                    old_values['status'] = payload.get('status')
                                if not old_values['color'] and payload.get('color'):
                                    old_values['color'] = payload.get('color')
                                if not old_values['notes'] and payload.get('notes'):
                                    old_values['notes'] = payload.get('notes')
                                if not old_values['rp_animal'] and payload.get('rp_animal'):
                                    old_values['rp_animal'] = payload.get('rp_animal')
                        
                        # Emit update events for changed fields
                        field_changes = [
                            ('weight', old_values['weight'], weight, EventType.WEIGHT_RECORDED),
                            ('current_weight', old_values['current_weight'], current_weight, EventType.CURRENT_WEIGHT_RECORDED),
                            ('gender', old_values['gender'], gender, EventType.GENDER_CORRECTED),
                            ('status', old_values['status'], status, EventType.STATUS_CHANGED),
                            ('color', old_values['color'], color, EventType.COLOR_RECORDED),
                            ('notes', old_values['notes'], notes, EventType.NOTES_UPDATED),
                            ('rp_animal', old_values['rp_animal'], rp_animal, EventType.RP_ANIMAL_UPDATED),
                        ]
                        
                        for field_name, old_val, new_val, event_type in field_changes:
                            if old_val != new_val and new_val is not None:
                                emit_field_change(
                                    event_type=event_type,
                                    animal_id=animal_id,
                                    animal_number=animal,
                                    company_id=company_id,
                                    user_id=created_by_or_key,
                                    field_name=field_name,
                                    old_value=old_val,
                                    new_value=new_val,
                                    notes=f"Actualizado desde registro",
                                )
                    else:
                        # Animal has no events - emit birth_registered (SOURCE OF TRUTH)
                        emit_birth_registered(
                            animal_id=animal_id,
                            animal_number=animal,
                            company_id=company_id,
                            user_id=created_by_or_key,
                            born_date=body.bornDate,
                            weight=weight,
                            current_weight=current_weight,
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
                            animal_idv=animal_idv,
                        )
                    
                    # Step 3: Project snapshot (derived from events)
                    project_animal_snapshot(animal_id, company_id)
                    
                    # Step 4: Project registration from snapshot (derived, for backwards compatibility)
                    snapshot = get_snapshot(animal_id, company_id)
                    if snapshot:
                        project_registration_from_snapshot(
                            animal_id=animal_id,
                            snapshot=snapshot,
                            created_by=created_by_or_key,
                            created_at=created_at,
                        )
                    
                    # Handle mother events (if mother_id provided)
                    if mother and company_id:
                        try:
                            # Check if mother already has events
                            mother_events = get_events_for_animal_by_number(mother, company_id)
                            
                            if len(mother_events) > 0:
                                # Mother already has events - emit updates for notes_mother, current_weight, and rp_animal
                                # Get mother's current values from snapshot (source of truth)
                                mother_snapshot = get_snapshot_by_number(mother, company_id)
                                
                                if mother_snapshot:
                                    # Use snapshot values
                                    old_rp_animal = mother_snapshot.get('rp_animal')
                                    old_current_weight = mother_snapshot.get('current_weight')
                                    old_notes_mother = mother_snapshot.get('notes_mother')
                                    mother_animal_id = mother_snapshot.get('animal_id')  # May be None for mothers
                                else:
                                    # Fallback to registration table if snapshot doesn't exist
                                    mother_cursor = conn.execute(
                                        """
                                        SELECT id, notes_mother, current_weight, rp_animal FROM registrations 
                                        WHERE animal_number = ? AND company_id = ?
                                        LIMIT 1
                                        """,
                                        (mother, company_id)
                                    )
                                    mother_reg = mother_cursor.fetchone()
                                    
                                    if mother_reg:
                                        mother_animal_id = mother_reg[0]
                                        old_notes_mother = mother_reg[1]
                                        old_current_weight = mother_reg[2]
                                        old_rp_animal = mother_reg[3] if len(mother_reg) > 3 else None
                                    else:
                                        # No snapshot and no registration - use defaults
                                        mother_animal_id = None
                                        old_rp_animal = None
                                        old_current_weight = None
                                        old_notes_mother = None
                                
                                # Also check if mother has registration record (for updating registration table later)
                                mother_reg_cursor = conn.execute(
                                    """
                                    SELECT id FROM registrations 
                                    WHERE animal_number = ? AND company_id = ?
                                    LIMIT 1
                                    """,
                                    (mother, company_id)
                                )
                                mother_reg = mother_reg_cursor.fetchone()
                                
                                # Track if any events were emitted
                                events_emitted = False
                                
                                # Emit MOTHER_NOTES_UPDATED event if notes_mother is provided and different
                                if notes_mother and notes_mother != old_notes_mother:
                                    emit_field_change(
                                        event_type=EventType.MOTHER_NOTES_UPDATED,
                                        animal_id=mother_animal_id,  # Can be None
                                        animal_number=mother,
                                        company_id=company_id,
                                        user_id=created_by_or_key,
                                        field_name='notes_mother',
                                        old_value=old_notes_mother or None,
                                        new_value=notes_mother,
                                        notes=f"Actualizado desde registro de cría {animal}",
                                    )
                                    events_emitted = True
                                
                                # Emit CURRENT_WEIGHT_RECORDED event if mother_weight is provided and different
                                if mother_weight is not None and mother_weight != old_current_weight:
                                    emit_field_change(
                                        event_type=EventType.CURRENT_WEIGHT_RECORDED,
                                        animal_id=mother_animal_id,  # Can be None
                                        animal_number=mother,
                                        company_id=company_id,
                                        user_id=created_by_or_key,
                                        field_name='current_weight',
                                        old_value=str(old_current_weight) if old_current_weight is not None else None,
                                        new_value=str(mother_weight),
                                        notes=f"Actualizado desde registro de cría {animal}",
                                    )
                                    events_emitted = True
                                
                                # Emit RP_ANIMAL_UPDATED event if rp_mother is provided and different
                                if rp_mother and rp_mother != old_rp_animal:
                                    emit_field_change(
                                        event_type=EventType.RP_ANIMAL_UPDATED,
                                        animal_id=mother_animal_id,  # Can be None
                                        animal_number=mother,
                                        company_id=company_id,
                                        user_id=created_by_or_key,
                                        field_name='rp_animal',
                                        old_value=old_rp_animal or None,
                                        new_value=rp_mother,
                                        notes=f"Actualizado desde registro de cría {animal}",
                                    )
                                    events_emitted = True
                                
                                # Project snapshot ONCE after all events
                                if events_emitted:
                                    if mother_animal_id:
                                        project_animal_snapshot(mother_animal_id, company_id)
                                    else:
                                        project_animal_snapshot_by_number(mother, company_id)
                                
                                # Update mother's registration ONLY if registration exists
                                if mother_reg and (notes_mother or mother_weight is not None or rp_mother):
                                    mother_reg_id = mother_reg[0]
                                    update_fields = []
                                    update_values = []
                                    if notes_mother:
                                        update_fields.append("notes_mother = ?")
                                        update_values.append(notes_mother)
                                    if mother_weight is not None:
                                        update_fields.append("current_weight = ?")
                                        update_values.append(mother_weight)
                                    if rp_mother:
                                        update_fields.append("rp_animal = ?")  # rp_mother → rp_animal in registration
                                        update_values.append(rp_mother)
                                    
                                    if update_fields:
                                        update_values.append(mother_reg_id)
                                        conn.execute(
                                            f"""
                                            UPDATE registrations SET {', '.join(update_fields)}, updated_at = datetime('now')
                                            WHERE id = ?
                                            """,
                                            tuple(update_values)
                                        )
                            else:
                                # Mother has no events - create them
                                # First check if mother has a registration record
                                mother_cursor = conn.execute(
                                    """
                                    SELECT id, notes_mother, current_weight FROM registrations 
                                    WHERE animal_number = ? AND company_id = ?
                                    LIMIT 1
                                    """,
                                    (mother, company_id)
                                )
                                mother_reg = mother_cursor.fetchone()
                                
                                if mother_reg:
                                    # Mother has registration but no events - update registration and create events
                                    mother_animal_id = mother_reg[0]
                                    
                                    # Update mother's registration with new values if provided
                                    update_fields = []
                                    update_values = []
                                    if notes_mother:
                                        update_fields.append("notes_mother = ?")
                                        update_values.append(notes_mother)
                                    if mother_weight is not None:
                                        update_fields.append("current_weight = ?")
                                        update_values.append(mother_weight)
                                    
                                    if update_fields:
                                        update_values.append(mother_animal_id)
                                        conn.execute(
                                            f"""
                                            UPDATE registrations SET {', '.join(update_fields)}, updated_at = datetime('now')
                                            WHERE id = ?
                                            """,
                                            tuple(update_values)
                                        )
                                    
                                    # Create events for mother
                                    ensure_animal_has_events(
                                        animal_number=mother,
                                        company_id=company_id,
                                        user_id=created_by_or_key,
                                        gender='FEMALE',
                                        current_weight=mother_weight,
                                        status='ALIVE',
                                        rp_animal=rp_mother,
                                        notes=notes_mother,
                                    )
                                    
                                    # Project snapshot for mother after event creation
                                    project_animal_snapshot(mother_animal_id, company_id)
                                else:
                                    # Mother has no registration and no events - just create events
                                    ensure_animal_has_events(
                                        animal_number=mother,
                                        company_id=company_id,
                                        user_id=created_by_or_key,
                                        gender='FEMALE',
                                        current_weight=mother_weight,
                                        status='ALIVE',
                                        rp_animal=rp_mother,
                                        notes=notes_mother,
                                    )
                                    
                                    # Project snapshot for mother after event creation (by number since no animal_id)
                                    project_animal_snapshot_by_number(mother, company_id)
                        except Exception as e:
                            import logging
                            logging.warning(f"Failed to handle events for mother {mother}: {e}")
                    
                    # Ensure father has events (if father_id provided)
                    if father and company_id:
                        try:
                            ensure_animal_has_events(
                                animal_number=father,
                                company_id=company_id,
                                user_id=created_by_or_key,
                                gender='MALE',
                                status='ALIVE',
                            )
                            
                            # Project snapshot for father after event creation (by number since no animal_id)
                            project_animal_snapshot_by_number(father, company_id)
                        except Exception as e:
                            import logging
                            logging.warning(f"Failed to ensure events for father {father}: {e}")
                except Exception as e:
                    # Log but don't fail - triggers still work as backup
                    import logging
                    logging.warning(f"Failed to emit birth event for animal {animal_id}: {e}")
            else:
                # Legacy path (no company_id): Update registration directly with all data
                # No events emitted for legacy registrations
                conn.execute(
                    """
                    UPDATE registrations SET
                        mother_id = ?, father_id = ?, born_date = ?, weight = ?, current_weight = ?,
                        gender = ?, animal_type = ?, status = ?, color = ?, notes = ?, notes_mother = ?,
                        insemination_round_id = ?, insemination_identifier = ?, scrotal_circumference = ?,
                        rp_animal = ?, rp_mother = ?, mother_weight = ?, weaning_weight = ?,
                        death_date = ?, sold_date = ?, animal_idv = ?, updated_at = datetime('now')
                    WHERE id = ?
                    """,
                    (
                        mother, father, body.bornDate, weight, current_weight,
                        gender, animal_type, status, color, notes, notes_mother,
                        insemination_round_id, insemination_identifier, scrotal_circumference,
                        rp_animal, rp_mother, mother_weight, weaning_weight,
                        death_date, sold_date, animal_idv, animal_id
                    )
                )
            
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
    animal_idv = _normalize_text(body.animalIdv) if hasattr(body, 'animalIdv') else None

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

    # Handle current_weight validation
    current_weight = None
    if body.currentWeight is not None:
        try:
            current_weight = float(body.currentWeight)
            if not (0 <= current_weight <= 10000):
                raise HTTPException(status_code=400, detail="Current weight must be between 0 and 10000 kg")
        except (ValueError, TypeError):
            raise HTTPException(status_code=400, detail="Invalid current weight value")

    if gender and gender not in VALID_GENDERS:
        raise HTTPException(status_code=400, detail=f"Invalid gender. Must be one of: {', '.join(VALID_GENDERS)}")
    if status and status not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {', '.join(VALID_STATUSES)}")
    if color and color not in VALID_COLORS:
        raise HTTPException(status_code=400, detail=f"Invalid color. Must be one of: {', '.join(VALID_COLORS)}")

    # Handle optional death_date (YYYY-MM-DD)
    death_date = None
    if hasattr(body, "deathDate") and body.deathDate:
        try:
            _dt.datetime.strptime(body.deathDate, "%Y-%m-%d")
            death_date = body.deathDate
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid deathDate format. Use YYYY-MM-DD")

    # Handle optional sold_date (YYYY-MM-DD)
    sold_date = None
    if hasattr(body, "soldDate") and body.soldDate:
        try:
            _dt.datetime.strptime(body.soldDate, "%Y-%m-%d")
            sold_date = body.soldDate
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid soldDate format. Use YYYY-MM-DD")

    # Auto-set death_date if status is DEAD and not provided
    if status == "DEAD" and not death_date:
        death_date = _dt.datetime.utcnow().strftime("%Y-%m-%d")

    # Auto-set sold_date if status is SOLD and not provided
    if status == "SOLD" and not sold_date:
        sold_date = _dt.datetime.utcnow().strftime("%Y-%m-%d")

    try:
        with conn:
            # Check if record exists and belongs to the same company, and get current values
            cursor = conn.execute(
                """
                SELECT company_id, animal_number, mother_id, father_id, born_date, weight, current_weight,
                       gender, status, color, notes, notes_mother, rp_animal, rp_mother,
                       mother_weight, weaning_weight, scrotal_circumference, death_date, sold_date, animal_idv, created_at
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
                'current_weight': record[6],
                'gender': record[7],
                'status': record[8],
                'color': record[9],
                'notes': record[10],
                'notes_mother': record[11],
                'rp_animal': record[12],
                'rp_mother': record[13],
                'mother_weight': record[14],
                'weaning_weight': record[15],
                'scrotal_circumference': record[16],
                'death_date': record[17] if len(record) > 17 else None,
                'sold_date': record[18] if len(record) > 18 else None,
                'animal_idv': record[19] if len(record) > 19 else None,
                'created_at': record[20] if len(record) > 20 else None,
            }
            
            # Auto-assign insemination_round_id if missing and born_date is provided
            if not insemination_round_id and body.bornDate:
                auto_assigned_round_id = _auto_assign_insemination_round_id(body.bornDate, company_id)
                if auto_assigned_round_id:
                    insemination_round_id = _normalize_text(auto_assigned_round_id)
            
            # =========================================================================
            # EVENT-FIRST ARCHITECTURE FOR UPDATES
            # 1. Emit events FIRST (source of truth)
            # 2. Project snapshot (derived from events)
            # 3. Project registration from snapshot (derived, for backwards compatibility)
            # =========================================================================
            
            # Step 1: Emit domain events FIRST (source of truth)
            if company_id:
                try:
                    # Map of field -> (old_value, new_value, event_type)
                    field_changes = [
                        ('weight', old_values['weight'], weight, EventType.WEIGHT_RECORDED),
                        ('weaning_weight', old_values['weaning_weight'], weaning_weight, EventType.WEANING_WEIGHT_RECORDED),
                        ('current_weight', old_values['current_weight'], current_weight, EventType.CURRENT_WEIGHT_RECORDED),
                        ('mother_id', old_values['mother_id'], mother, EventType.MOTHER_ASSIGNED),
                        ('father_id', old_values['father_id'], father, EventType.FATHER_ASSIGNED),
                        ('gender', old_values['gender'], gender, EventType.GENDER_CORRECTED),
                        ('color', old_values['color'], color, EventType.COLOR_RECORDED),
                        ('animal_number', old_values['animal_number'], animal, EventType.ANIMAL_NUMBER_CORRECTED),
                        ('born_date', old_values['born_date'], body.bornDate, EventType.BIRTH_DATE_CORRECTED),
                        ('animal_idv', old_values['animal_idv'], animal_idv, EventType.ANIMAL_IDV_UPDATED),
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
                            # Prefer user-provided deathDate (YYYY-MM-DD) if available
                            death_event_time = None
                            if hasattr(body, "deathDate") and body.deathDate:
                                try:
                                    parsed = _dt.datetime.strptime(body.deathDate, "%Y-%m-%d")
                                    death_event_time = parsed.isoformat()
                                except ValueError:
                                    death_event_time = _dt.datetime.utcnow().isoformat()
                            else:
                                death_event_time = _dt.datetime.utcnow().isoformat()

                            emit_death_recorded(
                                animal_id=animal_id,
                                animal_number=animal,
                                company_id=company_id,
                                user_id=created_by_or_key,
                                death_date=death_event_time,
                                previous_status=old_values['status'],
                                notes=notes,
                            )
                        else:
                            # For SOLD and other status changes, use STATUS_CHANGED event
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
                    # Only emit if new value is provided (not None) AND different from old
                    for field_name, old_val, new_val, event_type in field_changes:
                        if new_val is not None and old_val != new_val:
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
                    
                    # Ensure new mother has events if mother_id changed
                    if mother and mother != old_values['mother_id'] and company_id:
                        try:
                            ensure_animal_has_events(
                                animal_number=mother,
                                company_id=company_id,
                                user_id=created_by_or_key,
                                gender='FEMALE',
                                current_weight=mother_weight,
                                status='ALIVE',
                                rp_animal=rp_mother,
                            )
                            # Project snapshot for mother after event creation
                            project_animal_snapshot_by_number(mother, company_id)
                        except Exception as e:
                            import logging
                            logging.warning(f"Failed to ensure events for new mother {mother}: {e}")
                    
                    # Ensure new father has events if father_id changed
                    if father and father != old_values['father_id'] and company_id:
                        try:
                            ensure_animal_has_events(
                                animal_number=father,
                                company_id=company_id,
                                user_id=created_by_or_key,
                                gender='MALE',
                                status='ALIVE',
                            )
                            # Project snapshot for father after event creation
                            project_animal_snapshot_by_number(father, company_id)
                        except Exception as e:
                            import logging
                            logging.warning(f"Failed to ensure events for new father {father}: {e}")
                    
                    # Emit events for mother's own animal_id when mother_weight changes
                    if mother and (mother_weight != old_values['mother_weight'] or mother != old_values['mother_id']) and company_id:
                        try:
                            # Find mother's registration
                            cursor = conn.execute(
                                """
                                SELECT id FROM registrations 
                                WHERE animal_number = ? AND company_id = ?
                                LIMIT 1
                                """,
                                (mother, company_id)
                            )
                            mother_reg = cursor.fetchone()
                            
                            if mother_reg:
                                mother_animal_id = mother_reg[0]
                                # Emit current_weight event for mother
                                if mother_weight and mother_weight != old_values['mother_weight']:
                                        emit_field_change(
                                            event_type=EventType.CURRENT_WEIGHT_RECORDED,
                                            animal_id=mother_animal_id,
                                            animal_number=mother,
                                            company_id=company_id,
                                            user_id=created_by_or_key,
                                            field_name='current_weight',
                                            old_value=old_values['mother_weight'],
                                            new_value=mother_weight,
                                            notes=f"Updated via calf {animal}",
                                        )
                                        # Project snapshot for mother after event emission
                                        project_animal_snapshot(mother_animal_id, company_id)
                        except Exception as e:
                            import logging
                            logging.warning(f"Failed to emit event for mother {mother}: {e}")
                    
                    # Step 2: Project snapshot (derived from events)
                    project_animal_snapshot(animal_id, company_id)
                    
                    # Step 3: Project registration from snapshot (derived, for backwards compatibility)
                    snapshot = get_snapshot(animal_id, company_id)
                    if snapshot:
                        project_registration_from_snapshot(
                            animal_id=animal_id,
                            snapshot=snapshot,
                            created_by=created_by_or_key,
                            created_at=old_values.get('created_at', _dt.datetime.utcnow().isoformat()),
                        )
                    
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
                animalIdv=body.animalIdv if hasattr(body, 'animalIdv') else None,
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

def update_animal_by_number(
    created_by_or_key: str,
    body,
    company_id: int
) -> None:
    """Update an animal that only exists in domain_events (e.g., mothers/fathers).
    This function emits update events and projects snapshots, but does NOT create registration records.
    """
    if not company_id:
        raise HTTPException(status_code=403, detail="Company assignment required")
    
    if not body.animalNumber:
        raise HTTPException(status_code=400, detail="animalNumber required")
    
    animal_number = _normalize_text(body.animalNumber)
    
    # Check if animal has domain events
    existing_events = get_events_for_animal_by_number(animal_number, company_id)
    if len(existing_events) == 0:
        raise HTTPException(
            status_code=404,
            detail=f"Animal {animal_number} not found in domain events. Cannot update animals that don't exist."
        )
    
    # Get old values from most recent event or snapshot
    # Try to get from snapshot first
    from .snapshot_projector import get_snapshot_by_number
    snapshot = get_snapshot_by_number(animal_number, company_id)
    
    old_values = {
        'current_weight': snapshot.get('current_weight') if snapshot else None,
        'notes': snapshot.get('notes') if snapshot else None,
        'status': snapshot.get('current_status') if snapshot else None,
        'color': snapshot.get('color') if snapshot else None,
        'rp_animal': snapshot.get('rp_animal') if snapshot else None,
        'notes_mother': snapshot.get('notes_mother') if snapshot else None,
        'death_date': snapshot.get('death_date') if snapshot else None,
        'sold_date': snapshot.get('sold_date') if snapshot else None,
        'animal_idv': snapshot.get('animal_idv') if snapshot else None,
    }
    
    # If snapshot doesn't have values, try to get from most recent event
    if not snapshot:
        for event in reversed(existing_events):
            if event.get('payload'):
                payload = event['payload'] if isinstance(event['payload'], dict) else json.loads(event['payload'])
                if old_values['current_weight'] is None and payload.get('current_weight') is not None:
                    old_values['current_weight'] = payload.get('current_weight')
                if old_values['notes'] is None and payload.get('notes') is not None:
                    old_values['notes'] = payload.get('notes')
                if old_values['status'] is None and payload.get('status') is not None:
                    old_values['status'] = payload.get('status')
                if old_values['color'] is None and payload.get('color') is not None:
                    old_values['color'] = payload.get('color')
                if old_values['rp_animal'] is None and payload.get('rp_animal') is not None:
                    old_values['rp_animal'] = payload.get('rp_animal')
                if old_values['notes_mother'] is None and payload.get('notes_mother') is not None:
                    old_values['notes_mother'] = payload.get('notes_mother')
                if old_values['animal_idv'] is None and payload.get('animal_idv') is not None:
                    old_values['animal_idv'] = payload.get('animal_idv')
    
    # Normalize new values
    new_current_weight = None
    if body.currentWeight is not None:
        try:
            new_current_weight = float(body.currentWeight)
            if not (0 <= new_current_weight <= 10000):
                raise HTTPException(status_code=400, detail="Current weight must be between 0 and 10000 kg")
        except (ValueError, TypeError):
            raise HTTPException(status_code=400, detail="Invalid current weight value")
    
    new_notes = _normalize_text(body.notes)
    new_status = _normalize_text(body.status)
    new_color = _normalize_text(body.color)
    new_rp_animal = _normalize_text(body.rpAnimal)
    new_notes_mother = _normalize_text(body.notesMother)
    new_animal_idv = _normalize_text(body.animalIdv) if hasattr(body, 'animalIdv') else None
    
    # Validate status if provided
    if new_status and new_status not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {', '.join(VALID_STATUSES)}")
    
    # Emit update events for changed fields (with animal_id=None for mothers/fathers)
    animal_id = None  # Mothers/fathers don't have registration records, so animal_id is None
    
    # Track if any events were emitted
    events_emitted = False
    
    if new_current_weight is not None and new_current_weight != old_values['current_weight']:
        emit_field_change(
            event_type=EventType.CURRENT_WEIGHT_RECORDED,
            animal_id=animal_id,
            animal_number=animal_number,
            company_id=company_id,
            user_id=created_by_or_key,
            field_name='current_weight',
            old_value=str(old_values['current_weight']) if old_values['current_weight'] is not None else None,
            new_value=str(new_current_weight),
        )
        events_emitted = True
    
    if new_notes and new_notes != old_values['notes']:
        emit_field_change(
            event_type=EventType.NOTES_UPDATED,
            animal_id=animal_id,
            animal_number=animal_number,
            company_id=company_id,
            user_id=created_by_or_key,
            field_name='notes',
            old_value=old_values['notes'],
            new_value=new_notes,
        )
        events_emitted = True
    
    if new_status and new_status != old_values['status']:
        emit_field_change(
            event_type=EventType.STATUS_CHANGED,
            animal_id=animal_id,
            animal_number=animal_number,
            company_id=company_id,
            user_id=created_by_or_key,
            field_name='status',
            old_value=old_values['status'],
            new_value=new_status,
        )
        events_emitted = True
    
    if new_color and new_color != old_values['color']:
        emit_field_change(
            event_type=EventType.COLOR_RECORDED,
            animal_id=animal_id,
            animal_number=animal_number,
            company_id=company_id,
            user_id=created_by_or_key,
            field_name='color',
            old_value=old_values['color'],
            new_value=new_color,
        )
        events_emitted = True
    
    if new_rp_animal and new_rp_animal != old_values['rp_animal']:
        emit_field_change(
            event_type=EventType.RP_ANIMAL_UPDATED,
            animal_id=animal_id,
            animal_number=animal_number,
            company_id=company_id,
            user_id=created_by_or_key,
            field_name='rp_animal',
            old_value=old_values['rp_animal'],
            new_value=new_rp_animal,
        )
        events_emitted = True
    
    if new_notes_mother and new_notes_mother != old_values['notes_mother']:
        emit_field_change(
            event_type=EventType.MOTHER_NOTES_UPDATED,
            animal_id=animal_id,
            animal_number=animal_number,
            company_id=company_id,
            user_id=created_by_or_key,
            field_name='notes_mother',
            old_value=old_values['notes_mother'],
            new_value=new_notes_mother,
        )
        events_emitted = True
    
    if new_animal_idv and new_animal_idv != old_values['animal_idv']:
        emit_field_change(
            event_type=EventType.ANIMAL_IDV_UPDATED,
            animal_id=animal_id,
            animal_number=animal_number,
            company_id=company_id,
            user_id=created_by_or_key,
            field_name='animal_idv',
            old_value=old_values['animal_idv'],
            new_value=new_animal_idv,
        )
        events_emitted = True
    
    # Project snapshot by animal_number after all events (incremental projection will process all new events)
    if events_emitted:
        project_animal_snapshot_by_number(animal_number, company_id)

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
               rp_animal, rp_mother, mother_weight, weaning_weight, animal_idv
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
                   rp_animal, rp_mother, mother_weight, weaning_weight, animal_idv
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
    """Export registrations with multi-tenant filtering, including mothers/fathers from snapshots"""
    try:
        company_id = user.get('company_id')
        firebase_uid = user.get('firebase_uid')
        
        # Build WHERE clause and params for registrations
        where_clause, params = get_data_filter_clause(company_id, firebase_uid)
        
        # Build date filtering conditions
        date_conditions = ""
        date_params = []
        if date:
            date_conditions = " AND date(born_date) = date(?)"
            date_params.append(date)
        else:
            if start:
                date_conditions += " AND date(born_date) >= date(?)"
                date_params.append(start)
            if end:
                date_conditions += " AND date(born_date) <= date(?)"
                date_params.append(end)
        
        # Query registrations (existing behavior)
        reg_params = list(params) + date_params
        cursor = conn.execute(
            f"""
            SELECT animal_number, born_date, mother_id, father_id,
                   weight, gender, animal_type, status, color, notes, notes_mother, 
                   created_at, insemination_round_id, insemination_identifier, 
                   scrotal_circumference, rp_animal, rp_mother, mother_weight, weaning_weight, animal_idv
            FROM registrations
            WHERE {where_clause}{date_conditions}
            ORDER BY id ASC
            """,
            tuple(reg_params)
        )
        
        cols = [d[0] for d in cursor.description]
        registration_rows = [dict(zip(cols, r)) for r in cursor.fetchall()]
        
        # Query animal_snapshots for mothers/fathers (animals not in registrations)
        # Mothers/fathers have animal_id < 0 (negative hash-based ID) or animal_id not in registrations
        if company_id:
            # Build date filtering for snapshots (using birth_date instead of born_date)
            snapshot_date_conditions = ""
            snapshot_date_params = []
            if date:
                snapshot_date_conditions = " AND date(birth_date) = date(?)"
                snapshot_date_params.append(date)
            else:
                if start:
                    snapshot_date_conditions += " AND date(birth_date) >= date(?)"
                    snapshot_date_params.append(start)
                if end:
                    snapshot_date_conditions += " AND date(birth_date) <= date(?)"
                    snapshot_date_params.append(end)
            
            snapshot_params = [company_id] + snapshot_date_params
            cursor = conn.execute(
                f"""
                SELECT animal_number, birth_date AS born_date, mother_id, father_id,
                       current_weight AS weight, gender, NULL AS animal_type, 
                       current_status AS status, color, notes, notes_mother,
                       updated_at AS created_at, insemination_round_id, insemination_identifier,
                       scrotal_circumference, rp_animal, rp_mother, mother_weight, weaning_weight, animal_idv
                FROM animal_snapshots
                WHERE company_id = ? 
                  AND (animal_id < 0 OR animal_id NOT IN (SELECT id FROM registrations))
                  {snapshot_date_conditions}
                ORDER BY animal_number ASC
                """,
                tuple(snapshot_params)
            )
            
            snapshot_cols = [d[0] for d in cursor.description]
            snapshot_rows = [dict(zip(snapshot_cols, r)) for r in cursor.fetchall()]
            
            # Combine both result sets
            all_rows = registration_rows + snapshot_rows
        else:
            # If no company_id, only return registrations (get_data_filter_clause returns "1 = 0" for no company)
            all_rows = registration_rows
        
        return all_rows
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


