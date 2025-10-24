"""
Company management service for multi-tenant architecture
Handles company CRUD operations and data access control
"""

import sqlite3
from typing import Optional, Dict, List
from fastapi import HTTPException
from ..db import conn


def create_company(name: str, description: str = None) -> Dict:
    """Create a new company"""
    try:
        # Validate input
        if not name or not name.strip():
            raise HTTPException(status_code=400, detail="Company name is required")
        
        # Check if company name already exists
        cursor = conn.execute(
            "SELECT id FROM companies WHERE name = ? AND is_active = 1",
            (name.strip(),)
        )
        existing_company = cursor.fetchone()
        
        if existing_company:
            raise HTTPException(status_code=409, detail="Company with this name already exists")
        
        cursor = conn.execute(
            "INSERT INTO companies (name, description) VALUES (?, ?)",
            (name.strip(), description.strip() if description else None)
        )
        company_id = cursor.lastrowid
        conn.commit()
        
        return {
            "id": company_id,
            "name": name.strip(),
            "description": description.strip() if description else None,
            "created_at": None,  # Will be set by DB default
            "is_active": True
        }
    except HTTPException:
        raise
    except sqlite3.IntegrityError as e:
        if "UNIQUE constraint failed: companies.name" in str(e):
            raise HTTPException(status_code=409, detail="Company with this name already exists")
        else:
            raise HTTPException(status_code=500, detail=f"Database constraint error: {e}")
    except sqlite3.Error as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")


def get_company(company_id: int) -> Optional[Dict]:
    """Get company by ID"""
    try:
        cursor = conn.execute(
            "SELECT id, name, description, created_at, is_active FROM companies WHERE id = ?",
            (company_id,)
        )
        company = cursor.fetchone()
        
        if not company:
            return None
            
        return {
            "id": company[0],
            "name": company[1],
            "description": company[2],
            "created_at": company[3],
            "is_active": bool(company[4])
        }
    except sqlite3.Error as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")


def get_all_companies() -> List[Dict]:
    """Get all active companies"""
    try:
        cursor = conn.execute(
            """
            SELECT c.id, c.name, c.description, c.created_at, c.is_active,
                   COUNT(u.id) as user_count
            FROM companies c
            LEFT JOIN users u ON c.id = u.company_id AND u.is_active = 1
            WHERE c.is_active = 1
            GROUP BY c.id, c.name, c.description, c.created_at, c.is_active
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
                "is_active": bool(company[4]),
                "user_count": company[5]
            }
            for company in companies
        ]
    except sqlite3.Error as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")


def update_company(company_id: int, name: str = None, description: str = None) -> bool:
    """Update company details"""
    try:
        updates = []
        params = []
        
        if name is not None:
            updates.append("name = ?")
            params.append(name)
        
        if description is not None:
            updates.append("description = ?")
            params.append(description)
        
        if not updates:
            return True
            
        updates.append("updated_at = datetime('now')")
        params.append(company_id)
        
        conn.execute(
            f"UPDATE companies SET {', '.join(updates)} WHERE id = ?",
            params
        )
        conn.commit()
        return True
    except sqlite3.Error as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")


def deactivate_company(company_id: int) -> bool:
    """Deactivate a company (soft delete)"""
    try:
        conn.execute(
            "UPDATE companies SET is_active = 0, updated_at = datetime('now') WHERE id = ?",
            (company_id,)
        )
        conn.commit()
        return True
    except sqlite3.Error as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")


def get_company_data_access(company_id: int) -> Dict:
    """Get data access summary for a company"""
    try:
        # Get registration count
        cursor = conn.execute(
            "SELECT COUNT(*) FROM registrations WHERE company_id = ?",
            (company_id,)
        )
        registration_count = cursor.fetchone()[0]
        
        # Get insemination count
        cursor = conn.execute(
            "SELECT COUNT(*) FROM inseminations WHERE company_id = ?",
            (company_id,)
        )
        insemination_count = cursor.fetchone()[0]
        
        # Get user count
        cursor = conn.execute(
            "SELECT COUNT(*) FROM users WHERE company_id = ? AND is_active = 1",
            (company_id,)
        )
        user_count = cursor.fetchone()[0]
        
        return {
            "company_id": company_id,
            "registrations": registration_count,
            "inseminations": insemination_count,
            "users": user_count
        }
    except sqlite3.Error as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")


def migrate_user_data_to_company(firebase_uid: str, company_id: int) -> bool:
    """
    Migrate existing user data to company
    This is used when a user gets assigned to a company
    """
    try:
        # Update registrations
        conn.execute(
            "UPDATE registrations SET company_id = ? WHERE created_by = ?",
            (company_id, firebase_uid)
        )
        
        # Update inseminations
        conn.execute(
            "UPDATE inseminations SET company_id = ? WHERE created_by = ?",
            (company_id, firebase_uid)
        )
        
        # Update events_state
        conn.execute(
            "UPDATE events_state SET company_id = ? WHERE user_id = ?",
            (company_id, firebase_uid)
        )
        
        conn.commit()
        return True
    except sqlite3.Error as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")
