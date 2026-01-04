"""
Snapshot Projector Service - PostgreSQL Async Implementation

This module provides async PostgreSQL implementations for projecting domain events into animal snapshots.
The snapshot projector is the ONLY thing allowed to write to animal_snapshots.

Key principles:
- Snapshots are derived from events, never the other way around
- Snapshots are rebuildable at any time from events
- The projector applies events deterministically
- Snapshots enable fast reads without scanning events
"""

import json
import logging
import hashlib
from datetime import datetime
from typing import Dict, Optional, Any, List
from ..db_postgres import DatabaseConnection
from ..services.event_emitter_postgres import get_events_for_animal as get_events_for_animal_postgres, get_events_for_animal_by_number as get_events_for_animal_by_number_postgres

logger = logging.getLogger(__name__)


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


def _convert_to_timestamp(timestamp_str: Optional[str]) -> Optional[Any]:
    """Convert ISO timestamp string to timestamp object or None."""
    if not timestamp_str:
        return None
    try:
        if isinstance(timestamp_str, str):
            return datetime.fromisoformat(timestamp_str.replace('Z', '+00:00'))
        return timestamp_str
    except:
        return timestamp_str


async def upsert_snapshot(animal_id: int, snapshot: Dict[str, Any]) -> None:
    """
    Insert or update an animal snapshot (PostgreSQL async).
    
    Args:
        animal_id: The animal ID
        snapshot: The snapshot data to save
    """
    company_id = snapshot.get('company_id')
    if not company_id:
        raise ValueError("company_id is required for snapshot")
    
    now = datetime.utcnow()
    
    # Convert date strings to date objects
    birth_date = _convert_to_date(snapshot.get('birth_date'))
    death_date = _convert_to_date(snapshot.get('death_date'))
    sold_date = _convert_to_date(snapshot.get('sold_date'))
    last_insemination_date = _convert_to_date(snapshot.get('last_insemination_date'))
    last_event_time = _convert_to_timestamp(snapshot.get('last_event_time'))
    
    async with DatabaseConnection(company_id) as conn:
        await conn.execute(
            """
            INSERT INTO animal_snapshots (
                animal_id, animal_number, company_id, birth_date, mother_id, father_id,
                current_status, current_weight, weaning_weight, gender, color, death_date, sold_date,
                last_insemination_date, insemination_count, notes, notes_mother,
                rp_animal, rp_mother, mother_weight, scrotal_circumference,
                insemination_round_id, insemination_identifier, animal_idv,
                last_event_id, last_event_time, snapshot_version, updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28)
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
                sold_date = excluded.sold_date,
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
                animal_idv = excluded.animal_idv,
                last_event_id = excluded.last_event_id,
                last_event_time = excluded.last_event_time,
                snapshot_version = excluded.snapshot_version,
                updated_at = excluded.updated_at
            """,
            animal_id,
            snapshot.get('animal_number'),
            company_id,
            birth_date,
            snapshot.get('mother_id'),
            snapshot.get('father_id'),
            snapshot.get('current_status'),
            snapshot.get('current_weight'),
            snapshot.get('weaning_weight'),
            snapshot.get('gender'),
            snapshot.get('color'),
            death_date,
            sold_date,
            last_insemination_date,
            snapshot.get('insemination_count') or 0,
            snapshot.get('notes'),
            snapshot.get('notes_mother'),
            snapshot.get('rp_animal'),
            snapshot.get('rp_mother'),
            snapshot.get('mother_weight'),
            snapshot.get('scrotal_circumference'),
            snapshot.get('insemination_round_id'),
            snapshot.get('insemination_identifier'),
            snapshot.get('animal_idv'),
            snapshot.get('last_event_id'),
            last_event_time,
            snapshot.get('snapshot_version') or 1,
            now,
        )


