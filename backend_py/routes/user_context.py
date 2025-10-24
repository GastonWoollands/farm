"""
User context API routes for frontend
Provides user information and company context for UI
"""

from fastapi import APIRouter, Request, HTTPException
from ..services.auth_service import authenticate_user, get_user_permissions, get_company_context
from ..services.companies import get_all_companies

router = APIRouter()


@router.get("/context")
def get_user_context(request: Request):
    """Get current user context including company information"""
    user, company_id = authenticate_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    # Get user permissions
    permissions = get_user_permissions(user)
    
    # Get company context
    company_context = get_company_context(user)
    
    return {
        "user": {
            "id": user.get('id'),
            "firebase_uid": user.get('firebase_uid'),
            "email": user.get('email'),
            "display_name": user.get('display_name'),
            "role": user.get('role')
        },
        "company": {
            "id": company_id,
            "name": user.get('company_name'),
            "has_company": company_id is not None
        },
        "permissions": permissions,
        "is_company_user": company_id is not None
    }


@router.get("/companies")
def get_user_companies(request: Request):
    """Get all companies that the user can access"""
    user, company_id = authenticate_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    # Get user permissions
    permissions = get_user_permissions(user)
    
    # Check if user can view all companies (admin) or just their own
    if permissions.get('can_manage_companies', False):
        # Admin users can see all companies
        companies = get_all_companies()
    else:
        # Regular users can only see their own company
        if company_id:
            from ..services.companies import get_company
            company = get_company(company_id)
            companies = [company] if company else []
        else:
            companies = []
    
    return {
        "companies": companies,
        "current_company_id": company_id,
        "can_switch_companies": permissions.get('can_manage_companies', False)
    }
