"""
User management API routes for multi-tenant architecture
"""

from fastapi import APIRouter, Request, HTTPException, Header
from ..services.auth_service import authenticate_user, require_company_access, require_role
from ..services.users import (
    get_user_by_firebase_uid, 
    assign_user_to_company, 
    update_user_role,
    get_company_users
)
from ..services.companies import create_company, get_all_companies
from ..config import VALID_KEYS, ADMIN_SECRET

router = APIRouter()


@router.get("/me")
def get_current_user(request: Request):
    """Get current user information"""
    user, company_id = authenticate_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    return {
        "user": user,
        "company_id": company_id,
        "has_company": company_id is not None
    }


@router.post("/assign-company")
def assign_user_to_company_endpoint(
    user_id: int, 
    company_id: int, 
    request: Request,
    x_admin_secret: str | None = Header(default=None)
):
    """Assign a user to a company by user ID (admin only)"""
    # Check admin access
    if not x_admin_secret or x_admin_secret != ADMIN_SECRET:
        raise HTTPException(status_code=401, detail="Admin access required")
    
    success = assign_user_to_company(user_id, company_id)
    if success:
        return {"ok": True, "message": "User assigned to company successfully"}
    else:
        raise HTTPException(status_code=500, detail="Failed to assign user to company")


@router.post("/assign-company-by-firebase-uid")
def assign_user_to_company_by_firebase_uid_endpoint(
    firebase_uid: str, 
    company_id: int, 
    email: str = "",
    display_name: str = "",
    request: Request = None,
    x_admin_secret: str | None = Header(default=None)
):
    """Assign a user to a company by Firebase UID (admin only)"""
    # Check admin access
    if not x_admin_secret or x_admin_secret != ADMIN_SECRET:
        raise HTTPException(status_code=401, detail="Admin access required")
    
    # First, get or create the user
    from ..services.users import get_or_create_user
    user = get_or_create_user(firebase_uid, email, display_name)
    
    # Then assign to company
    success = assign_user_to_company(user['id'], company_id)
    if success:
        return {"ok": True, "message": f"User {firebase_uid} assigned to company successfully", "user_id": user['id']}
    else:
        raise HTTPException(status_code=500, detail="Failed to assign user to company")


@router.put("/role")
def update_user_role_endpoint(
    user_id: int,
    role: str,
    request: Request,
    x_admin_secret: str | None = Header(default=None)
):
    """Update user role by user ID (admin only)"""
    # Check admin access
    if not x_admin_secret or x_admin_secret != ADMIN_SECRET:
        raise HTTPException(status_code=401, detail="Admin access required")
    
    if role not in ['admin', 'manager', 'viewer']:
        raise HTTPException(status_code=400, detail="Invalid role. Must be: admin, manager, viewer")
    
    success = update_user_role(user_id, role)
    if success:
        return {"ok": True, "message": f"User role updated to {role}"}
    else:
        raise HTTPException(status_code=500, detail="Failed to update user role")


@router.put("/role-by-firebase-uid")
def update_user_role_by_firebase_uid_endpoint(
    firebase_uid: str,
    role: str,
    email: str = "",
    display_name: str = "",
    request: Request = None,
    x_admin_secret: str | None = Header(default=None)
):
    """Update user role by Firebase UID (admin only)"""
    # Check admin access
    if not x_admin_secret or x_admin_secret != ADMIN_SECRET:
        raise HTTPException(status_code=401, detail="Admin access required")
    
    if role not in ['admin', 'manager', 'viewer']:
        raise HTTPException(status_code=400, detail="Invalid role. Must be: admin, manager, viewer")
    
    # First, get or create the user
    from ..services.users import get_or_create_user
    user = get_or_create_user(firebase_uid, email, display_name)
    
    # Then update role
    success = update_user_role(user['id'], role)
    if success:
        return {"ok": True, "message": f"User {firebase_uid} role updated to {role}", "user_id": user['id']}
    else:
        raise HTTPException(status_code=500, detail="Failed to update user role")


@router.get("/company/{company_id}/users")
def get_company_users_endpoint(
    company_id: int,
    request: Request,
    x_admin_secret: str | None = Header(default=None)
):
    """Get all users in a company"""
    # Check admin access
    if not x_admin_secret or x_admin_secret != ADMIN_SECRET:
        raise HTTPException(status_code=401, detail="Admin access required")
    
    users = get_company_users(company_id)
    return {"users": users, "count": len(users)}


@router.get("/all")
def get_all_users(request: Request, x_admin_secret: str | None = Header(default=None)):
    """Get all users (admin only)"""
    # Check admin access
    if not x_admin_secret or x_admin_secret != ADMIN_SECRET:
        raise HTTPException(status_code=401, detail="Admin access required")
    
    from ..services.users import get_all_users as get_all_users_service
    users = get_all_users_service()
    return {"users": users, "count": len(users)}


@router.get("/by-firebase-uid/{firebase_uid}")
def get_user_by_firebase_uid_endpoint(
    firebase_uid: str,
    request: Request,
    x_admin_secret: str | None = Header(default=None)
):
    """Get user information by Firebase UID (admin only)"""
    # Check admin access
    if not x_admin_secret or x_admin_secret != ADMIN_SECRET:
        raise HTTPException(status_code=401, detail="Admin access required")
    
    from ..services.users import get_user_by_firebase_uid
    user = get_user_by_firebase_uid(firebase_uid)
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    return {"user": user}
