"""
Inseminations IDs API Routes
Provides endpoints for managing insemination IDs lookup table
"""

from fastapi import APIRouter, HTTPException
from typing import List
from ..services import inseminations_ids as inseminations_ids_service
from ..models import InseminationId, InseminationIdBody, UpdateInseminationIdBody

router = APIRouter(prefix="/inseminations-ids", tags=["inseminations-ids"])


@router.get("/", response_model=List[InseminationId])
def get_inseminations_ids():
    """Get all insemination IDs"""
    return inseminations_ids_service.get_inseminations_ids()


@router.get("/{insemination_round_id}", response_model=InseminationId)
def get_insemination_id(insemination_round_id: str):
    """Get a specific insemination ID by its round ID"""
    return inseminations_ids_service.get_insemination_id_by_round_id(insemination_round_id)


@router.post("/", response_model=dict)
def create_insemination_id(body: InseminationIdBody):
    """Create a new insemination ID"""
    insemination_id = inseminations_ids_service.create_insemination_id(body)
    return {"id": insemination_id, "message": "Insemination ID created successfully"}


@router.put("/{insemination_round_id}", response_model=dict)
def update_insemination_id(insemination_round_id: str, body: UpdateInseminationIdBody):
    """Update an existing insemination ID"""
    inseminations_ids_service.update_insemination_id(insemination_round_id, body)
    return {"message": "Insemination ID updated successfully"}


@router.delete("/{insemination_round_id}", response_model=dict)
def delete_insemination_id(insemination_round_id: str):
    """Delete an insemination ID"""
    inseminations_ids_service.delete_insemination_id(insemination_round_id)
    return {"message": "Insemination ID deleted successfully"}
