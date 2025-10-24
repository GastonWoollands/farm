"""
Company management API routes for multi-tenant architecture
"""

from fastapi import APIRouter, Request, HTTPException, Header
from ..services.auth_service import authenticate_user, require_role
from ..services.companies import (
    create_company, 
    get_all_companies, 
    get_company, 
    update_company,
    deactivate_company,
    get_company_data_access
)
from ..config import VALID_KEYS, ADMIN_SECRET

router = APIRouter()


@router.post("/create")
def create_company_endpoint(
    name: str,
    description: str = None,
    request: Request = None,
    x_admin_secret: str | None = Header(default=None)
):
    """Create a new company (admin only)"""
    # Check admin access
    if not x_admin_secret or x_admin_secret != ADMIN_SECRET:
        raise HTTPException(status_code=401, detail="Admin access required")
    
    company = create_company(name, description)
    return {"ok": True, "company": company}


@router.get("/all")
def get_all_companies_endpoint(
    request: Request = None,
    x_admin_secret: str | None = Header(default=None)
):
    """Get all companies"""
    # Check admin access
    if not x_admin_secret or x_admin_secret != ADMIN_SECRET:
        raise HTTPException(status_code=401, detail="Admin access required")
    
    companies = get_all_companies()
    return {"companies": companies, "count": len(companies)}


@router.get("/{company_id}")
def get_company_endpoint(
    company_id: int,
    request: Request = None,
    x_admin_secret: str | None = Header(default=None)
):
    """Get company by ID"""
    # Check admin access
    if not x_admin_secret or x_admin_secret != ADMIN_SECRET:
        raise HTTPException(status_code=401, detail="Admin access required")
    
    company = get_company(company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    
    return {"company": company}


@router.put("/{company_id}")
def update_company_endpoint(
    company_id: int,
    name: str = None,
    description: str = None,
    request: Request = None,
    x_admin_secret: str | None = Header(default=None)
):
    """Update company details (admin only)"""
    # Check admin access
    if not x_admin_secret or x_admin_secret != ADMIN_SECRET:
        raise HTTPException(status_code=401, detail="Admin access required")
    
    success = update_company(company_id, name, description)
    if success:
        return {"ok": True, "message": "Company updated successfully"}
    else:
        raise HTTPException(status_code=500, detail="Failed to update company")


@router.delete("/{company_id}")
def deactivate_company_endpoint(
    company_id: int,
    request: Request = None,
    x_admin_secret: str | None = Header(default=None)
):
    """Deactivate a company (admin only)"""
    # Check admin access
    if not x_admin_secret or x_admin_secret != ADMIN_SECRET:
        raise HTTPException(status_code=401, detail="Admin access required")
    
    success = deactivate_company(company_id)
    if success:
        return {"ok": True, "message": "Company deactivated successfully"}
    else:
        raise HTTPException(status_code=500, detail="Failed to deactivate company")


@router.get("/{company_id}/data-access")
def get_company_data_access_endpoint(
    company_id: int,
    request: Request = None,
    x_admin_secret: str | None = Header(default=None)
):
    """Get data access summary for a company (admin only)"""
    # Check admin access
    if not x_admin_secret or x_admin_secret != ADMIN_SECRET:
        raise HTTPException(status_code=401, detail="Admin access required")
    
    data_access = get_company_data_access(company_id)
    return {"data_access": data_access}
