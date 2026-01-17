"""
User management service for multi-tenant architecture
Handles user creation, company assignment, and role management
"""

from typing import Optional, Dict, List
from fastapi import HTTPException
from psycopg2 import Error as PostgresError, IntegrityError
from ..db import conn


def get_or_create_user(firebase_uid: str, email: str, display_name: str = None) -> Dict:
    """
    Get existing user or create new user from Firebase Auth data
    Returns user dict with company_id and role
    Handles email conflicts by updating existing user's Firebase UID
    """
    try:
        # First, try to get existing user by Firebase UID
        cursor = conn.execute(
            """
            SELECT u.id, u.firebase_uid, u.email, u.display_name, u.company_id, u.role, c.name as company_name
            FROM users u
            LEFT JOIN companies c ON u.company_id = c.id
            WHERE u.firebase_uid = ?
            """,
            (firebase_uid,)
        )
        user = cursor.fetchone()
        
        if user:
            # Update email and display_name if they've changed
            if user[2] != email or user[3] != display_name:
                conn.execute(
                    """
                    UPDATE users 
                    SET email = ?, display_name = ?, updated_at = NOW()
                    WHERE firebase_uid = ?
                    """,
                    (email, display_name, firebase_uid)
                )
                conn.commit()
            
            return {
                "id": user[0],
                "firebase_uid": user[1],
                "email": email,
                "display_name": display_name,
                "company_id": user[4],
                "role": user[5],
                "company_name": user[6]
            }
        
        # Check if email already exists with different Firebase UID
        cursor = conn.execute(
            """
            SELECT u.id, u.firebase_uid, u.email, u.display_name, u.company_id, u.role, c.name as company_name
            FROM users u
            LEFT JOIN companies c ON u.company_id = c.id
            WHERE u.email = ?
            """,
            (email,)
        )
        existing_user = cursor.fetchone()
        
        if existing_user:
            # Email exists with different Firebase UID - update the existing user
            conn.execute(
                """
                UPDATE users 
                SET firebase_uid = ?, display_name = ?, updated_at = NOW()
                WHERE email = ?
                """,
                (firebase_uid, display_name, email)
            )
            conn.commit()
            
            return {
                "id": existing_user[0],
                "firebase_uid": firebase_uid,
                "email": email,
                "display_name": display_name,
                "company_id": existing_user[4],
                "role": existing_user[5],
                "company_name": existing_user[6]
            }
        
        # Create new user (no company assigned by default)
        cursor = conn.execute(
            """
            INSERT INTO users (firebase_uid, email, display_name, role)
            VALUES (?, ?, ?, 'admin')
            """,
            (firebase_uid, email, display_name)
        )
        user_id = cursor.lastrowid
        conn.commit()
        
        return {
            "id": user_id,
            "firebase_uid": firebase_uid,
            "email": email,
            "display_name": display_name,
            "company_id": None,
            "role": "admin",
            "company_name": None
        }
        
    except IntegrityError as e:
        if "UNIQUE constraint failed: users.email" in str(e):
            raise HTTPException(status_code=409, detail="Email already exists. Please use a different email address.")
        elif "UNIQUE constraint failed: users.firebase_uid" in str(e):
            raise HTTPException(status_code=409, detail="User already exists with this Firebase UID.")
        else:
            raise HTTPException(status_code=500, detail=f"Database constraint error: {e}")
    except PostgresError as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")


def assign_user_to_company(user_id: int, company_id: int) -> bool:
    """Assign a user to a company"""
    try:
        conn.execute(
            "UPDATE users SET company_id = ?, updated_at = NOW() WHERE id = ?",
            (company_id, user_id)
        )
        conn.commit()
        return True
    except PostgresError as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")


def create_company(name: str, description: str = None) -> int:
    """Create a new company and return its ID"""
    try:
        cursor = conn.execute(
            "INSERT INTO companies (name, description) VALUES (?, ?)",
            (name, description)
        )
        company_id = cursor.lastrowid
        conn.commit()
        return company_id
    except PostgresError as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")


def get_user_company_id(firebase_uid: str) -> Optional[int]:
    """Get user's company ID for data filtering"""
    try:
        cursor = conn.execute(
            "SELECT company_id FROM users WHERE firebase_uid = ? AND is_active = 1",
            (firebase_uid,)
        )
        result = cursor.fetchone()
        return result[0] if result else None
    except PostgresError as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")


def get_company_users(company_id: int) -> List[Dict]:
    """Get all users in a company"""
    try:
        cursor = conn.execute(
            """
            SELECT id, firebase_uid, email, display_name, role, created_at
            FROM users 
            WHERE company_id = ? AND is_active = 1
            ORDER BY created_at DESC
            """,
            (company_id,)
        )
        users = cursor.fetchall()
        return [
            {
                "id": user[0],
                "firebase_uid": user[1],
                "email": user[2],
                "display_name": user[3],
                "role": user[4],
                "created_at": user[5]
            }
            for user in users
        ]
    except PostgresError as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")


def update_user_role(user_id: int, role: str) -> bool:
    """Update user role (admin, manager, viewer)"""
    try:
        conn.execute(
            "UPDATE users SET role = ?, updated_at = NOW() WHERE id = ?",
            (role, user_id)
        )
        conn.commit()
        return True
    except PostgresError as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")


def get_user_by_firebase_uid(firebase_uid: str) -> Optional[Dict]:
    """Get user details by Firebase UID"""
    try:
        cursor = conn.execute(
            """
            SELECT u.id, u.firebase_uid, u.email, u.display_name, u.company_id, u.role, c.name as company_name
            FROM users u
            LEFT JOIN companies c ON u.company_id = c.id
            WHERE u.firebase_uid = ? AND u.is_active = 1
            """,
            (firebase_uid,)
        )
        user = cursor.fetchone()
        
        if not user:
            return None
            
        return {
            "id": user[0],
            "firebase_uid": user[1],
            "email": user[2],
            "display_name": user[3],
            "company_id": user[4],
            "role": user[5],
            "company_name": user[6]
        }
    except PostgresError as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")


def get_all_users() -> List[Dict]:
    """Get all users"""
    try:
        cursor = conn.execute(
            """
            SELECT u.id, u.firebase_uid, u.email, u.display_name, u.company_id, u.role, 
                   u.is_active, u.created_at, c.name as company_name
            FROM users u
            LEFT JOIN companies c ON u.company_id = c.id
            WHERE u.is_active = 1
            ORDER BY u.created_at DESC
            """
        )
        users = cursor.fetchall()
        return [
            {
                "id": user[0],
                "firebase_uid": user[1],
                "email": user[2],
                "display_name": user[3],
                "company_id": user[4],
                "role": user[5],
                "is_active": bool(user[6]),
                "created_at": user[7],
                "company_name": user[8]
            }
            for user in users
        ]
    except PostgresError as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")


def get_companies() -> List[Dict]:
    """Get all companies"""
    try:
        cursor = conn.execute(
            """
            SELECT c.id, c.name, c.description, c.created_at, 
                   COUNT(u.id) as user_count
            FROM companies c
            LEFT JOIN users u ON c.id = u.company_id AND u.is_active = 1
            WHERE c.is_active = 1
            GROUP BY c.id, c.name, c.description, c.created_at
            ORDER BY c.created_at DESC
            """
        )
        companies = cursor.fetchall()
        return [
            {
                "id": company[0],
                "name": company[1],
                "description": company[2],
                "created_at": company[3],
                "user_count": company[4]
            }
            for company in companies
        ]
    except PostgresError as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")
