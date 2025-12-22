"""
Snapshot Projector Service

This module is responsible for projecting domain events into animal snapshots.
The snapshot projector is the ONLY thing allowed to write to animal_snapshots.

Key principles:
- Snapshots are derived from events, never the other way around
- Snapshots are rebuildable at any time from events
- The projector applies events deterministically
- Snapshots enable fast reads without scanning events
"""

import json
import logging
from datetime import datetime
from typing import Dict, Optional, Any, List, Callable
from ..db import conn
from ..events.event_types import EventType

logger = logging.getLogger(__name__)


# =============================================================================
# EVENT HANDLERS
# =============================================================================
# Each handler takes the current snapshot state and event payload,
# and returns the updated snapshot state.

def _handle_birth_registered(snapshot: Dict[str, Any], payload: Dict[str, Any]) -> Dict[str, Any]:
    """Apply birth_registered event to snapshot."""
    return {
        **snapshot,
        'birth_date': payload.get('born_date'),
        'current_status': payload.get('status') or 'ALIVE',
        'gender': payload.get('gender'),
        'current_weight': payload.get('weight'),
        'mother_id': payload.get('mother_id'),
        'father_id': payload.get('father_id'),
        'color': payload.get('color'),
        'notes': payload.get('notes'),
        'notes_mother': payload.get('notes_mother'),
        'rp_animal': payload.get('rp_animal'),
        'rp_mother': payload.get('rp_mother'),
        'mother_weight': payload.get('mother_weight'),
        'weaning_weight': payload.get('weaning_weight'),
        'scrotal_circumference': payload.get('scrotal_circumference'),
        'insemination_round_id': payload.get('insemination_round_id'),
        'insemination_identifier': payload.get('insemination_identifier'),
    }


def _handle_death_recorded(snapshot: Dict[str, Any], payload: Dict[str, Any]) -> Dict[str, Any]:
    """Apply death_recorded event to snapshot."""
    return {
        **snapshot,
        'current_status': 'DEAD',
        'death_date': payload.get('death_date'),
    }


def _handle_weight_recorded(snapshot: Dict[str, Any], payload: Dict[str, Any]) -> Dict[str, Any]:
    """Apply weight_recorded event to snapshot."""
    return {
        **snapshot,
        'current_weight': payload.get('new_value') or payload.get('weight'),
    }


def _handle_weaning_weight_recorded(snapshot: Dict[str, Any], payload: Dict[str, Any]) -> Dict[str, Any]:
    """Apply weaning_weight_recorded event to snapshot."""
    return {
        **snapshot,
        'weaning_weight': payload.get('new_value') or payload.get('weaning_weight'),
    }


def _handle_mother_assigned(snapshot: Dict[str, Any], payload: Dict[str, Any]) -> Dict[str, Any]:
    """Apply mother_assigned event to snapshot."""
    return {
        **snapshot,
        'mother_id': payload.get('new_value') or payload.get('mother_id'),
    }


def _handle_father_assigned(snapshot: Dict[str, Any], payload: Dict[str, Any]) -> Dict[str, Any]:
    """Apply father_assigned event to snapshot."""
    return {
        **snapshot,
        'father_id': payload.get('new_value') or payload.get('father_id'),
    }


def _handle_status_changed(snapshot: Dict[str, Any], payload: Dict[str, Any]) -> Dict[str, Any]:
    """Apply status_changed event to snapshot."""
    new_status = payload.get('new_value') or payload.get('status')
    result = {
        **snapshot,
        'current_status': new_status,
    }
    # If status is DEAD, also set death_date if not already set
    if new_status == 'DEAD' and not result.get('death_date'):
        result['death_date'] = datetime.utcnow().isoformat()
    return result


def _handle_gender_corrected(snapshot: Dict[str, Any], payload: Dict[str, Any]) -> Dict[str, Any]:
    """Apply gender_corrected event to snapshot."""
    return {
        **snapshot,
        'gender': payload.get('new_value') or payload.get('gender'),
    }


def _handle_color_recorded(snapshot: Dict[str, Any], payload: Dict[str, Any]) -> Dict[str, Any]:
    """Apply color_recorded event to snapshot."""
    return {
        **snapshot,
        'color': payload.get('new_value') or payload.get('color'),
    }


def _handle_animal_number_corrected(snapshot: Dict[str, Any], payload: Dict[str, Any]) -> Dict[str, Any]:
    """Apply animal_number_corrected event to snapshot."""
    return {
        **snapshot,
        'animal_number': payload.get('new_value') or payload.get('animal_number'),
    }