async def _upsert_snapshot_direct(animal_id: int, snapshot: Dict[str, Any]) -> None:
    """
    Insert or update snapshot directly, bypassing foreign key constraints.
    Used for animals without registration records (e.g., mothers/fathers).
    """
    company_id = snapshot.get('company_id')
    if not company_id:
        raise ValueError("company_id is required for snapshot")
    
    now = datetime.utcnow()
    
    # Convert date strings to date objects
    birth_date = _convert_to_date(snapshot.get('birth_date'))
    death_date = _convert_to_date(snapshot.get('death_date'))
    sold_date = _convert_to_date(snapshot.get('sold_date'))
    last_insemination_date = _convert_to_date(snapshot.get('last_insemination_date'))
    last_event_time = _convert_to_timestamp(snapshot.get('last_event_time'))
    
    async with DatabaseConnection(company_id) as conn:
        await conn.execute(
            """
            INSERT INTO animal_snapshots (
                animal_id, animal_number, company_id, birth_date, mother_id, father_id,
                current_status, current_weight, weaning_weight, gender, color, death_date, sold_date,
                last_insemination_date, insemination_count, notes, notes_mother,
                rp_animal, rp_mother, mother_weight, scrotal_circumference,
                insemination_round_id, insemination_identifier, animal_idv,
                last_event_id, last_event_time, snapshot_version, updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28)
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
                sold_date = excluded.sold_date,
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
                animal_idv = excluded.animal_idv,
                last_event_id = excluded.last_event_id,
                last_event_time = excluded.last_event_time,
                snapshot_version = excluded.snapshot_version,
                updated_at = excluded.updated_at
            """,
            animal_id,
            snapshot.get('animal_number'),
            company_id,
            birth_date,
            snapshot.get('mother_id'),
            snapshot.get('father_id'),
            snapshot.get('current_status'),
            snapshot.get('current_weight'),
            snapshot.get('weaning_weight'),
            snapshot.get('gender'),
            snapshot.get('color'),
            death_date,
            sold_date,
            last_insemination_date,
            snapshot.get('insemination_count') or 0,
            snapshot.get('notes'),
            snapshot.get('notes_mother'),
            snapshot.get('rp_animal'),
            snapshot.get('rp_mother'),
            snapshot.get('mother_weight'),
            snapshot.get('scrotal_circumference'),
            snapshot.get('insemination_round_id'),
            snapshot.get('insemination_identifier'),
            snapshot.get('animal_idv'),
            snapshot.get('last_event_id'),
            last_event_time,
            snapshot.get('snapshot_version') or 1,
            now,
        )


async def project_animal_snapshot_incremental(animal_id: int, company_id: int) -> Dict[str, Any]:
    """
    Incrementally update snapshot by only processing events after last_event_time.
    More efficient than full rebuild for regular updates.
    
    Args:
        animal_id: The animal ID to project
        company_id: The company ID for data isolation
    
    Returns:
        The computed and saved snapshot
    """
    # Import locally to avoid circular dependency
    from ..services.snapshot_projector import EVENT_HANDLERS, build_snapshot_from_events
    
    # Get current snapshot to find last_event_time
    current_snapshot = await get_snapshot(animal_id, company_id)
    last_event_time = current_snapshot.get('last_event_time') if current_snapshot else None
    last_event_id = current_snapshot.get('last_event_id', 0) if current_snapshot else 0
    
    # Get events (incremental or full)
    if last_event_time:
        # Convert to timestamp for comparison
        last_event_time_ts = _convert_to_timestamp(last_event_time)
        async with DatabaseConnection(company_id) as conn:
            rows = await conn.fetch(
                """
                SELECT id, event_id, animal_id, animal_number, event_type, event_version,
                       payload, metadata, company_id, user_id, event_time, created_at
                FROM domain_events
                WHERE animal_id = $1 AND company_id = $2 
                AND (event_time > $3 OR (event_time = $3 AND id > $4))
                ORDER BY event_time ASC, id ASC
                """,
                animal_id,
                company_id,
                last_event_time_ts,
                last_event_id
            )
    else:
        # Full rebuild: Fetch all events
        rows = await get_events_for_animal_postgres(animal_id, company_id)
        # Convert to list of dicts if needed
        if rows and isinstance(rows[0], dict):
            events = rows
        else:
            async with DatabaseConnection(company_id) as conn:
                rows = await conn.fetch(
                    """
                    SELECT id, event_id, animal_id, animal_number, event_type, event_version,
                           payload, metadata, company_id, user_id, event_time, created_at
                    FROM domain_events
                    WHERE animal_id = $1 AND company_id = $2
                    ORDER BY event_time ASC, id ASC
                    """,
                    animal_id,
                    company_id
                )
    
    # Convert rows to event dicts
    events = []
    for row in rows:
        if isinstance(row, dict):
            events.append(row)
        else:
            events.append({
                "id": row['id'],
                "event_id": row['event_id'],
                "animal_id": row['animal_id'],
                "animal_number": row['animal_number'],
                "event_type": row['event_type'],
                "event_version": row['event_version'],
                "payload": row['payload'] if isinstance(row['payload'], dict) else json.loads(row['payload']) if row['payload'] else {},
                "metadata": row['metadata'] if isinstance(row['metadata'], dict) else json.loads(row['metadata']) if row['metadata'] else {},
                "company_id": row['company_id'],
                "user_id": row['user_id'],
                "event_time": row['event_time'].isoformat() if hasattr(row['event_time'], 'isoformat') else str(row['event_time']),
                "created_at": row['created_at'].isoformat() if hasattr(row['created_at'], 'isoformat') else str(row['created_at']),
            })
    
    if not events:
        if current_snapshot:
            return current_snapshot
        else:
            logger.warning(f"No events found for animal_id={animal_id}, company_id={company_id}")
            return {}
    
    # Build snapshot: start from current snapshot state or empty
    if current_snapshot:
        snapshot = current_snapshot.copy()
        for event in events:
            handler = EVENT_HANDLERS.get(event['event_type'])
            if handler:
                snapshot = handler(snapshot, event['payload'])
            snapshot['last_event_id'] = event['id']
            snapshot['last_event_time'] = event['event_time']
    else:
        snapshot = build_snapshot_from_events(events)
    
    # Upsert updated snapshot
    await upsert_snapshot(animal_id, snapshot)
    
    logger.info(f"Projected snapshot incrementally for animal_id={animal_id} ({len(events)} new events)")
    return snapshot


