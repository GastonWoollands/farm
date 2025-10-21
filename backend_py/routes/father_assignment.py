"""
Father Assignment API Endpoints
Provides endpoints for automatic father ID assignment to registrations
"""

from fastapi import APIRouter, HTTPException, Query, Header
from typing import Dict, List
from ..services.father_assignment import create_father_assignment_service
from ..config import ADMIN_SECRET
from ..db import conn

router = APIRouter(prefix="/father-assignment", tags=["father-assignment"])


def _require_admin_auth(x_admin_secret: str | None = Header(default=None)):
    """Require admin authentication for father assignment operations"""
    if not x_admin_secret or x_admin_secret != ADMIN_SECRET:
        raise HTTPException(status_code=403, detail="Admin access required")


@router.post("/process", response_model=Dict)
async def process_father_assignments(
    dry_run: bool = Query(False, description="If true, simulate the process without making changes"),
    gestation_days: int = Query(300, description="Gestation period in days", ge=200, le=400),
    x_admin_secret: str | None = Header(default=None)
):
    """
    Process all registrations without father IDs and assign them based on insemination data.
    
    - **dry_run**: If true, simulates the process without making actual changes
    - **gestation_days**: Gestation period in days (default: 300, range: 200-400)
    
    Returns processing results and statistics.
    """
    _require_admin_auth(x_admin_secret)
    
    try:
        service = create_father_assignment_service(gestation_days)
        results = service.process_all_registrations(dry_run=dry_run)
        
        return {
            "success": True,
            "dry_run": dry_run,
            "gestation_days": gestation_days,
            "results": results
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing father assignments: {str(e)}")


@router.get("/stats", response_model=Dict)
async def get_assignment_stats():
    """
    Get statistics about father ID assignments in the system.
    
    Returns counts of registrations with/without father IDs and assignment rates.
    """
    try:
        service = create_father_assignment_service()
        stats = service.get_assignment_stats()
        
        return {
            "success": True,
            "stats": stats
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching assignment stats: {str(e)}")


@router.get("/pending", response_model=Dict)
async def get_pending_assignments():
    """
    Get list of registrations that need father ID assignment.
    
    Returns registrations without father IDs that could potentially be assigned.
    """
    try:
        service = create_father_assignment_service()
        pending = service.get_registrations_without_father()
        
        return {
            "success": True,
            "count": len(pending),
            "registrations": pending
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching pending assignments: {str(e)}")


@router.post("/process-single", response_model=Dict)
async def process_single_registration(
    registration_id: int = Query(..., description="ID of the registration to process"),
    gestation_days: int = Query(300, description="Gestation period in days", ge=200, le=400)
):
    """
    Process a single registration for father ID assignment.
    
    - **registration_id**: ID of the registration to process
    - **gestation_days**: Gestation period in days (default: 300, range: 200-400)
    
    Returns the result of processing this specific registration.
    """
    try:
        service = create_father_assignment_service(gestation_days)
        
        # Get the specific registration
        pending = service.get_registrations_without_father()
        target_registration = next(
            (reg for reg in pending if reg['id'] == registration_id), 
            None
        )
        
        if not target_registration:
            raise HTTPException(
                status_code=404, 
                detail=f"Registration {registration_id} not found or already has father ID"
            )
        
        result = service.process_single_registration(target_registration)
        
        return {
            "success": True,
            "gestation_days": gestation_days,
            "result": result
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing single registration: {str(e)}")


@router.post("/validate-assignments", response_model=Dict)
async def validate_assignments(
    gestation_days: int = Query(300, description="Gestation period in days", ge=200, le=400)
):
    """
    Validate existing father ID assignments against insemination data.
    
    - **gestation_days**: Gestation period in days (default: 300, range: 200-400)
    
    Returns validation results for existing assignments.
    """
    try:
        service = create_father_assignment_service(gestation_days)
        
        # Get all registrations with father IDs
        cursor = service.conn.execute("""
            SELECT id, animal_number, mother_id, born_date, father_id
            FROM registrations 
            WHERE mother_id IS NOT NULL 
            AND born_date IS NOT NULL 
            AND father_id IS NOT NULL 
            AND father_id != ''
            ORDER BY born_date DESC
        """)
        
        columns = [description[0] for description in cursor.description]
        registrations = [dict(zip(columns, row)) for row in cursor.fetchall()]
        
        validation_results = []
        valid_count = 0
        invalid_count = 0
        
        for registration in registrations:
            # Find matching insemination
            matching_insem = service.find_matching_insemination(
                registration['mother_id'], 
                registration['born_date']
            )
            
            is_valid = False
            expected_father = None
            gestation_days_actual = None
            
            if matching_insem:
                gestation_days_actual = service.calculate_gestation_period(
                    matching_insem['insemination_date'],
                    registration['born_date']
                )
                
                if gestation_days_actual <= gestation_days:
                    expected_father = matching_insem['bull_id'] or 'UNKNOWN'
                else:
                    expected_father = 'REPASO'
                
                is_valid = (registration['father_id'] == expected_father)
            
            validation_results.append({
                'registration_id': registration['id'],
                'animal_number': registration['animal_number'],
                'current_father': registration['father_id'],
                'expected_father': expected_father,
                'gestation_days': gestation_days_actual,
                'is_valid': is_valid,
                'has_insemination': matching_insem is not None
            })
            
            if is_valid:
                valid_count += 1
            else:
                invalid_count += 1
        
        return {
            "success": True,
            "gestation_days": gestation_days,
            "total_validated": len(registrations),
            "valid_assignments": valid_count,
            "invalid_assignments": invalid_count,
            "validation_rate": round((valid_count / len(registrations)) * 100, 2) if registrations else 0,
            "results": validation_results
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error validating assignments: {str(e)}")