def _handle_birth_date_corrected(snapshot: Dict[str, Any], payload: Dict[str, Any]) -> Dict[str, Any]:
    """Apply birth_date_corrected event to snapshot."""
    return {
        **snapshot,
        'birth_date': payload.get('new_value') or payload.get('birth_date'),
    }


def _handle_notes_updated(snapshot: Dict[str, Any], payload: Dict[str, Any]) -> Dict[str, Any]:
    """Apply notes_updated event to snapshot."""
    return {
        **snapshot,
        'notes': payload.get('new_value') or payload.get('notes'),
    }


def _handle_mother_notes_updated(snapshot: Dict[str, Any], payload: Dict[str, Any]) -> Dict[str, Any]:
    """Apply mother_notes_updated event to snapshot."""
    return {
        **snapshot,
        'notes_mother': payload.get('new_value') or payload.get('notes_mother'),
    }


def _handle_rp_animal_updated(snapshot: Dict[str, Any], payload: Dict[str, Any]) -> Dict[str, Any]:
    """Apply rp_animal_updated event to snapshot."""
    return {
        **snapshot,
        'rp_animal': payload.get('new_value') or payload.get('rp_animal'),
    }


def _handle_rp_mother_updated(snapshot: Dict[str, Any], payload: Dict[str, Any]) -> Dict[str, Any]:
    """Apply rp_mother_updated event to snapshot."""
    return {
        **snapshot,
        'rp_mother': payload.get('new_value') or payload.get('rp_mother'),
    }


def _handle_mother_weight_recorded(snapshot: Dict[str, Any], payload: Dict[str, Any]) -> Dict[str, Any]:
    """Apply mother_weight_recorded event to snapshot."""
    return {
        **snapshot,
        'mother_weight': payload.get('new_value') or payload.get('mother_weight'),
    }


def _handle_scrotal_circumference_recorded(snapshot: Dict[str, Any], payload: Dict[str, Any]) -> Dict[str, Any]:
    """Apply scrotal_circumference_recorded event to snapshot."""
    return {
        **snapshot,
        'scrotal_circumference': payload.get('new_value') or payload.get('scrotal_circumference'),
    }


def _handle_insemination_recorded(snapshot: Dict[str, Any], payload: Dict[str, Any]) -> Dict[str, Any]:
    """Apply insemination_recorded event to snapshot."""
    insemination_date = payload.get('insemination_date')
    current_last = snapshot.get('last_insemination_date')
    
    # Update last_insemination_date if this is more recent
    if insemination_date and (not current_last or insemination_date > current_last):
        snapshot['last_insemination_date'] = insemination_date
    
    # Increment insemination count
    snapshot['insemination_count'] = (snapshot.get('insemination_count') or 0) + 1
    
    return snapshot


def _handle_insemination_cancelled(snapshot: Dict[str, Any], payload: Dict[str, Any]) -> Dict[str, Any]:
    """Apply insemination_cancelled event to snapshot."""
    # Decrement insemination count (but don't go below 0)
    current_count = snapshot.get('insemination_count') or 0
    snapshot['insemination_count'] = max(0, current_count - 1)
    
    # Note: We don't update last_insemination_date here because
    # that would require replaying all events to find the new "last"
    # The full rebuild will handle this correctly
    
    return snapshot


def _handle_animal_deleted(snapshot: Dict[str, Any], payload: Dict[str, Any]) -> Dict[str, Any]:
    """Apply animal_deleted event to snapshot."""
    return {
        **snapshot,
        'current_status': 'DELETED',
    }