async def project_animal_snapshot(animal_id: int, company_id: int) -> Dict[str, Any]:
    """
    Rebuild snapshot for a single animal from its events.
    Uses incremental projection if snapshot exists, otherwise full rebuild.
    
    Args:
        animal_id: The animal ID to project
        company_id: The company ID for data isolation
    
    Returns:
        The computed and saved snapshot
    """
    return await project_animal_snapshot_incremental(animal_id, company_id)


async def get_snapshot(animal_id: int, company_id: int) -> Optional[Dict[str, Any]]:
    """
    Get the current snapshot for an animal.
    
    Args:
        animal_id: The animal ID
        company_id: The company ID for data isolation
    
    Returns:
        The snapshot dictionary or None if not found
    """
    async with DatabaseConnection(company_id) as conn:
        row = await conn.fetchrow(
            """
            SELECT animal_id, animal_number, company_id, birth_date, mother_id, father_id,
                   current_status, current_weight, weaning_weight, gender, color, death_date, sold_date,
                   last_insemination_date, insemination_count, notes, notes_mother,
                   rp_animal, rp_mother, mother_weight, scrotal_circumference,
                   insemination_round_id, insemination_identifier, animal_idv,
                   last_event_id, last_event_time, snapshot_version, updated_at
            FROM animal_snapshots
            WHERE animal_id = $1 AND company_id = $2
            """,
            animal_id,
            company_id
        )
        
        if not row:
            return None
        
        return {
            "animal_id": row['animal_id'],
            "animal_number": row['animal_number'],
            "company_id": row['company_id'],
            "birth_date": row['birth_date'].isoformat() if row['birth_date'] and hasattr(row['birth_date'], 'isoformat') else str(row['birth_date']) if row['birth_date'] else None,
            "mother_id": row['mother_id'],
            "father_id": row['father_id'],
            "current_status": row['current_status'],
            "current_weight": row['current_weight'],
            "weaning_weight": row['weaning_weight'],
            "gender": row['gender'],
            "color": row['color'],
            "death_date": row['death_date'].isoformat() if row['death_date'] and hasattr(row['death_date'], 'isoformat') else str(row['death_date']) if row['death_date'] else None,
            "sold_date": row['sold_date'].isoformat() if row['sold_date'] and hasattr(row['sold_date'], 'isoformat') else str(row['sold_date']) if row['sold_date'] else None,
            "last_insemination_date": row['last_insemination_date'].isoformat() if row['last_insemination_date'] and hasattr(row['last_insemination_date'], 'isoformat') else str(row['last_insemination_date']) if row['last_insemination_date'] else None,
            "insemination_count": row['insemination_count'],
            "notes": row['notes'],
            "notes_mother": row['notes_mother'],
            "rp_animal": row['rp_animal'],
            "rp_mother": row['rp_mother'],
            "mother_weight": row['mother_weight'],
            "scrotal_circumference": row['scrotal_circumference'],
            "insemination_round_id": row['insemination_round_id'],
            "insemination_identifier": row['insemination_identifier'],
            "animal_idv": row['animal_idv'],
            "last_event_id": row['last_event_id'],
            "last_event_time": row['last_event_time'].isoformat() if row['last_event_time'] and hasattr(row['last_event_time'], 'isoformat') else str(row['last_event_time']) if row['last_event_time'] else None,
            "snapshot_version": row['snapshot_version'],
            "updated_at": row['updated_at'].isoformat() if row['updated_at'] and hasattr(row['updated_at'], 'isoformat') else str(row['updated_at']) if row['updated_at'] else None,
        }


