"""
Snapshot Routes

API endpoints for reading animal snapshots (derived state from events).
Snapshots are optimized for fast reads - listings, filtering, and metrics.
"""

from fastapi import APIRouter, Header, HTTPException, Request, Query
from typing import Optional
from ..services.snapshot_projector import (
    get_snapshot,
    get_snapshots_for_company,
    get_snapshot_by_number,
    project_animal_snapshot_by_number,
)
from ..services.auth_service import authenticate_user

router = APIRouter()


@router.get("/snapshots")
def list_snapshots(
    request: Request,
    status: Optional[str] = Query(None, description="Filter by status (ALIVE, DEAD)"),
    limit: int = Query(100, le=1000, description="Maximum results to return"),
    offset: int = Query(0, ge=0, description="Offset for pagination"),
):
    """
    Get animal snapshots for the current user's company.
    
    Snapshots are derived from events and optimized for fast reads.
    Use this endpoint for:
    - Animal listings
    - Dashboard metrics
    - Search and filtering
    
    For full audit history, use /events/animal/{animal_id}/history instead.
    """
    user, company_id = authenticate_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    if not company_id:
        raise HTTPException(status_code=400, detail="Company assignment required")
    
    snapshots = get_snapshots_for_company(
        company_id=company_id,
        status=status,
        limit=limit,
        offset=offset,
    )
    
    return {
        "snapshots": snapshots,
        "count": len(snapshots),
        "limit": limit,
        "offset": offset,
        "company_id": company_id,
    }


@router.get("/snapshots/{animal_id}")
def get_animal_snapshot(
    animal_id: int,
    request: Request,
):
    """
    Get the current snapshot for a specific animal.
    
    Returns the derived state of the animal based on all events.
    """
    user, company_id = authenticate_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    if not company_id:
        raise HTTPException(status_code=400, detail="Company assignment required")
    
    snapshot = get_snapshot(animal_id=animal_id, company_id=company_id)
    
    if not snapshot:
        raise HTTPException(status_code=404, detail="Animal snapshot not found")
    
    # Check if animal is DELETED - don't return DELETED animals
    if snapshot.get('current_status') == 'DELETED':
        raise HTTPException(status_code=404, detail="Animal not found")
    
    return snapshot


@router.get("/snapshots/by-number/{animal_number}")
def get_animal_snapshot_by_number(
    animal_number: str,
    request: Request,
):
    """
    Get snapshot for an animal by animal_number (works for mothers/fathers without registration).
    
    Returns the derived state of the animal based on all events.
    Useful for looking up snapshots when you have the animal_number but not the ID.
    
    If snapshot doesn't exist but events do, automatically projects the snapshot.
    """
    user, company_id = authenticate_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    if not company_id:
        raise HTTPException(status_code=400, detail="Company assignment required")
    
    animal_number_upper = animal_number.upper()
    snapshot = get_snapshot_by_number(animal_number=animal_number_upper, company_id=company_id)
    
    # If snapshot doesn't exist, check if events exist and auto-project
    if not snapshot:
        from ..config import USE_POSTGRES
        if USE_POSTGRES:
            from ..db_postgres import DatabaseConnection
            import asyncio
            async def check_events():
                async with DatabaseConnection(company_id) as conn:
                    count = await conn.fetchval(
                        """
                        SELECT COUNT(*) FROM domain_events
                        WHERE animal_number = $1 AND company_id = $2
                        """,
                        animal_number_upper,
                        company_id
                    )
                    return count
            try:
                loop = asyncio.get_event_loop()
            except RuntimeError:
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
            event_count = loop.run_until_complete(check_events())
        else:
            from ..db import conn
            cursor = conn.execute(
                """
                SELECT COUNT(*) FROM domain_events
                WHERE animal_number = ? AND company_id = ?
                """,
                (animal_number_upper, company_id)
            )
            event_count = cursor.fetchone()[0]
        
        if event_count > 0:
            # Events exist but no snapshot - auto-project it
            try:
                snapshot = project_animal_snapshot_by_number(animal_number_upper, company_id)
            except Exception as e:
                import logging
                logging.error(f"Failed to auto-project snapshot for {animal_number_upper}: {e}")
                raise HTTPException(status_code=404, detail="Animal snapshot not found")
        else:
            # No events and no snapshot
            raise HTTPException(status_code=404, detail="Animal snapshot not found")
    
    # Check if animal is DELETED - don't return DELETED animals
    if snapshot and snapshot.get('current_status') == 'DELETED':
        raise HTTPException(status_code=404, detail="Animal not found")
    
    return snapshot


