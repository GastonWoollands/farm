from fastapi import APIRouter, Header, HTTPException, Response
import csv
import io
from ..config import VALID_KEYS
from ..models import RegisterBody, DeleteBody
from ..services.registrations import insert_registration, delete_registration as svc_delete, export_rows

router = APIRouter()

@router.post("/register", status_code=201)
def register(body: RegisterBody, x_user_key: str | None = Header(default=None)):
    if not x_user_key or x_user_key not in VALID_KEYS:
        raise HTTPException(status_code=401, detail="Invalid or missing user key")
    insert_registration(x_user_key, body)
    return {"ok": True}

@router.delete("/register")
def delete_registration(body: DeleteBody, x_user_key: str | None = Header(default=None)):
    if not x_user_key or x_user_key not in VALID_KEYS:
        raise HTTPException(status_code=401, detail="Invalid or missing user key")
    svc_delete(x_user_key, body.animalNumber, body.createdAt)
    return {"ok": True}

@router.get("/export")
def export_records(x_user_key: str | None = Header(default=None), format: str = "json", date: str | None = None, start: str | None = None, end: str | None = None):
    if not x_user_key or x_user_key not in VALID_KEYS:
        raise HTTPException(status_code=401, detail="Invalid or missing user key")
    rows = export_rows(x_user_key, date, start, end)
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