async def get_snapshot_by_number(animal_number: str, company_id: int) -> Optional[Dict[str, Any]]:
    """
    Get the current snapshot for an animal by animal_number.
    Used for animals that don't have registration records (e.g., mothers/fathers).
    
    Args:
        animal_number: The animal number
        company_id: The company ID for data isolation
    
    Returns:
        The snapshot dictionary or None if not found
    """
    async with DatabaseConnection(company_id) as conn:
        row = await conn.fetchrow(
            """
            SELECT animal_id, animal_number, company_id, birth_date, mother_id, father_id,
                   current_status, current_weight, weaning_weight, gender, color, death_date, sold_date,
                   last_insemination_date, insemination_count, notes, notes_mother,
                   rp_animal, rp_mother, mother_weight, scrotal_circumference,
                   insemination_round_id, insemination_identifier, animal_idv,
                   last_event_id, last_event_time, snapshot_version, updated_at
            FROM animal_snapshots
            WHERE animal_number = $1 AND company_id = $2
            """,
            animal_number,
            company_id
        )
        
        if not row:
            return None
        
        return {
            "animal_id": row['animal_id'],
            "animal_number": row['animal_number'],
            "company_id": row['company_id'],
            "birth_date": row['birth_date'].isoformat() if row['birth_date'] and hasattr(row['birth_date'], 'isoformat') else str(row['birth_date']) if row['birth_date'] else None,
            "mother_id": row['mother_id'],
            "father_id": row['father_id'],
            "current_status": row['current_status'],
            "current_weight": row['current_weight'],
            "weaning_weight": row['weaning_weight'],
            "gender": row['gender'],
            "color": row['color'],
            "death_date": row['death_date'].isoformat() if row['death_date'] and hasattr(row['death_date'], 'isoformat') else str(row['death_date']) if row['death_date'] else None,
            "sold_date": row['sold_date'].isoformat() if row['sold_date'] and hasattr(row['sold_date'], 'isoformat') else str(row['sold_date']) if row['sold_date'] else None,
            "last_insemination_date": row['last_insemination_date'].isoformat() if row['last_insemination_date'] and hasattr(row['last_insemination_date'], 'isoformat') else str(row['last_insemination_date']) if row['last_insemination_date'] else None,
            "insemination_count": row['insemination_count'],
            "notes": row['notes'],
            "notes_mother": row['notes_mother'],
            "rp_animal": row['rp_animal'],
            "rp_mother": row['rp_mother'],
            "mother_weight": row['mother_weight'],
            "scrotal_circumference": row['scrotal_circumference'],
            "insemination_round_id": row['insemination_round_id'],
            "insemination_identifier": row['insemination_identifier'],
            "animal_idv": row['animal_idv'],
            "last_event_id": row['last_event_id'],
            "last_event_time": row['last_event_time'].isoformat() if row['last_event_time'] and hasattr(row['last_event_time'], 'isoformat') else str(row['last_event_time']) if row['last_event_time'] else None,
            "snapshot_version": row['snapshot_version'],
            "updated_at": row['updated_at'].isoformat() if row['updated_at'] and hasattr(row['updated_at'], 'isoformat') else str(row['updated_at']) if row['updated_at'] else None,
        }