# Event handler registry
EVENT_HANDLERS: Dict[str, Callable[[Dict[str, Any], Dict[str, Any]], Dict[str, Any]]] = {
    EventType.BIRTH_REGISTERED.value: _handle_birth_registered,
    EventType.DEATH_RECORDED.value: _handle_death_recorded,
    EventType.WEIGHT_RECORDED.value: _handle_weight_recorded,
    EventType.WEANING_WEIGHT_RECORDED.value: _handle_weaning_weight_recorded,
    EventType.MOTHER_ASSIGNED.value: _handle_mother_assigned,
    EventType.FATHER_ASSIGNED.value: _handle_father_assigned,
    EventType.STATUS_CHANGED.value: _handle_status_changed,
    EventType.GENDER_CORRECTED.value: _handle_gender_corrected,
    EventType.COLOR_RECORDED.value: _handle_color_recorded,
    EventType.ANIMAL_NUMBER_CORRECTED.value: _handle_animal_number_corrected,
    EventType.BIRTH_DATE_CORRECTED.value: _handle_birth_date_corrected,
    EventType.NOTES_UPDATED.value: _handle_notes_updated,
    EventType.MOTHER_NOTES_UPDATED.value: _handle_mother_notes_updated,
    EventType.RP_ANIMAL_UPDATED.value: _handle_rp_animal_updated,
    EventType.RP_MOTHER_UPDATED.value: _handle_rp_mother_updated,
    EventType.MOTHER_WEIGHT_RECORDED.value: _handle_mother_weight_recorded,
    EventType.SCROTAL_CIRCUMFERENCE_RECORDED.value: _handle_scrotal_circumference_recorded,
    EventType.INSEMINATION_RECORDED.value: _handle_insemination_recorded,
    EventType.INSEMINATION_CANCELLED.value: _handle_insemination_cancelled,
    EventType.ANIMAL_DELETED.value: _handle_animal_deleted,
}


# =============================================================================
# SNAPSHOT PROJECTION FUNCTIONS
# =============================================================================

