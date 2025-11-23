"""
Multi-tenant insemination functions
"""

import sqlite3
from fastapi import HTTPException
from ..db import conn
from .auth_service import get_data_filter_clause


def get_inseminations_multi_tenant(user: dict, limit: int = 100) -> list[dict]:
    """Get inseminations with multi-tenant filtering"""
    try:
        company_id = user.get('company_id')
        firebase_uid = user.get('firebase_uid')
        
        where_clause, params = get_data_filter_clause(company_id, firebase_uid)
        params.append(limit)
        
        cursor = conn.execute(
            f"""
            SELECT id, insemination_identifier, insemination_round_id, mother_id, mother_visual_id, 
                   bull_id, insemination_date, animal_type, notes, created_at
            FROM inseminations
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
                "inseminationIdentifier": row[1],
                "inseminationRoundId": row[2],
                "motherId": row[3],
                "motherVisualId": row[4],
                "bullId": row[5],
                "inseminationDate": row[6],
                "animalType": row[7],
                "notes": row[8],
                "createdAt": row[9]
            }
            for row in rows
        ]
    except sqlite3.Error as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")


def get_insemination_statistics_multi_tenant(user: dict) -> dict:
    """Get insemination statistics with multi-tenant filtering"""
    try:
        company_id = user.get('company_id')
        firebase_uid = user.get('firebase_uid')
        
        where_clause, params = get_data_filter_clause(company_id, firebase_uid)
        
        # Total inseminations
        cursor = conn.execute(
            f"SELECT COUNT(*) FROM inseminations WHERE {where_clause}",
            params
        )
        total_inseminations = cursor.fetchone()[0]
        
        # By animal type
        cursor = conn.execute(
            f"""
            SELECT animal_type, COUNT(*) 
            FROM inseminations 
            WHERE {where_clause} AND animal_type IS NOT NULL
            GROUP BY animal_type
            """,
            params
        )
        animal_type_stats = dict(cursor.fetchall())
        
        # Recent inseminations (last 30 days)
        cursor = conn.execute(
            f"""
            SELECT COUNT(*) 
            FROM inseminations 
            WHERE {where_clause} 
            AND date(created_at) >= date('now', '-30 days')
            """,
            params
        )
        recent_inseminations = cursor.fetchone()[0]
        
        return {
            "total_inseminations": total_inseminations,
            "animal_type_stats": animal_type_stats,
            "recent_inseminations": recent_inseminations,
            "company_id": company_id,
            "is_company_data": company_id is not None
        }
    except sqlite3.Error as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")


def export_inseminations_multi_tenant(user: dict, insemination_round_id: str = None) -> list[dict]:
    """Export inseminations with multi-tenant filtering, optionally filtered by round ID"""
    try:
        company_id = user.get('company_id')
        firebase_uid = user.get('firebase_uid')
        
        where_clause, params = get_data_filter_clause(company_id, firebase_uid)
        
        # Add round ID filter if provided
        if insemination_round_id:
            where_clause += " AND insemination_round_id = ?"
            params.append(insemination_round_id)
        
        cursor = conn.execute(
            f"""
            SELECT registration_date, insemination_date, mother_id, bull_id
            FROM inseminations
            WHERE {where_clause}
            ORDER BY insemination_date DESC
            """,
            params
        )
        
        rows = cursor.fetchall()
        return [
            {
                "date": row[0],
                "insemination_date": row[1],
                "mother_id": row[2],
                "bull_name": row[3] or ""
            }
            for row in rows
        ]
    except sqlite3.Error as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")
