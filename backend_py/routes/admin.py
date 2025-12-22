from fastapi import APIRouter, Header, HTTPException, Request
from ..config import ADMIN_SECRET, BACKUP_SECRET
from ..models import ExecSqlBody
from ..services import admin as admin_svc
from ..services.firebase_auth import verify_bearer_id_token
from ..services.snapshot_projector import (
    project_animal_snapshot,
    project_company_snapshots,
    project_all_snapshots,
    process_pending_events,
)
from ..services.auth_service import authenticate_user
from ..backup.backup_gcs import create_backup

router = APIRouter()

def _require_admin(secret: str | None, request: Request):
    if ADMIN_SECRET and secret and secret == ADMIN_SECRET:
        return True
    
    decoded = verify_bearer_id_token(request.headers.get('Authorization'))
    if decoded and decoded.get('uid'):
        return True
    
    raise HTTPException(status_code=403, detail="Admin access required")

@router.post("/admin/delete-all")
def admin_delete_all(request: Request, x_admin_secret: str | None = Header(default=None), x_user_key: str | None = Header(default=None)):
    _require_admin(x_admin_secret, request)
    
    # If using Firebase auth, get the user ID
    user_identifier = None
    if not x_admin_secret or x_admin_secret != ADMIN_SECRET:
        # Using Firebase auth
        decoded = verify_bearer_id_token(request.headers.get('Authorization'))
        if decoded:
            user_identifier = decoded.get('uid')
    else:
        # Using admin secret, use provided user_key or None for all
        user_identifier = x_user_key
    
    admin_svc.delete_all(user_identifier)
    return {"ok": True}

@router.post("/admin/exec-sql")
def admin_exec_sql(body: ExecSqlBody, request: Request, x_admin_secret: str | None = Header(default=None)):
    _require_admin(x_admin_secret, request)
    sql = (body.sql or "").strip()
    if not sql:
        raise HTTPException(status_code=400, detail="sql required")
    if ";" in sql.strip().rstrip(";"):
        raise HTTPException(status_code=400, detail="Only single statement allowed")
    params = tuple(body.params or [])
    return admin_svc.exec_sql(sql, params)

@router.post("/admin/migrate-legacy-data")
def migrate_legacy_data(company_id: int, request: Request, x_admin_secret: str | None = Header(default=None)):
    """Migrate legacy data (company_id = NULL) to specified company"""
    _require_admin(x_admin_secret, request)
    return admin_svc.migrate_legacy_data(company_id)

@router.post("/admin/backup")
def admin_backup(request: Request, authorization: str = Header(alias="Authorization")):
    """Create a backup of the database and upload to Google Cloud Storage"""
    # Accept either exact match or Bearer <token>
    if not authorization:
        raise HTTPException(status_code=401, detail="Authorization header required")

    provided = authorization
    if provided.startswith("Bearer "):
        provided = provided.split(" ", 1)[1]

    if not BACKUP_SECRET or provided != BACKUP_SECRET:
        raise HTTPException(status_code=403, detail="Invalid backup secret")
    
    try:
        create_backup()
        return {"ok": True, "message": "Backup created successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Backup failed: {str(e)}")


# =============================================================================
# SNAPSHOT REPLAY ENDPOINTS (Event Sourcing)
# =============================================================================

@router.post("/admin/replay/animal/{animal_id}")
def replay_animal_snapshot(
    animal_id: int,
    request: Request,
    x_admin_secret: str | None = Header(default=None)
):
    """
    Rebuild the snapshot for a single animal from its events.
    
    This is useful for:
    - Fixing a corrupted snapshot
    - Applying new projection logic to a specific animal
    - Debugging event replay for a specific case
    """
    _require_admin(x_admin_secret, request)
    
    # Get company_id from authenticated user
    user, company_id = authenticate_user(request)
    if not user and ADMIN_SECRET and x_admin_secret == ADMIN_SECRET:
        # Admin secret used, need company_id from query or header
        raise HTTPException(
            status_code=400, 
            detail="When using admin secret, authenticate with Firebase to provide company context"
        )
    
    if not company_id:
        raise HTTPException(status_code=400, detail="Company context required")
    
    try:
        snapshot = project_animal_snapshot(animal_id, company_id)
        if not snapshot:
            raise HTTPException(status_code=404, detail=f"No events found for animal_id={animal_id}")
        
        return {
            "ok": True,
            "message": f"Snapshot rebuilt for animal_id={animal_id}",
            "snapshot": snapshot
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Replay failed: {str(e)}")


@router.post("/admin/replay/company/{company_id}")
def replay_company_snapshots(
    company_id: int,
    request: Request,
    x_admin_secret: str | None = Header(default=None)
):
    """
    Rebuild all snapshots for a company from events.
    
    This is useful for:
    - Migrating to new projection logic
    - Recovering from data issues
    - Initial population of snapshots after migration
    """
    _require_admin(x_admin_secret, request)
    
    try:
        count = project_company_snapshots(company_id)
        return {
            "ok": True,
            "message": f"Rebuilt {count} snapshots for company_id={company_id}",
            "count": count
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Replay failed: {str(e)}")


@router.post("/admin/replay/all")
def replay_all_snapshots(
    request: Request,
    x_admin_secret: str | None = Header(default=None)
):
    """
    Full rebuild of all snapshots across all companies.
    
    WARNING: This can be slow for large datasets.
    
    This is useful for:
    - Major schema or logic changes
    - Full system recovery
    - Initial deployment of event sourcing
    """
    _require_admin(x_admin_secret, request)
    
    try:
        count = project_all_snapshots()
        return {
            "ok": True,
            "message": f"Rebuilt {count} total snapshots across all companies",
            "count": count
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Replay failed: {str(e)}")


@router.post("/admin/replay/pending")
def process_pending_snapshot_events(
    request: Request,
    x_admin_secret: str | None = Header(default=None),
    batch_size: int = 100
):
    """
    Process pending events and update snapshots incrementally.
    
    This is more efficient than full replay for regular updates.
    Can be called periodically or triggered by a background job.
    """
    _require_admin(x_admin_secret, request)
    
    try:
        count = process_pending_events(batch_size=batch_size)
        return {
            "ok": True,
            "message": f"Processed events for {count} animals",
            "count": count
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Processing failed: {str(e)}")


