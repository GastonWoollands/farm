"""
Updated registrations service with multi-tenant support
This shows how to modify existing services to use company-based filtering
"""

import sqlite3
from typing import Optional, List, Dict, Tuple
from fastapi import HTTPException
from ..db import conn
from ..models import RegisterBody, UpdateBody
from .auth_service import get_data_filter_clause


def insert_registration_multi_tenant(user: Dict, body: RegisterBody) -> int:
    """
    Insert registration with multi-tenant support
    user: User dict from auth_service.authenticate_user()
    """
    try:
        company_id = user.get('company_id')
        firebase_uid = user.get('firebase_uid')
        
        with conn:
            cursor = conn.execute(
                """
                INSERT INTO registrations (
                    animal_number, created_at, user_key, created_by, mother_id, 
                    born_date, weight, gender, status, color, notes, notes_mother,
                    insemination_round_id, insemination_identifier, scrotal_circumference,
                    animal_type, company_id
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    body.animalNumber,
                    body.createdAt or sqlite3.datetime.datetime.now().isoformat(),
                    None,  # user_key for legacy compatibility
                    firebase_uid,
                    body.motherId,
                    body.bornDate,
                    body.weight,
                    body.gender,
                    body.status,
                    body.color,
                    body.notes,
                    body.notesMother,
                    body.inseminationRoundId,
                    body.inseminationIdentifier,
                    body.scrotalCircumference,
                    _get_animal_type(body.gender),
                    company_id
                )
            )
            record_id = cursor.lastrowid
            
            # Create event record
            conn.execute(
                """
                INSERT INTO events_state (
                    animal_id, animal_number, event_type, user_id, event_date, notes, company_id
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    record_id,
                    body.animalNumber,
                    "created",
                    firebase_uid,
                    sqlite3.datetime.datetime.now().isoformat(),
                    f"Animal registered by {user.get('display_name', 'Unknown')}",
                    company_id
                )
            )
            
            return record_id
    except sqlite3.Error as e:
        raise HTTPException(status_code=500, detail=f"DB error: {e}")


def get_registrations_multi_tenant(user: Dict, limit: int = 100) -> List[Dict]:
    """
    Get registrations with multi-tenant filtering
    """
    try:
        company_id = user.get('company_id')
        firebase_uid = user.get('firebase_uid')
        
        where_clause, params = get_data_filter_clause(company_id, firebase_uid)
        params.append(limit)
        
        cursor = conn.execute(
            f"""
            SELECT id, animal_number, created_at, mother_id, born_date, weight, 
                   gender, status, color, notes, notes_mother, insemination_round_id,
                   insemination_identifier, scrotal_circumference, animal_type,
                   rp_animal, rp_mother, mother_weight
            FROM registrations
            WHERE {where_clause}
            ORDER BY id DESC
            LIMIT ?
            """,
            params
        )
        
        rows = cursor.fetchall()
        return [
            {
                "id": row[0],
                "animalNumber": row[1],
                "createdAt": row[2],
                "motherId": row[3],
                "bornDate": row[4],
                "weight": row[5],
                "gender": row[6],
                "status": row[7],
                "color": row[8],
                "notes": row[9],
                "notesMother": row[10],
                "inseminationRoundId": row[11],
                "inseminationIdentifier": row[12],
                "scrotalCircumference": row[13],
                "animalType": row[14]
            }
            for row in rows
        ]
    except sqlite3.Error as e:
        raise HTTPException(status_code=500, detail=f"DB error: {e}")


def export_rows_multi_tenant(
    user: Dict, 
    date: str | None = None, 
    start: str | None = None, 
    end: str | None = None
) -> List[Dict]:
    """
    Export registrations with multi-tenant filtering
    """
    try:
        company_id = user.get('company_id')
        firebase_uid = user.get('firebase_uid')
        
        where_clause, params = get_data_filter_clause(company_id, firebase_uid)
        
        if date:
            where_clause += " AND date(born_date) = date(?)"
            params.append(date)
        else:
            if start:
                where_clause += " AND date(born_date) >= date(?)"
                params.append(start)
            if end:
                where_clause += " AND date(born_date) <= date(?)"
                params.append(end)
        
        cursor = conn.execute(
            f"""
            SELECT animal_number, born_date, mother_id, father_id,
                   weight, gender, animal_type, status, color, notes, notes_mother, 
                   created_at, insemination_round_id, insemination_identifier, 
                   scrotal_circumference, rp_animal, rp_mother, mother_weight
            FROM registrations
            WHERE {where_clause}
            ORDER BY id ASC
            """,
            tuple(params)
        )
        
        cols = [d[0] for d in cursor.description]
        return [dict(zip(cols, r)) for r in cursor.fetchall()]
    except sqlite3.Error as e:
        raise HTTPException(status_code=500, detail=f"DB error: {e}")


def _get_animal_type(gender: str) -> int:
    """Get animal type based on gender"""
    if gender and gender.lower() in ['female', 'f', 'hembra']:
        return 1  # cow
    elif gender and gender.lower() in ['male', 'm', 'macho']:
        return 2  # bull
    return 1  # default to cow


def get_registration_stats_multi_tenant(user: Dict) -> Dict:
    """
    Get registration statistics with multi-tenant filtering
    """
    try:
        company_id = user.get('company_id')
        firebase_uid = user.get('firebase_uid')
        
        where_clause, params = get_data_filter_clause(company_id, firebase_uid)
        # Exclude DELETED animals from all stats
        deleted_filter = "AND (status IS NULL OR status != 'DELETED')"
        
        # Total registrations (excluding DELETED)
        cursor = conn.execute(
            f"SELECT COUNT(*) FROM registrations WHERE {where_clause} {deleted_filter}",
            params
        )
        total_registrations = cursor.fetchone()[0]
        
        # By gender (excluding DELETED)
        cursor = conn.execute(
            f"""
            SELECT gender, COUNT(*) 
            FROM registrations 
            WHERE {where_clause} AND gender IS NOT NULL {deleted_filter}
            GROUP BY gender
            """,
            params
        )
        gender_stats = dict(cursor.fetchall())
        
        # By animal type (excluding DELETED)
        cursor = conn.execute(
            f"""
            SELECT animal_type, COUNT(*) 
            FROM registrations 
            WHERE {where_clause} AND animal_type IS NOT NULL {deleted_filter}
            GROUP BY animal_type
            """,
            params
        )
        animal_type_stats = dict(cursor.fetchall())
        
        # Recent registrations (last 30 days, excluding DELETED)
        cursor = conn.execute(
            f"""
            SELECT COUNT(*) 
            FROM registrations 
            WHERE {where_clause} {deleted_filter}
            AND date(created_at) >= date('now', '-30 days')
            """,
            params
        )
        recent_registrations = cursor.fetchone()[0]
        
        return {
            "total_registrations": total_registrations,
            "gender_stats": gender_stats,
            "animal_type_stats": animal_type_stats,
            "recent_registrations": recent_registrations,
            "company_id": company_id,
            "is_company_data": company_id is not None
        }
    except sqlite3.Error as e:
        raise HTTPException(status_code=500, detail=f"DB error: {e}")