async def project_animal_snapshot_by_number_incremental(animal_number: str, company_id: int) -> Dict[str, Any]:
    """
    Incrementally update snapshot by animal_number (for mothers/fathers without animal_id).
    Filters events by last_event_time for efficiency.
    
    Args:
        animal_number: The animal number to project
        company_id: The company ID for data isolation
    
    Returns:
        The computed and saved snapshot
    """
    # Import locally to avoid circular dependency
    from ..services.snapshot_projector import EVENT_HANDLERS, build_snapshot_from_events
    
    # Get current snapshot to find last_event_time
    current_snapshot = await get_snapshot_by_number(animal_number, company_id)
    last_event_time = current_snapshot.get('last_event_time') if current_snapshot else None
    last_event_id = current_snapshot.get('last_event_id', 0) if current_snapshot else 0
    
    # Get events
    if last_event_time:
        last_event_time_ts = _convert_to_timestamp(last_event_time)
        async with DatabaseConnection(company_id) as conn:
            rows = await conn.fetch(
                """
                SELECT id, event_id, animal_id, animal_number, event_type, event_version,
                       payload, metadata, company_id, user_id, event_time, created_at
                FROM domain_events
                WHERE animal_number = $1 AND company_id = $2 
                AND (event_time > $3 OR (event_time = $3 AND id > $4))
                ORDER BY event_time ASC, id ASC
                """,
                animal_number,
                company_id,
                last_event_time_ts,
                last_event_id
            )
    else:
        rows = await get_events_for_animal_by_number_postgres(animal_number, company_id)
    
    # Convert rows to event dicts
    events = []
    for row in rows:
        if isinstance(row, dict):
            events.append(row)
        else:
            events.append({
                "id": row['id'],
                "event_id": row['event_id'],
                "animal_id": row['animal_id'],
                "animal_number": row['animal_number'],
                "event_type": row['event_type'],
                "event_version": row['event_version'],
                "payload": row['payload'] if isinstance(row['payload'], dict) else json.loads(row['payload']) if row['payload'] else {},
                "metadata": row['metadata'] if isinstance(row['metadata'], dict) else json.loads(row['metadata']) if row['metadata'] else {},
                "company_id": row['company_id'],
                "user_id": row['user_id'],
                "event_time": row['event_time'].isoformat() if hasattr(row['event_time'], 'isoformat') else str(row['event_time']),
                "created_at": row['created_at'].isoformat() if hasattr(row['created_at'], 'isoformat') else str(row['created_at']),
            })
    
    if not events:
        if current_snapshot:
            return current_snapshot
        else:
            logger.warning(f"No events found for animal_number={animal_number}, company_id={company_id}")
            return {}
    
    # Build snapshot from events
    if current_snapshot:
        snapshot = current_snapshot.copy()
        for event in events:
            handler = EVENT_HANDLERS.get(event['event_type'])
            if handler:
                snapshot = handler(snapshot, event['payload'])
            snapshot['last_event_id'] = event['id']
            snapshot['last_event_time'] = event['event_time']
    else:
        snapshot = build_snapshot_from_events(events)
    
    # Get animal_id from snapshot (may be NULL for mothers)
    animal_id = snapshot.get('animal_id')
    
    if animal_id is None:
        # For mothers/fathers without registration, use a hash-based negative ID
        hash_str = f"{animal_number}_{company_id}".encode()
        hash_int = int(hashlib.md5(hash_str).hexdigest()[:8], 16)
        animal_id = -abs(hash_int % (2**30))
        snapshot['animal_id'] = animal_id
    
    # Upsert snapshot
    await _upsert_snapshot_direct(animal_id, snapshot)
    
    logger.info(f"Projected snapshot incrementally for animal_number={animal_number} ({len(events)} new events, animal_id={animal_id})")
    return snapshot