def build_snapshot_from_events(events: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Build a snapshot by replaying events in order.
    
    Args:
        events: List of events ordered by event_time, id
    
    Returns:
        The computed snapshot state
    """
    snapshot: Dict[str, Any] = {
        'animal_id': None,
        'animal_number': None,
        'company_id': None,
        'birth_date': None,
        'mother_id': None,
        'father_id': None,
        'current_status': None,
        'current_weight': None,
        'weaning_weight': None,
        'gender': None,
        'color': None,
        'death_date': None,
        'last_insemination_date': None,
        'insemination_count': 0,
        'notes': None,
        'notes_mother': None,
        'rp_animal': None,
        'rp_mother': None,
        'mother_weight': None,
        'scrotal_circumference': None,
        'insemination_round_id': None,
        'insemination_identifier': None,
        'last_event_id': None,
        'last_event_time': None,
        'snapshot_version': 1,
    }
    
    for event in events:
        event_type = event.get('event_type')
        payload = event.get('payload', {})
        
        # Set animal metadata from first event
        if snapshot['animal_id'] is None:
            snapshot['animal_id'] = event.get('animal_id')
            snapshot['animal_number'] = event.get('animal_number')
            snapshot['company_id'] = event.get('company_id')
        
        # Apply event handler if available
        handler = EVENT_HANDLERS.get(event_type)
        if handler:
            snapshot = handler(snapshot, payload)
        else:
            logger.warning(f"No handler for event type: {event_type}")
        
        # Update last event tracking
        snapshot['last_event_id'] = event.get('id')
        snapshot['last_event_time'] = event.get('event_time')
    
    return snapshot


def upsert_snapshot(animal_id: int, snapshot: Dict[str, Any]) -> None:
    """
    Insert or update an animal snapshot.
    
    Args:
        animal_id: The animal ID
        snapshot: The snapshot data to save
    """
    now = datetime.utcnow().isoformat()
    
    conn.execute(
        """
        INSERT INTO animal_snapshots (
            animal_id, animal_number, company_id, birth_date, mother_id, father_id,
            current_status, current_weight, weaning_weight, gender, color, death_date,
            last_insemination_date, insemination_count, notes, notes_mother,
            rp_animal, rp_mother, mother_weight, scrotal_circumference,
            insemination_round_id, insemination_identifier,
            last_event_id, last_event_time, snapshot_version, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(animal_id) DO UPDATE SET
            animal_number = excluded.animal_number,
            birth_date = excluded.birth_date,
            mother_id = excluded.mother_id,
            father_id = excluded.father_id,
            current_status = excluded.current_status,
            current_weight = excluded.current_weight,
            weaning_weight = excluded.weaning_weight,
            gender = excluded.gender,
            color = excluded.color,
            death_date = excluded.death_date,
            last_insemination_date = excluded.last_insemination_date,
            insemination_count = excluded.insemination_count,
            notes = excluded.notes,
            notes_mother = excluded.notes_mother,
            rp_animal = excluded.rp_animal,
            rp_mother = excluded.rp_mother,
            mother_weight = excluded.mother_weight,
            scrotal_circumference = excluded.scrotal_circumference,
            insemination_round_id = excluded.insemination_round_id,
            insemination_identifier = excluded.insemination_identifier,
            last_event_id = excluded.last_event_id,
            last_event_time = excluded.last_event_time,
            snapshot_version = excluded.snapshot_version,
            updated_at = excluded.updated_at
        """,
        (
            animal_id,
            snapshot.get('animal_number'),
            snapshot.get('company_id'),
            snapshot.get('birth_date'),
            snapshot.get('mother_id'),
            snapshot.get('father_id'),
            snapshot.get('current_status'),
            snapshot.get('current_weight'),
            snapshot.get('weaning_weight'),
            snapshot.get('gender'),
            snapshot.get('color'),
            snapshot.get('death_date'),
            snapshot.get('last_insemination_date'),
            snapshot.get('insemination_count') or 0,
            snapshot.get('notes'),
            snapshot.get('notes_mother'),
            snapshot.get('rp_animal'),
            snapshot.get('rp_mother'),
            snapshot.get('mother_weight'),
            snapshot.get('scrotal_circumference'),
            snapshot.get('insemination_round_id'),
            snapshot.get('insemination_identifier'),
            snapshot.get('last_event_id'),
            snapshot.get('last_event_time'),
            snapshot.get('snapshot_version') or 1,
            now,
        )
    )
    conn.commit()


def project_animal_snapshot(animal_id: int, company_id: int) -> Dict[str, Any]:
    """
    Rebuild snapshot for a single animal from its events.
    
    Args:
        animal_id: The animal ID to project
        company_id: The company ID for data isolation
    
    Returns:
        The computed and saved snapshot
    """
    # Get all events for this animal
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
    
    events = [
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
        for row in cursor.fetchall()
    ]
    
    if not events:
        logger.warning(f"No events found for animal_id={animal_id}, company_id={company_id}")
        return {}
    
    # Build and save snapshot
    snapshot = build_snapshot_from_events(events)
    upsert_snapshot(animal_id, snapshot)
    
    logger.info(f"Projected snapshot for animal_id={animal_id}")
    return snapshot


def project_company_snapshots(company_id: int) -> int:
    """
    Rebuild all snapshots for a company.
    
    Args:
        company_id: The company to rebuild
    
    Returns:
        Number of snapshots rebuilt
    """
    # Get all unique animal_ids with events for this company
    cursor = conn.execute(
        """
        SELECT DISTINCT animal_id
        FROM domain_events
        WHERE company_id = ? AND animal_id IS NOT NULL
        """,
        (company_id,)
    )
    
    animal_ids = [row[0] for row in cursor.fetchall()]
    count = 0
    
    for animal_id in animal_ids:
        try:
            project_animal_snapshot(animal_id, company_id)
            count += 1
        except Exception as e:
            logger.error(f"Failed to project snapshot for animal_id={animal_id}: {e}")
    
    logger.info(f"Projected {count} snapshots for company_id={company_id}")
    return count


def project_all_snapshots() -> int:
    """
    Full rebuild of all snapshots across all companies.
    
    Returns:
        Total number of snapshots rebuilt
    """
    # Get all unique company_ids
    cursor = conn.execute(
        """
        SELECT DISTINCT company_id
        FROM domain_events
        WHERE company_id IS NOT NULL
        """
    )
    
    company_ids = [row[0] for row in cursor.fetchall()]
    total_count = 0
    
    for company_id in company_ids:
        count = project_company_snapshots(company_id)
        total_count += count
    
    logger.info(f"Total snapshots projected: {total_count}")
    return total_count


def process_pending_events(batch_size: int = 100) -> int:
    """
    Process events since last projection for incremental updates.
    
    This is more efficient than full rebuild for regular updates.
    
    Args:
        batch_size: Number of events to process per batch
    
    Returns:
        Number of events processed
    """
    # Get the highest last_event_id from snapshots
    cursor = conn.execute(
        """
        SELECT COALESCE(MAX(last_event_id), 0) FROM animal_snapshots
        """
    )
    last_processed_id = cursor.fetchone()[0]
    
    # Get new events
    cursor = conn.execute(
        """
        SELECT DISTINCT animal_id, company_id
        FROM domain_events
        WHERE id > ? AND animal_id IS NOT NULL
        ORDER BY id ASC
        LIMIT ?
        """,
        (last_processed_id, batch_size)
    )
    
    animals_to_update = cursor.fetchall()
    count = 0
    
    for animal_id, company_id in animals_to_update:
        try:
            project_animal_snapshot(animal_id, company_id)
            count += 1
        except Exception as e:
            logger.error(f"Failed to process events for animal_id={animal_id}: {e}")
    
    if count > 0:
        logger.info(f"Processed pending events for {count} animals")
    
    return count


def get_snapshot(animal_id: int, company_id: int) -> Optional[Dict[str, Any]]:
    """
    Get the current snapshot for an animal.
    
    Args:
        animal_id: The animal ID
        company_id: The company ID for data isolation
    
    Returns:
        The snapshot dictionary or None if not found
    """
    cursor = conn.execute(
        """
        SELECT animal_id, animal_number, company_id, birth_date, mother_id, father_id,
               current_status, current_weight, weaning_weight, gender, color, death_date,
               last_insemination_date, insemination_count, notes, notes_mother,
               rp_animal, rp_mother, mother_weight, scrotal_circumference,
               insemination_round_id, insemination_identifier,
               last_event_id, last_event_time, snapshot_version, updated_at
        FROM animal_snapshots
        WHERE animal_id = ? AND company_id = ?
        """,
        (animal_id, company_id)
    )
    
    row = cursor.fetchone()
    if not row:
        return None
    
    return {
        "animal_id": row[0],
        "animal_number": row[1],
        "company_id": row[2],
        "birth_date": row[3],
        "mother_id": row[4],
        "father_id": row[5],
        "current_status": row[6],
        "current_weight": row[7],
        "weaning_weight": row[8],
        "gender": row[9],
        "color": row[10],
        "death_date": row[11],
        "last_insemination_date": row[12],
        "insemination_count": row[13],
        "notes": row[14],
        "notes_mother": row[15],
        "rp_animal": row[16],
        "rp_mother": row[17],
        "mother_weight": row[18],
        "scrotal_circumference": row[19],
        "insemination_round_id": row[20],
        "insemination_identifier": row[21],
        "last_event_id": row[22],
        "last_event_time": row[23],
        "snapshot_version": row[24],
        "updated_at": row[25],
    }


def get_snapshots_for_company(
    company_id: int,
    status: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
) -> List[Dict[str, Any]]:
    """
    Get snapshots for a company with optional filtering.
    
    Args:
        company_id: The company ID
        status: Optional status filter (ALIVE, DEAD, etc.)
        limit: Maximum results to return
        offset: Offset for pagination
    
    Returns:
        List of snapshot dictionaries
    """
    if status:
        cursor = conn.execute(
            """
            SELECT animal_id, animal_number, company_id, birth_date, mother_id, father_id,
                   current_status, current_weight, weaning_weight, gender, color, death_date,
                   last_insemination_date, insemination_count, notes, notes_mother,
                   rp_animal, rp_mother, mother_weight, scrotal_circumference,
                   insemination_round_id, insemination_identifier,
                   last_event_id, last_event_time, snapshot_version, updated_at
            FROM animal_snapshots
            WHERE company_id = ? AND current_status = ?
            ORDER BY animal_number ASC
            LIMIT ? OFFSET ?
            """,
            (company_id, status, limit, offset)
        )
    else:
        cursor = conn.execute(
            """
            SELECT animal_id, animal_number, company_id, birth_date, mother_id, father_id,
                   current_status, current_weight, weaning_weight, gender, color, death_date,
                   last_insemination_date, insemination_count, notes, notes_mother,
                   rp_animal, rp_mother, mother_weight, scrotal_circumference,
                   insemination_round_id, insemination_identifier,
                   last_event_id, last_event_time, snapshot_version, updated_at
            FROM animal_snapshots
            WHERE company_id = ?
            ORDER BY animal_number ASC
            LIMIT ? OFFSET ?
            """,
            (company_id, limit, offset)
        )
    
    rows = cursor.fetchall()
    return [
        {
            "animal_id": row[0],
            "animal_number": row[1],
            "company_id": row[2],
            "birth_date": row[3],
            "mother_id": row[4],
            "father_id": row[5],
            "current_status": row[6],
            "current_weight": row[7],
            "weaning_weight": row[8],
            "gender": row[9],
            "color": row[10],
            "death_date": row[11],
            "last_insemination_date": row[12],
            "insemination_count": row[13],
            "notes": row[14],
            "notes_mother": row[15],
            "rp_animal": row[16],
            "rp_mother": row[17],
            "mother_weight": row[18],
            "scrotal_circumference": row[19],
            "insemination_round_id": row[20],
            "insemination_identifier": row[21],
            "last_event_id": row[22],
            "last_event_time": row[23],
            "snapshot_version": row[24],
            "updated_at": row[25],
        }
        for row in rows
    ]

