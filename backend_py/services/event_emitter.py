"""
Event Emitter Service

This module provides the infrastructure for emitting domain events.
Events are immutable records that capture business facts.

Key principles:
- Events are INSERT-only (immutable)
- Each event has a unique UUID for idempotency
- Events carry full payload data
- Metadata captures context (source, correlation_id, etc.)
"""

import uuid
import json
import logging
from datetime import datetime
from typing import Dict, Optional, Any, List
from ..db import conn
from ..events.event_types import EventType

logger = logging.getLogger(__name__)


def emit_event(
    event_type: EventType | str,
    animal_id: int | None,
    animal_number: str,
    company_id: int,
    user_id: str,
    payload: Dict[str, Any],
    metadata: Optional[Dict[str, Any]] = None,
    event_time: Optional[str] = None,
    event_version: int = 1,
) -> int:
    """
    Emit an immutable domain event to the event store.
    
    Args:
        event_type: The type of domain event (from EventType enum or string)
        animal_id: The animal ID this event relates to (can be None for some events)
        animal_number: The animal number (denormalized for query performance)
        company_id: The company this event belongs to (required for multi-tenancy)
        user_id: The user who triggered this event
        payload: The event data as a dictionary (will be JSON serialized)
        metadata: Optional metadata (source, correlation_id, etc.)
        event_time: Business time of the event (defaults to now)
        event_version: Schema version for the event payload (for evolution)
    
    Returns:
        The ID of the created event record
    
    Raises:
        ValueError: If required parameters are missing
        sqlite3.Error: If database operation fails
    """
    if not company_id:
        raise ValueError("company_id is required for all events")
    
    if not user_id:
        raise ValueError("user_id is required for all events")
    
    if not animal_number:
        raise ValueError("animal_number is required for all events")
    
    # Convert EventType enum to string if needed
    event_type_str = event_type.value if isinstance(event_type, EventType) else str(event_type)
    
    # Generate unique event ID
    event_id = str(uuid.uuid4())
    
    # Set event time to now if not provided
    if event_time is None:
        event_time = datetime.utcnow().isoformat()
    
    # Build default metadata
    default_metadata = {
        "source": "application",
        "emitted_at": datetime.utcnow().isoformat(),
    }
    if metadata:
        default_metadata.update(metadata)
    
    try:
        cursor = conn.execute(
            """
            INSERT INTO domain_events 
            (event_id, animal_id, animal_number, event_type, event_version, 
             payload, metadata, company_id, user_id, event_time)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                event_id,
                animal_id,
                animal_number,
                event_type_str,
                event_version,
                json.dumps(payload, default=str),
                json.dumps(default_metadata, default=str),
                company_id,
                user_id,
                event_time,
            )
        )
        conn.commit()
        
        event_db_id = cursor.lastrowid
        logger.info(f"Emitted event {event_type_str} (id={event_db_id}, event_id={event_id}) for animal {animal_number}")
        
        return event_db_id
        
    except Exception as e:
        logger.error(f"Failed to emit event {event_type_str}: {e}")
        raise


def emit_mother_registered(
    animal_id: int | None,
    animal_number: str,
    company_id: int,
    user_id: str,
    current_weight: Optional[float] = None,
    status: str = 'ALIVE',
    color: Optional[str] = None,
    notes: Optional[str] = None,
    rp_animal: Optional[str] = None,
    animal_idv: Optional[str] = None,
) -> int:
    """Emit a mother_registered event when a mother is first registered."""
    payload = {
        "animal_number": animal_number,
        "current_weight": current_weight,
        "gender": "FEMALE",
        "status": status or "ALIVE",
        "color": color,
        "notes": notes,
        "rp_animal": rp_animal,
        "animal_idv": animal_idv,
    }
    
    return emit_event(
        event_type=EventType.MOTHER_REGISTERED,
        animal_id=animal_id,
        animal_number=animal_number,
        company_id=company_id,
        user_id=user_id,
        payload=payload,
    )


def emit_father_registered(
    animal_id: int | None,
    animal_number: str,
    company_id: int,
    user_id: str,
    current_weight: Optional[float] = None,
    status: str = 'ALIVE',
    color: Optional[str] = None,
    notes: Optional[str] = None,
    rp_animal: Optional[str] = None,
    animal_idv: Optional[str] = None,
) -> int:
    """Emit a father_registered event when a father is first registered."""
    payload = {
        "animal_number": animal_number,
        "current_weight": current_weight,
        "gender": "MALE",
        "status": status or "ALIVE",
        "color": color,
        "notes": notes,
        "rp_animal": rp_animal,
        "animal_idv": animal_idv,
    }
    
    return emit_event(
        event_type=EventType.FATHER_REGISTERED,
        animal_id=animal_id,
        animal_number=animal_number,
        company_id=company_id,
        user_id=user_id,
        payload=payload,
    )


def emit_birth_registered(
    animal_id: int,
    animal_number: str,
    company_id: int,
    user_id: str,
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
    animal_idv: Optional[str] = None,
) -> int:
    """Emit a birth_registered event with full animal data."""
    payload = {
        "animal_number": animal_number,
        "born_date": born_date,
        "weight": weight,
        "current_weight": current_weight,
        "gender": gender,
        "status": status or "ALIVE",
        "color": color,
        "mother_id": mother_id,
        "father_id": father_id,
        "notes": notes,
        "notes_mother": notes_mother,
        "rp_animal": rp_animal,
        "rp_mother": rp_mother,
        "mother_weight": mother_weight,
        "weaning_weight": weaning_weight,
        "scrotal_circumference": scrotal_circumference,
        "insemination_round_id": insemination_round_id,
        "insemination_identifier": insemination_identifier,
        "animal_idv": animal_idv,
    }
    
    return emit_event(
        event_type=EventType.BIRTH_REGISTERED,
        animal_id=animal_id,
        animal_number=animal_number,
        company_id=company_id,
        user_id=user_id,
        payload=payload,
        event_time=born_date,  # Use birth date as event time if available
    )


def emit_death_recorded(
    animal_id: int,
    animal_number: str,
    company_id: int,
    user_id: str,
    death_date: str,
    previous_status: Optional[str] = None,
    notes: Optional[str] = None,
) -> int:
    """Emit a death_recorded event."""
    payload = {
        "death_date": death_date,
        "previous_status": previous_status,
        "notes": notes,
    }
    
    return emit_event(
        event_type=EventType.DEATH_RECORDED,
        animal_id=animal_id,
        animal_number=animal_number,
        company_id=company_id,
        user_id=user_id,
        payload=payload,
        event_time=death_date,
    )


def emit_animal_deleted(
    animal_id: int,
    animal_number: str,
    company_id: int,
    user_id: str,
    notes: Optional[str] = None,
) -> int:
    """Emit an animal_deleted event."""
    payload = {
        "notes": notes,
    }
    return emit_event(
        event_type=EventType.ANIMAL_DELETED,
        animal_id=animal_id,
        animal_number=animal_number,
        company_id=company_id,
        user_id=user_id,
        payload=payload,
    )


def emit_field_change(
    event_type: EventType,
    animal_id: int | None,
    animal_number: str,
    company_id: int,
    user_id: str,
    field_name: str,
    old_value: Any,
    new_value: Any,
    notes: Optional[str] = None,
) -> int:
    """Emit a field change event (for corrections/updates)."""
    payload = {
        "field_name": field_name,
        "old_value": old_value,
        "new_value": new_value,
        "notes": notes,
    }
    
    return emit_event(
        event_type=event_type,
        animal_id=animal_id,
        animal_number=animal_number,
        company_id=company_id,
        user_id=user_id,
        payload=payload,
    )


def ensure_animal_has_events(
    animal_number: str,
    company_id: int,
    user_id: str,
    gender: Optional[str] = None,
    weight: Optional[float] = None,
    current_weight: Optional[float] = None,
    status: str = 'ALIVE',
    color: Optional[str] = None,
    notes: Optional[str] = None,
    rp_animal: Optional[str] = None,
) -> bool:
    """
    Check if an animal has domain events. If not, create a birth_registered event.
    This makes mothers/fathers first-class animals in the event sourcing system.
    
    Args:
        animal_number: The animal number to check/create
        company_id: Company ID for multi-tenancy
        user_id: User ID who triggered this
        gender: Gender (FEMALE for mothers, MALE for fathers)
        weight: Birth weight (if available)
        current_weight: Current weight (if available)
        status: Status (defaults to ALIVE)
        color: Color (if available)
        notes: Notes (if available)
        rp_animal: RP animal (if available)
    
    Returns:
        True if events were created, False if animal already had events
    """
    if not animal_number or not animal_number.strip():
        return False
    
    try:
        # Check if animal has any domain events
        cursor = conn.execute(
            """
            SELECT COUNT(*) FROM domain_events 
            WHERE animal_number = ? AND company_id = ?
            """,
            (animal_number.strip().upper(), company_id)
        )
        count = cursor.fetchone()[0]
        
        if count > 0:
            # Animal already has events
            return False
        
        # Animal has no events, create a birth_registered event
        # Try to find existing registration to get animal_id
        cursor = conn.execute(
            """
            SELECT id FROM registrations 
            WHERE animal_number = ? AND company_id = ?
            LIMIT 1
            """,
            (animal_number.strip().upper(), company_id)
        )
        registration = cursor.fetchone()
        
        animal_id = registration[0] if registration else None
        
        # Determine gender - default to FEMALE if not specified
        actual_gender = gender or 'FEMALE'
        
        # Emit appropriate event based on gender
        if actual_gender == 'FEMALE':
            emit_mother_registered(
                animal_id=animal_id,
                animal_number=animal_number.strip().upper(),
                company_id=company_id,
                user_id=user_id,
                current_weight=current_weight,
                status=status,
                color=color,
                notes=notes,
                rp_animal=rp_animal,
            )
        elif actual_gender == 'MALE':
            emit_father_registered(
                animal_id=animal_id,
                animal_number=animal_number.strip().upper(),
                company_id=company_id,
                user_id=user_id,
                current_weight=current_weight,
                status=status,
                color=color,
                notes=notes,
                rp_animal=rp_animal,
            )
        else:
            # Fallback to birth_registered for unknown gender
            emit_birth_registered(
                animal_id=animal_id,
                animal_number=animal_number.strip().upper(),
                company_id=company_id,
                user_id=user_id,
                born_date=None,
                weight=weight,
                current_weight=current_weight,
                gender=actual_gender,
                status=status,
                color=color,
                mother_id=None,
                father_id=None,
                notes=notes,
                notes_mother=None,
                rp_animal=rp_animal,
                rp_mother=None,
                mother_weight=None,
                weaning_weight=None,
                scrotal_circumference=None,
                insemination_round_id=None,
                insemination_identifier=None,
            )
        
        # Project snapshot if we have an animal_id
        if animal_id:
            try:
                from .snapshot_projector import project_animal_snapshot
                project_animal_snapshot(animal_id, company_id)
            except Exception as e:
                logger.warning(f"Failed to project snapshot for animal {animal_id}: {e}")
        
        return True
    except Exception as e:
        logger.warning(f"Failed to ensure events for animal {animal_number}: {e}")
        return False


def emit_insemination_recorded(
    animal_number: str,  # mother_id serves as animal_number for inseminations
    company_id: int,
    user_id: str,
    insemination_id: int,
    insemination_identifier: str,
    insemination_round_id: str,
    mother_id: str,
    insemination_date: str,
    mother_visual_id: Optional[str] = None,
    bull_id: Optional[str] = None,
    animal_type: Optional[str] = None,
    notes: Optional[str] = None,
) -> int:
    """Emit an insemination_recorded event."""
    payload = {
        "insemination_id": insemination_id,
        "insemination_identifier": insemination_identifier,
        "insemination_round_id": insemination_round_id,
        "mother_id": mother_id,
        "mother_visual_id": mother_visual_id,
        "bull_id": bull_id,
        "insemination_date": insemination_date,
        "animal_type": animal_type,
        "notes": notes,
    }
    
    return emit_event(
        event_type=EventType.INSEMINATION_RECORDED,
        animal_id=None,  # Inseminations don't have animal_id (mother_id is text)
        animal_number=animal_number,
        company_id=company_id,
        user_id=user_id,
        payload=payload,
        event_time=insemination_date,
    )


def emit_insemination_cancelled(
    animal_number: str,  # mother_id
    company_id: int,
    user_id: str,
    insemination_id: int,
    insemination_date: str,
    reason: Optional[str] = None,
    previous_bull_id: Optional[str] = None,
) -> int:
    """
    Emit an insemination_cancelled event.
    
    This is a compensating event that negates a previous insemination.
    The original insemination record is NOT deleted - it is marked as cancelled.
    """
    payload = {
        "insemination_id": insemination_id,
        "insemination_date": insemination_date,
        "reason": reason or "Insemination cancelled",
        "previous_bull_id": previous_bull_id,
    }
    
    return emit_event(
        event_type=EventType.INSEMINATION_CANCELLED,
        animal_id=None,
        animal_number=animal_number,
        company_id=company_id,
        user_id=user_id,
        payload=payload,
    )


def get_events_for_animal(animal_id: int, company_id: int) -> List[Dict[str, Any]]:
    """
    Get all domain events for a specific animal, ordered by event time.
    
    Args:
        animal_id: The animal ID to query
        company_id: The company ID for data isolation
    
    Returns:
        List of event dictionaries
    """
    cursor = conn.execute(
        """
        SELECT id, event_id, animal_id, animal_number, event_type, event_version,
               payload, metadata, company_id, user_id, event_time, created_at
        FROM domain_events
        WHERE animal_id = ? AND company_id = ?
        ORDER BY event_time ASC, id ASC
        """,
        (animal_id, company_id)
    )
    
    rows = cursor.fetchall()
    return [
        {
            "id": row[0],
            "event_id": row[1],
            "animal_id": row[2],
            "animal_number": row[3],
            "event_type": row[4],
            "event_version": row[5],
            "payload": json.loads(row[6]) if row[6] else {},
            "metadata": json.loads(row[7]) if row[7] else {},
            "company_id": row[8],
            "user_id": row[9],
            "event_time": row[10],
            "created_at": row[11],
        }
        for row in rows
    ]


def get_events_for_animal_by_number(animal_number: str, company_id: int) -> List[Dict[str, Any]]:
    """
    Get all domain events for a specific animal by animal_number.
    
    This is useful for insemination events where we don't have an animal_id.
    """
    cursor = conn.execute(
        """
        SELECT id, event_id, animal_id, animal_number, event_type, event_version,
               payload, metadata, company_id, user_id, event_time, created_at
        FROM domain_events
        WHERE animal_number = ? AND company_id = ?
        ORDER BY event_time ASC, id ASC
        """,
        (animal_number, company_id)
    )
    
    rows = cursor.fetchall()
    return [
        {
            "id": row[0],
            "event_id": row[1],
            "animal_id": row[2],
            "animal_number": row[3],
            "event_type": row[4],
            "event_version": row[5],
            "payload": json.loads(row[6]) if row[6] else {},
            "metadata": json.loads(row[7]) if row[7] else {},
            "company_id": row[8],
            "user_id": row[9],
            "event_time": row[10],
            "created_at": row[11],
        }
        for row in rows
    ]


def get_events_since(
    company_id: int,
    since_event_id: Optional[int] = None,
    limit: int = 1000
) -> List[Dict[str, Any]]:
    """
    Get events since a specific event ID for incremental processing.
    
    Args:
        company_id: The company to query
        since_event_id: Get events after this ID (exclusive)
        limit: Maximum number of events to return
    
    Returns:
        List of event dictionaries
    """
    if since_event_id:
        cursor = conn.execute(
            """
            SELECT id, event_id, animal_id, animal_number, event_type, event_version,
                   payload, metadata, company_id, user_id, event_time, created_at
            FROM domain_events
            WHERE company_id = ? AND id > ?
            ORDER BY id ASC
            LIMIT ?
            """,
            (company_id, since_event_id, limit)
        )
    else:
        cursor = conn.execute(
            """
            SELECT id, event_id, animal_id, animal_number, event_type, event_version,
                   payload, metadata, company_id, user_id, event_time, created_at
            FROM domain_events
            WHERE company_id = ?
            ORDER BY id ASC
            LIMIT ?
            """,
            (company_id, limit)
        )
    
    rows = cursor.fetchall()
    return [
        {
            "id": row[0],
            "event_id": row[1],
            "animal_id": row[2],
            "animal_number": row[3],
            "event_type": row[4],
            "event_version": row[5],
            "payload": json.loads(row[6]) if row[6] else {},
            "metadata": json.loads(row[7]) if row[7] else {},
            "company_id": row[8],
            "user_id": row[9],
            "event_time": row[10],
            "created_at": row[11],
        }
        for row in rows
    ]