async def project_animal_snapshot_by_number(animal_number: str, company_id: int) -> Dict[str, Any]:
    """
    Rebuild snapshot for an animal identified by animal_number (e.g., mothers without registration).
    Uses incremental projection if snapshot exists, otherwise full rebuild.
    
    Args:
        animal_number: The animal number to project
        company_id: The company ID for data isolation
    
    Returns:
        The computed and saved snapshot
    """
    return await project_animal_snapshot_by_number_incremental(animal_number, company_id)


async def get_snapshots_for_company(
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
    async with DatabaseConnection(company_id) as conn:
        if status:
            rows = await conn.fetch(
                """
                SELECT animal_id, animal_number, company_id, birth_date, mother_id, father_id,
                       current_status, current_weight, weaning_weight, gender, color, death_date, sold_date,
                       last_insemination_date, insemination_count, notes, notes_mother,
                       rp_animal, rp_mother, mother_weight, scrotal_circumference,
                       insemination_round_id, insemination_identifier, animal_idv,
                       last_event_id, last_event_time, snapshot_version, updated_at
                FROM animal_snapshots
                WHERE company_id = $1 AND current_status = $2
                ORDER BY animal_number ASC
                LIMIT $3 OFFSET $4
                """,
                company_id,
                status,
                limit,
                offset
            )
        else:
            rows = await conn.fetch(
                """
                SELECT animal_id, animal_number, company_id, birth_date, mother_id, father_id,
                       current_status, current_weight, weaning_weight, gender, color, death_date, sold_date,
                       last_insemination_date, insemination_count, notes, notes_mother,
                       rp_animal, rp_mother, mother_weight, scrotal_circumference,
                       insemination_round_id, insemination_identifier, animal_idv,
                       last_event_id, last_event_time, snapshot_version, updated_at
                FROM animal_snapshots
                WHERE company_id = $1 AND (current_status IS NULL OR current_status != 'DELETED')
                ORDER BY animal_number ASC
                LIMIT $2 OFFSET $3
                """,
                company_id,
                limit,
                offset
            )
        
        return [
            {
                "animal_id": row['animal_id'],
                "animal_number": row['animal_number'],
                "company_id": row['company_id'],
                "birth_date": row['birth_date'].isoformat() if row['birth_date'] and hasattr(row['birth_date'], 'isoformat') else str(row['birth_date']) if row['birth_date'] else None,
                "mother_id": row['mother_id'],
                "father_id": row['father_id'],
                "current_status": row['current_status'],
                "current_weight": row['current_weight'],
                "weaning_weight": row['weaning_weight'],
                "gender": row['gender'],
                "color": row['color'],
                "death_date": row['death_date'].isoformat() if row['death_date'] and hasattr(row['death_date'], 'isoformat') else str(row['death_date']) if row['death_date'] else None,
                "sold_date": row['sold_date'].isoformat() if row['sold_date'] and hasattr(row['sold_date'], 'isoformat') else str(row['sold_date']) if row['sold_date'] else None,
                "last_insemination_date": row['last_insemination_date'].isoformat() if row['last_insemination_date'] and hasattr(row['last_insemination_date'], 'isoformat') else str(row['last_insemination_date']) if row['last_insemination_date'] else None,
                "insemination_count": row['insemination_count'],
                "notes": row['notes'],
                "notes_mother": row['notes_mother'],
                "rp_animal": row['rp_animal'],
                "rp_mother": row['rp_mother'],
                "mother_weight": row['mother_weight'],
                "scrotal_circumference": row['scrotal_circumference'],
                "insemination_round_id": row['insemination_round_id'],
                "insemination_identifier": row['insemination_identifier'],
                "animal_idv": row['animal_idv'],
                "last_event_id": row['last_event_id'],
                "last_event_time": row['last_event_time'].isoformat() if row['last_event_time'] and hasattr(row['last_event_time'], 'isoformat') else str(row['last_event_time']) if row['last_event_time'] else None,
                "snapshot_version": row['snapshot_version'],
                "updated_at": row['updated_at'].isoformat() if row['updated_at'] and hasattr(row['updated_at'], 'isoformat') else str(row['updated_at']) if row['updated_at'] else None,
            }
            for row in rows
        ]

