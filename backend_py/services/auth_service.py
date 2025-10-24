"""
Enhanced authentication service for multi-tenant architecture
Handles user authentication, company assignment, and data access control
"""

from typing import Optional, Dict, Tuple
from fastapi import HTTPException
from .firebase_auth import verify_bearer_id_token
from .users import get_or_create_user, get_user_company_id, get_user_by_firebase_uid


def authenticate_user(request) -> Tuple[Optional[Dict], Optional[int]]:
    """
    Authenticate user and return user info + company_id for data filtering
    Returns: (user_dict, company_id) or (None, None) if not authenticated
    """
    try:
        # Verify Firebase token
        decoded = verify_bearer_id_token(request.headers.get('Authorization'))
        if not decoded:
            return None, None
            
        firebase_uid = decoded.get('uid')
        email = decoded.get('email', '')
        display_name = decoded.get('name', '')
        
        if not firebase_uid:
            return None, None
        
        # Get or create user in our database
        user = get_or_create_user(firebase_uid, email, display_name)
        
        # Get company_id for data filtering
        company_id = user.get('company_id')
        
        return user, company_id
        
    except HTTPException:
        # Re-raise HTTP exceptions (like 401)
        raise
    except Exception as e:
        # Log error but don't expose details
        print(f"Authentication error: {e}")
        return None, None


def get_data_filter_clause(company_id: Optional[int], firebase_uid: str) -> Tuple[str, list]:
    """
    Generate WHERE clause and parameters for data filtering based on company/user
    Returns: (where_clause, params)
    """
    if company_id:
        # User belongs to a company - filter by company_id
        return "company_id = ?", [company_id]
    else:
        # User has no company - return empty result (no data access)
        # This enforces that users without companies cannot see any data
        return "1 = 0", []  # Always false condition


def require_company_access(user: Dict) -> None:
    """Check if user has company access, raise 403 if not"""
    if not user.get('company_id'):
        raise HTTPException(
            status_code=403, 
            detail="Company access required. Please contact an administrator to assign you to a company."
        )


def require_role(user: Dict, required_roles: list) -> None:
    """Check if user has required role, raise 403 if not"""
    user_role = user.get('role', 'viewer')
    if user_role not in required_roles:
        raise HTTPException(
            status_code=403,
            detail=f"Access denied. Required roles: {', '.join(required_roles)}. Your role: {user_role}"
        )


def can_access_company_data(user: Dict, target_company_id: int) -> bool:
    """Check if user can access data from a specific company"""
    user_company_id = user.get('company_id')
    user_role = user.get('role', 'viewer')
    
    # Admin users can access any company data
    if user_role == 'admin':
        return True
    
    # Other users can only access their own company data
    return user_company_id == target_company_id


def get_user_permissions(user: Dict) -> Dict:
    """Get user permissions based on role"""
    role = user.get('role', 'viewer')
    
    permissions = {
        'can_create_registrations': False,
        'can_update_registrations': False,
        'can_delete_registrations': False,
        'can_create_inseminations': False,
        'can_update_inseminations': False,
        'can_delete_inseminations': False,
        'can_export_data': False,
        'can_manage_users': False,
        'can_manage_companies': False,
        'can_view_analytics': False
    }
    
    if role == 'admin':
        permissions.update({
            'can_create_registrations': True,
            'can_update_registrations': True,
            'can_delete_registrations': True,
            'can_create_inseminations': True,
            'can_update_inseminations': True,
            'can_delete_inseminations': True,
            'can_export_data': True,
            'can_manage_users': True,
            'can_manage_companies': True,
            'can_view_analytics': True
        })
    elif role == 'manager':
        permissions.update({
            'can_create_registrations': True,
            'can_update_registrations': True,
            'can_delete_registrations': True,
            'can_create_inseminations': True,
            'can_update_inseminations': True,
            'can_delete_inseminations': True,
            'can_export_data': True,
            'can_view_analytics': True
        })
    elif role == 'viewer':
        permissions.update({
            'can_view_analytics': True
        })
    
    return permissions


def get_company_context(user: Dict) -> Dict:
    """Get company context for the user"""
    return {
        'user_id': user.get('id'),
        'firebase_uid': user.get('firebase_uid'),
        'email': user.get('email'),
        'display_name': user.get('display_name'),
        'company_id': user.get('company_id'),
        'company_name': user.get('company_name'),
        'role': user.get('role'),
        'permissions': get_user_permissions(user)
    }
