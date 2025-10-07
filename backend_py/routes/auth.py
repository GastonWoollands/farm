from fastapi import APIRouter
from ..config import VALID_KEYS
from ..models import ValidateKeyBody

router = APIRouter()

@router.post("/validate-key")
def validate_key(body: ValidateKeyBody):
    valid = body.key in VALID_KEYS
    return {"valid": valid}


