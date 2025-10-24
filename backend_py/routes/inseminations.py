from fastapi import APIRouter, Header, HTTPException, Request, Query
from ..models import InseminationBody, UpdateInseminationBody, DeleteInseminationBody
from ..services.inseminations import (
    insert_insemination, update_insemination, delete_insemination,
    get_inseminations_by_cow, get_inseminations_by_user, 
    get_insemination_statistics, export_inseminations
)
from ..services.inseminations_multi_tenant import (
    get_inseminations_multi_tenant, get_insemination_statistics_multi_tenant
)
from ..services.firebase_auth import verify_bearer_id_token
import csv
import io
from fastapi.responses import Response

router = APIRouter()

@router.post("/inseminations", status_code=201)
def register_insemination(body: InseminationBody, request: Request, x_user_key: str | None = Header(default=None)):
    """Register a new insemination record"""
    from ..services.auth_service import authenticate_user
    
    # Try new authentication first (creates user automatically)
    user, company_id = authenticate_user(request)
    if user:
        user_id = user.get('firebase_uid')
        # Pass company_id for multi-tenant data isolation
        insemination_id = insert_insemination(user_id, body, company_id)
        return {"ok": True, "id": insemination_id}
    else:
        # Fallback to legacy key if token missing
        if not x_user_key:
            raise HTTPException(status_code=401, detail="Unauthorized")
        # Legacy users have no company (company_id = None)
        insemination_id = insert_insemination(x_user_key, body, None)
        return {"ok": True, "id": insemination_id}

@router.put("/inseminations/{insemination_id}")
def update_insemination_endpoint(insemination_id: int, body: UpdateInseminationBody, request: Request, x_user_key: str | None = Header(default=None)):
    """Update an existing insemination record"""
    decoded = verify_bearer_id_token(request.headers.get('Authorization'))
    user_id = decoded.get('uid') if decoded else None
    if not user_id:
        if not x_user_key:
            raise HTTPException(status_code=401, detail="Unauthorized")
        user_id = x_user_key
    
    update_insemination(user_id, insemination_id, body)
    return {"ok": True}

@router.delete("/inseminations/{insemination_id}")
def delete_insemination_endpoint(insemination_id: int, request: Request, x_user_key: str | None = Header(default=None)):
    """Delete an insemination record"""
    decoded = verify_bearer_id_token(request.headers.get('Authorization'))
    user_id = decoded.get('uid') if decoded else None
    if not user_id:
        if not x_user_key:
            raise HTTPException(status_code=401, detail="Unauthorized")
        user_id = x_user_key
    
    delete_insemination(user_id, insemination_id)
    return {"ok": True}

@router.get("/inseminations/cow/{mother_id}")
def get_cow_inseminations(mother_id: int, request: Request, x_user_key: str | None = Header(default=None)):
    """Get all inseminations for a specific cow"""
    decoded = verify_bearer_id_token(request.headers.get('Authorization'))
    user_id = decoded.get('uid') if decoded else None
    if not user_id:
        if not x_user_key:
            raise HTTPException(status_code=401, detail="Unauthorized")
        user_id = x_user_key
    
    inseminations = get_inseminations_by_cow(user_id, mother_id)
    return {"count": len(inseminations), "inseminations": inseminations}

@router.get("/inseminations")
def get_user_inseminations(request: Request, x_user_key: str | None = Header(default=None), limit: int = Query(100, le=500)):
    """Get recent inseminations for the current user"""
    decoded = verify_bearer_id_token(request.headers.get('Authorization'))
    user_id = decoded.get('uid') if decoded else None
    if not user_id:
        if not x_user_key:
            raise HTTPException(status_code=401, detail="Unauthorized")
        user_id = x_user_key
    
    inseminations = get_inseminations_by_user(user_id, limit)
    return {"count": len(inseminations), "inseminations": inseminations}

@router.get("/inseminations/statistics")
def get_insemination_stats(request: Request, x_user_key: str | None = Header(default=None)):
    """Get insemination statistics for the current user"""
    decoded = verify_bearer_id_token(request.headers.get('Authorization'))
    user_id = decoded.get('uid') if decoded else None
    if not user_id:
        if not x_user_key:
            raise HTTPException(status_code=401, detail="Unauthorized")
        user_id = x_user_key
    
    stats = get_insemination_statistics(user_id)
    return stats

@router.get("/inseminations/export")
def export_insemination_records(
    request: Request, 
    x_user_key: str | None = Header(default=None), 
    format: str = "json", 
    start: str | None = None, 
    end: str | None = None
):
    """Export insemination records with optional date filtering"""
    decoded = verify_bearer_id_token(request.headers.get('Authorization'))
    user_id = decoded.get('uid') if decoded else None
    if not user_id:
        if not x_user_key:
            raise HTTPException(status_code=401, detail="Unauthorized")
        user_id = x_user_key
    
    records = export_inseminations(user_id, start, end)
    
    if (format or "").lower() == "csv":
        buf = io.StringIO()
        if records:
            cols = list(records[0].keys())
        else:
            cols = ["inseminationIdentifier", "motherVisualId", "bullId", "inseminationDate", "registrationDate", "notes", "cowNumber", "cowGender", "cowStatus"]
        
        writer = csv.DictWriter(buf, fieldnames=cols)
        writer.writeheader()
        for record in records:
            writer.writerow(record)
        
        csv_data = buf.getvalue()
        return Response(
            content=csv_data, 
            media_type="text/csv", 
            headers={"Content-Disposition": "attachment; filename=inseminations_export.csv"}
        )
    
    return {"count": len(records), "records": records}


# Multi-tenant endpoints
@router.get("/")
def get_inseminations(request: Request, limit: int = 100):
    """Get inseminations with multi-tenant filtering"""
    from ..services.auth_service import authenticate_user
    
    user, company_id = authenticate_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    inseminations = get_inseminations_multi_tenant(user, limit)
    return {"inseminations": inseminations, "count": len(inseminations)}


@router.get("/stats")
def get_insemination_stats(request: Request):
    """Get insemination statistics with multi-tenant filtering"""
    from ..services.auth_service import authenticate_user
    
    user, company_id = authenticate_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    stats = get_insemination_statistics_multi_tenant(user)
    return stats
