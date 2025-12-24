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
    """
    user, company_id = authenticate_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    if not company_id:
        raise HTTPException(status_code=400, detail="Company assignment required")
    
    snapshot = get_snapshot_by_number(animal_number=animal_number.upper(), company_id=company_id)
    
    if not snapshot:
        raise HTTPException(status_code=404, detail="Animal snapshot not found")
    
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
    
    from ..db import conn
    
    # Get counts by status
    cursor = conn.execute("""
        SELECT current_status, COUNT(*) as count
        FROM animal_snapshots
        WHERE company_id = ?
        GROUP BY current_status
    """, (company_id,))
    status_counts = dict(cursor.fetchall())
    
    # Get counts by gender
    cursor = conn.execute("""
        SELECT gender, COUNT(*) as count
        FROM animal_snapshots
        WHERE company_id = ?
        GROUP BY gender
    """, (company_id,))
    gender_counts = dict(cursor.fetchall())
    
    # Get weight statistics
    cursor = conn.execute("""
        SELECT 
            AVG(current_weight) as avg_weight,
            MIN(current_weight) as min_weight,
            MAX(current_weight) as max_weight,
            COUNT(current_weight) as count_with_weight
        FROM animal_snapshots
        WHERE company_id = ? AND current_weight IS NOT NULL
    """, (company_id,))
    weight_stats = cursor.fetchone()
    
    # Get total count
    cursor = conn.execute("""
        SELECT COUNT(*) FROM animal_snapshots WHERE company_id = ?
    """, (company_id,))
    total_count = cursor.fetchone()[0]
    
    # Get insemination stats
    cursor = conn.execute("""
        SELECT 
            SUM(insemination_count) as total_inseminations,
            COUNT(CASE WHEN insemination_count > 0 THEN 1 END) as animals_with_inseminations
        FROM animal_snapshots
        WHERE company_id = ?
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

