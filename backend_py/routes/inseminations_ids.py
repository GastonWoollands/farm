"""
Inseminations IDs API Routes
Provides endpoints for managing insemination IDs lookup table
"""

from fastapi import APIRouter, HTTPException, Request
from typing import List
from ..services import inseminations_ids as inseminations_ids_service
from ..services.auth_service import authenticate_user
from ..models import InseminationId, InseminationIdBody, UpdateInseminationIdBody

router = APIRouter(prefix="/inseminations-ids", tags=["inseminations-ids"])


@router.get("/", response_model=List[InseminationId])
def get_inseminations_ids(request: Request):
    """Get all insemination IDs for the authenticated user's company"""
    user, company_id = authenticate_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    return inseminations_ids_service.get_inseminations_ids(company_id)


@router.get("/{insemination_round_id}", response_model=InseminationId)
def get_insemination_id(insemination_round_id: str, request: Request):
    """Get a specific insemination ID by its round ID"""
    user, company_id = authenticate_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    return inseminations_ids_service.get_insemination_id_by_round_id(insemination_round_id, company_id)


@router.post("/", response_model=dict)
def create_insemination_id(body: InseminationIdBody, request: Request):
    """Create a new insemination ID"""
    user, company_id = authenticate_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    # Set company_id from authenticated user
    body.company_id = company_id
    
    insemination_id = inseminations_ids_service.create_insemination_id(body)
    return {"id": insemination_id, "message": "Insemination ID created successfully"}


@router.put("/{insemination_round_id}", response_model=dict)
def update_insemination_id(insemination_round_id: str, body: UpdateInseminationIdBody, request: Request):
    """Update an existing insemination ID"""
    user, company_id = authenticate_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    inseminations_ids_service.update_insemination_id(insemination_round_id, body, company_id)
    return {"message": "Insemination ID updated successfully"}


@router.delete("/{insemination_round_id}", response_model=dict)
def delete_insemination_id(insemination_round_id: str, request: Request):
    """Delete an insemination ID"""
    user, company_id = authenticate_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    inseminations_ids_service.delete_insemination_id(insemination_round_id, company_id)
    return {"message": "Insemination ID deleted successfully"}
