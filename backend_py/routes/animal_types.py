from fastapi import APIRouter
from ..services import animal_types

router = APIRouter()

@router.get("/animal-types")
async def get_animal_types():
    """Get all animal types"""
    return animal_types.get_animal_types()

@router.get("/animal-types/{animal_type_id}")
async def get_animal_type(animal_type_id: int):
    """Get a specific animal type by ID"""
    result = animal_types.get_animal_type_by_id(animal_type_id)
    if not result:
        return {"error": "Animal type not found"}
    return result
