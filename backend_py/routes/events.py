from fastapi import APIRouter, Header, HTTPException, Request, Query
from ..services.events import get_events_by_animal, get_events_by_user, get_events_by_type, get_death_events, get_birth_events
from ..services.event_emitter import get_events_for_animal, get_events_for_animal_by_number
from ..services.firebase_auth import verify_bearer_id_token
from ..services.auth_service import authenticate_user

router = APIRouter()

@router.get("/events/animal/{animal_id}")
def get_animal_events(animal_id: int, request: Request, x_user_key: str | None = Header(default=None)):
    """Get all events for a specific animal"""
    decoded = verify_bearer_id_token(request.headers.get('Authorization'))
    user_id = decoded.get('uid') if decoded else None
    if not user_id:
        if not x_user_key:
            raise HTTPException(status_code=401, detail="Unauthorized")
        user_id = x_user_key
    
    events = get_events_by_animal(animal_id, user_id)
    return {"count": len(events), "events": events}

@router.get("/events/user")
def get_user_events(request: Request, x_user_key: str | None = Header(default=None), limit: int = Query(100, le=500)):
    """Get recent events for the current user"""
    decoded = verify_bearer_id_token(request.headers.get('Authorization'))
    user_id = decoded.get('uid') if decoded else None
    if not user_id:
        if not x_user_key:
            raise HTTPException(status_code=401, detail="Unauthorized")
        user_id = x_user_key
    
    events = get_events_by_user(user_id, limit)
    return {"count": len(events), "events": events}

@router.get("/events/type/{event_type}")
def get_events_by_type_endpoint(event_type: str, request: Request, x_user_key: str | None = Header(default=None), limit: int = Query(100, le=500)):
    """Get events by type (born, death, correccion)"""
    if event_type not in ["born", "death", "correccion"]:
        raise HTTPException(status_code=400, detail="Invalid event type. Must be: born, death, or correccion")
    
    decoded = verify_bearer_id_token(request.headers.get('Authorization'))
    user_id = decoded.get('uid') if decoded else None
    if not user_id:
        if not x_user_key:
            raise HTTPException(status_code=401, detail="Unauthorized")
        user_id = x_user_key
    
    events = get_events_by_type(event_type, user_id, limit)
    return {"count": len(events), "events": events}

@router.get("/events/deaths")
def get_deaths(request: Request, x_user_key: str | None = Header(default=None), limit: int = Query(50, le=200)):
    """Get all death events for the current user"""
    decoded = verify_bearer_id_token(request.headers.get('Authorization'))
    user_id = decoded.get('uid') if decoded else None
    if not user_id:
        if not x_user_key:
            raise HTTPException(status_code=401, detail="Unauthorized")
        user_id = x_user_key
    
    events = get_death_events(user_id, limit)
    return {"count": len(events), "events": events}

@router.get("/events/births")
def get_births(request: Request, x_user_key: str | None = Header(default=None), limit: int = Query(50, le=200)):
    """Get all birth events for the current user"""
    decoded = verify_bearer_id_token(request.headers.get('Authorization'))
    user_id = decoded.get('uid') if decoded else None
    if not user_id:
        if not x_user_key:
            raise HTTPException(status_code=401, detail="Unauthorized")
        user_id = x_user_key
    
    events = get_birth_events(user_id, limit)
    return {"count": len(events), "events": events}


# =============================================================================
# DOMAIN EVENTS (New Event Sourcing Architecture)
# =============================================================================

@router.get("/events/animal/{animal_id}/history")
def get_animal_event_history(
    animal_id: int,
    request: Request,
):
    """
    Get the full event history for an animal from the domain_events table.
    
    This is the new event sourcing endpoint that returns immutable domain events.
    Events are ordered chronologically and can be used for:
    - Audit trails
    - Timeline views
    - Debugging state issues
    - Replaying state
    
    For current state, use /snapshots/{animal_id} instead.
    """
    user, company_id = authenticate_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    if not company_id:
        raise HTTPException(status_code=400, detail="Company assignment required")
    
    events = get_events_for_animal(animal_id=animal_id, company_id=company_id)
    
    return {
        "animal_id": animal_id,
        "company_id": company_id,
        "count": len(events),
        "events": events,
    }


@router.get("/events/history/by-number/{animal_number}")
def get_animal_event_history_by_number(
    animal_number: str,
    request: Request,
):
    """
    Get the full event history for an animal by animal_number.
    
    Useful for looking up events when you have the animal_number but not the ID.
    Also retrieves insemination events which use mother_id (animal_number).
    """
    user, company_id = authenticate_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    if not company_id:
        raise HTTPException(status_code=400, detail="Company assignment required")
    
    events = get_events_for_animal_by_number(
        animal_number=animal_number.upper(),
        company_id=company_id
    )
    
    return {
        "animal_number": animal_number.upper(),
        "company_id": company_id,
        "count": len(events),
        "events": events,
    }

