from fastapi import APIRouter, Header, HTTPException
from ..config import ADMIN_SECRET
from ..models import ExecSqlBody
from ..services import admin as admin_svc

router = APIRouter()

def _require_admin(secret: str | None):
    if not ADMIN_SECRET or not secret or secret != ADMIN_SECRET:
        raise HTTPException(status_code=403, detail="Forbidden")

@router.post("/admin/delete-all")
def admin_delete_all(x_admin_secret: str | None = Header(default=None), x_user_key: str | None = Header(default=None)):
    _require_admin(x_admin_secret)
    admin_svc.delete_all(x_user_key)
    return {"ok": True}

@router.post("/admin/exec-sql")
def admin_exec_sql(body: ExecSqlBody, x_admin_secret: str | None = Header(default=None)):
    _require_admin(x_admin_secret)
    sql = (body.sql or "").strip()
    if not sql:
        raise HTTPException(status_code=400, detail="sql required")
    if ";" in sql.strip().rstrip(";"):
        raise HTTPException(status_code=400, detail="Only single statement allowed")
    params = tuple(body.params or [])
    return admin_svc.exec_sql(sql, params)


