from fastapi import APIRouter, Header, HTTPException, Request
from ..config import ADMIN_SECRET
from ..models import ExecSqlBody
from ..services import admin as admin_svc
from ..services.firebase_auth import verify_bearer_id_token
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

@router.post("/admin/backup")
def admin_backup(request: Request, authorization: str = Header(alias="Authorization")):
    """Create a backup of the database and upload to Google Cloud Storage"""
    # Verify bearer token
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Bearer token required")
    
    token = authorization.split(" ")[1]
    decoded = verify_bearer_id_token(token)
    if not decoded or not decoded.get('uid'):
        raise HTTPException(status_code=403, detail="Invalid or expired token")
    
    try:
        create_backup()
        return {"ok": True, "message": "Backup created successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Backup failed: {str(e)}")


