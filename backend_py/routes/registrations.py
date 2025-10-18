from fastapi import APIRouter, Header, HTTPException, Response, Request
import csv
import io
from ..config import VALID_KEYS
from ..models import RegisterBody, DeleteBody, UpdateBody
from ..services.registrations import insert_registration, delete_registration as svc_delete, update_registration, export_rows
from ..services.firebase_auth import verify_bearer_id_token

router = APIRouter()

@router.post("/register", status_code=201)
def register(body: RegisterBody, request: Request, x_user_key: str | None = Header(default=None)):
    decoded = verify_bearer_id_token(request.headers.get('Authorization'))
    user_id = decoded.get('uid') if decoded else None
    if not user_id:
        # Fallback to legacy key if token missing
        if not x_user_key or x_user_key not in VALID_KEYS:
            raise HTTPException(status_code=401, detail="Unauthorized")
    record_id = insert_registration(user_id or x_user_key, body)
    return {"ok": True, "id": record_id}

@router.put("/register/update")
def update_registration_by_identifier(body: UpdateBody, request: Request, x_user_key: str | None = Header(default=None)):
    decoded = verify_bearer_id_token(request.headers.get('Authorization'))
    user_id = decoded.get('uid') if decoded else None
    if not user_id:
        if not x_user_key or x_user_key not in VALID_KEYS:
            raise HTTPException(status_code=401, detail="Unauthorized")
    
    # Find the record by animalNumber and createdAt
    from ..services.registrations import find_and_update_registration
    result = find_and_update_registration(user_id or x_user_key, body)
    if not result:
        raise HTTPException(status_code=404, detail="Record not found")
    return {"ok": True}

@router.put("/register/{animal_id}")
def update_registration_endpoint(animal_id: int, body: RegisterBody, request: Request, x_user_key: str | None = Header(default=None)):
    decoded = verify_bearer_id_token(request.headers.get('Authorization'))
    user_id = decoded.get('uid') if decoded else None
    if not user_id:
        # Fallback to legacy key if token missing
        if not x_user_key or x_user_key not in VALID_KEYS:
            raise HTTPException(status_code=401, detail="Unauthorized")
    update_registration(user_id or x_user_key, animal_id, body)
    return {"ok": True}

@router.delete("/register")
def delete_registration(body: DeleteBody, request: Request, x_user_key: str | None = Header(default=None)):
    decoded = verify_bearer_id_token(request.headers.get('Authorization'))
    user_id = decoded.get('uid') if decoded else None
    if not user_id:
        if not x_user_key or x_user_key not in VALID_KEYS:
            raise HTTPException(status_code=401, detail="Unauthorized")
    svc_delete(user_id or x_user_key, body.animalNumber, body.createdAt)
    return {"ok": True}

@router.get("/export")
def export_records(request: Request, x_user_key: str | None = Header(default=None), format: str = "json", date: str | None = None, start: str | None = None, end: str | None = None):
    decoded = verify_bearer_id_token(request.headers.get('Authorization'))
    user_id = decoded.get('uid') if decoded else None
    if not user_id:
        if not x_user_key or x_user_key not in VALID_KEYS:
            raise HTTPException(status_code=401, detail="Unauthorized")
    rows = export_rows(user_id or x_user_key, date, start, end)
    if (format or "").lower() == "csv":
        buf = io.StringIO()
        if rows:
            cols = list(rows[0].keys())
        else:
            cols = ["animal_number","born_date","mother_id","weight","gender","status","color","notes","notes_mother","created_at"]
        writer = csv.DictWriter(buf, fieldnames=cols)
        writer.writeheader()
        for row in rows:
            writer.writerow(row)
        csv_data = buf.getvalue()
        return Response(content=csv_data, media_type="text/csv", headers={"Content-Disposition": "attachment; filename=export.csv"})
    return {"count": len(rows), "items": rows}