@router.get("/snapshots/stats")
def get_snapshot_stats(
    request: Request,
):
    """
    Get aggregated statistics from snapshots.
    
    Returns counts and metrics derived from animal snapshots.
    """
    user, company_id = authenticate_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    if not company_id:
        raise HTTPException(status_code=400, detail="Company assignment required")
    
    from ..config import USE_POSTGRES
    
    if USE_POSTGRES:
        from ..db_postgres import DatabaseConnection
        import asyncio
        
        async def get_stats():
            async with DatabaseConnection(company_id) as conn:
                # Get counts by status (excluding DELETED)
                status_rows = await conn.fetch(
                    """
                    SELECT current_status, COUNT(*) as count
                    FROM animal_snapshots
                    WHERE company_id = $1 AND (current_status IS NULL OR current_status != 'DELETED')
                    GROUP BY current_status
                    """,
                    company_id
                )
                status_counts = {row['current_status']: row['count'] for row in status_rows}
                
                # Get counts by gender (excluding DELETED)
                gender_rows = await conn.fetch(
                    """
                    SELECT gender, COUNT(*) as count
                    FROM animal_snapshots
                    WHERE company_id = $1 AND (current_status IS NULL OR current_status != 'DELETED')
                    GROUP BY gender
                    """,
                    company_id
                )
                gender_counts = {row['gender']: row['count'] for row in gender_rows}
                
                # Get weight statistics (excluding DELETED)
                weight_row = await conn.fetchrow(
                    """
                    SELECT 
                        AVG(current_weight) as avg_weight,
                        MIN(current_weight) as min_weight,
                        MAX(current_weight) as max_weight,
                        COUNT(current_weight) as count_with_weight
                    FROM animal_snapshots
                    WHERE company_id = $1 AND current_weight IS NOT NULL 
                    AND (current_status IS NULL OR current_status != 'DELETED')
                    """,
                    company_id
                )
                weight_stats = (
                    weight_row['avg_weight'],
                    weight_row['min_weight'],
                    weight_row['max_weight'],
                    weight_row['count_with_weight']
                ) if weight_row else (None, None, None, 0)
                
                # Get total count (excluding DELETED)
                total_count = await conn.fetchval(
                    """
                    SELECT COUNT(*) FROM animal_snapshots 
                    WHERE company_id = $1 AND (current_status IS NULL OR current_status != 'DELETED')
                    """,
                    company_id
                )
                
                # Get insemination stats (excluding DELETED)
                insem_row = await conn.fetchrow(
                    """
                    SELECT 
                        SUM(insemination_count) as total_inseminations,
                        COUNT(CASE WHEN insemination_count > 0 THEN 1 END) as animals_with_inseminations
                    FROM animal_snapshots
                    WHERE company_id = $1 AND (current_status IS NULL OR current_status != 'DELETED')
                    """,
                    company_id
                )
                insem_stats = (
                    insem_row['total_inseminations'] or 0,
                    insem_row['animals_with_inseminations'] or 0
                ) if insem_row else (0, 0)
                
                return status_counts, gender_counts, weight_stats, total_count, insem_stats
        
        try:
            loop = asyncio.get_event_loop()
        except RuntimeError:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
        status_counts, gender_counts, weight_stats, total_count, insem_stats = loop.run_until_complete(get_stats())
    else:
        from ..db import conn
        
        # Exclude DELETED animals from all stats
        deleted_filter = "AND (current_status IS NULL OR current_status != 'DELETED')"
        
        # Get counts by status (excluding DELETED)
        cursor = conn.execute(f"""
            SELECT current_status, COUNT(*) as count
            FROM animal_snapshots
            WHERE company_id = ? {deleted_filter}
            GROUP BY current_status
        """, (company_id,))
        status_counts = dict(cursor.fetchall())
        
        # Get counts by gender (excluding DELETED)
        cursor = conn.execute(f"""
            SELECT gender, COUNT(*) as count
            FROM animal_snapshots
            WHERE company_id = ? {deleted_filter}
            GROUP BY gender
        """, (company_id,))
        gender_counts = dict(cursor.fetchall())
        
        # Get weight statistics (excluding DELETED)
        cursor = conn.execute(f"""
            SELECT 
                AVG(current_weight) as avg_weight,
                MIN(current_weight) as min_weight,
                MAX(current_weight) as max_weight,
                COUNT(current_weight) as count_with_weight
            FROM animal_snapshots
            WHERE company_id = ? AND current_weight IS NOT NULL {deleted_filter}
        """, (company_id,))
        weight_stats = cursor.fetchone()
        
        # Get total count (excluding DELETED)
        cursor = conn.execute(f"""
            SELECT COUNT(*) FROM animal_snapshots WHERE company_id = ? {deleted_filter}
        """, (company_id,))
        total_count = cursor.fetchone()[0]
        
        # Get insemination stats (excluding DELETED)
        cursor = conn.execute(f"""
            SELECT 
                SUM(insemination_count) as total_inseminations,
                COUNT(CASE WHEN insemination_count > 0 THEN 1 END) as animals_with_inseminations
            FROM animal_snapshots
            WHERE company_id = ? {deleted_filter}
        """, (company_id,))
        insem_stats = cursor.fetchone()
    
    return {
        "total_animals": total_count,
        "by_status": status_counts,
        "by_gender": gender_counts,
        "weight": {
            "average": round(weight_stats[0], 2) if weight_stats[0] else None,
            "minimum": weight_stats[1],
            "maximum": weight_stats[2],
            "count_with_weight": weight_stats[3],
        },
        "inseminations": {
            "total": insem_stats[0] or 0,
            "animals_with_inseminations": insem_stats[1] or 0,
        },
        "company_id": company_id,
    }

