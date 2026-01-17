"""
Inseminations IDs Service
Handles CRUD operations for insemination IDs lookup table
"""

from fastapi import HTTPException
from psycopg2 import Error as PostgresError, IntegrityError
from ..db import conn
from ..models import InseminationIdBody, UpdateInseminationIdBody


def get_inseminations_ids(company_id: int | None = None) -> list[dict]:
    """Get all insemination IDs, optionally filtered by company"""
    try:
        if company_id:
            cursor = conn.execute("""
                SELECT id, insemination_round_id, initial_date, end_date, notes, company_id, created_at, updated_at
                FROM inseminations_ids 
                WHERE company_id = ?
                ORDER BY insemination_round_id ASC
            """, (company_id,))
        else:
            cursor = conn.execute("""
                SELECT id, insemination_round_id, initial_date, end_date, notes, company_id, created_at, updated_at
                FROM inseminations_ids 
                ORDER BY insemination_round_id ASC
            """)
        
        columns = [description[0] for description in cursor.description]
        return [dict(zip(columns, row)) for row in cursor.fetchall()]
    except PostgresError as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")


def get_insemination_id_by_round_id(insemination_round_id: str, company_id: int | None = None) -> dict:
    """Get a specific insemination ID by its round ID, optionally filtered by company"""
    try:
        if company_id:
            cursor = conn.execute("""
                SELECT id, insemination_round_id, initial_date, end_date, notes, company_id, created_at, updated_at
                FROM inseminations_ids 
                WHERE insemination_round_id = ? AND company_id = ?
            """, (insemination_round_id, company_id))
        else:
            cursor = conn.execute("""
                SELECT id, insemination_round_id, initial_date, end_date, notes, company_id, created_at, updated_at
                FROM inseminations_ids 
                WHERE insemination_round_id = ?
            """, (insemination_round_id,))
        
        columns = [description[0] for description in cursor.description]
        result = cursor.fetchone()
        
        if not result:
            raise HTTPException(status_code=404, detail="Insemination round ID not found")
        
        return dict(zip(columns, result))
    except PostgresError as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")


def create_insemination_id(body: InseminationIdBody) -> int:
    """Create a new insemination ID"""
    try:
        with conn:
            cursor = conn.execute("""
                INSERT INTO inseminations_ids (
                    insemination_round_id, initial_date, end_date, notes, company_id
                )
                VALUES (?, ?, ?, ?, ?)
            """, (
                body.insemination_round_id,
                body.initial_date,
                body.end_date,
                body.notes,
                body.company_id
            ))
            
            return cursor.lastrowid
    except IntegrityError as e:
        if "UNIQUE constraint failed" in str(e):
            raise HTTPException(status_code=409, detail="Insemination round ID already exists for this company")
        raise HTTPException(status_code=500, detail=f"Database integrity error: {e}")
    except PostgresError as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")


def update_insemination_id(insemination_round_id: str, body: UpdateInseminationIdBody, company_id: int | None = None) -> None:
    """Update an existing insemination ID"""
    try:
        # Build dynamic UPDATE query
        update_fields = []
        params = []
        
        if body.insemination_round_id is not None:
            update_fields.append("insemination_round_id = ?")
            params.append(body.insemination_round_id)
        
        if body.initial_date is not None:
            update_fields.append("initial_date = ?")
            params.append(body.initial_date)
        
        if body.end_date is not None:
            update_fields.append("end_date = ?")
            params.append(body.end_date)
        
        if body.notes is not None:
            update_fields.append("notes = ?")
            params.append(body.notes)
        
        if not update_fields:
            raise HTTPException(status_code=400, detail="No fields to update")
        
        update_fields.append("updated_at = NOW()")
        params.append(insemination_round_id)
        
        # Add company_id filter if provided
        if company_id is not None:
            params.append(company_id)
            where_clause = "WHERE insemination_round_id = ? AND company_id = ?"
        else:
            where_clause = "WHERE insemination_round_id = ?"
        
        with conn:
            cursor = conn.execute(f"""
                UPDATE inseminations_ids 
                SET {', '.join(update_fields)}
                {where_clause}
            """, params)
            
            if cursor.rowcount == 0:
                raise HTTPException(status_code=404, detail="Insemination round ID not found")
    except IntegrityError as e:
        if "UNIQUE constraint failed" in str(e):
            raise HTTPException(status_code=409, detail="Insemination round ID already exists")
        raise HTTPException(status_code=500, detail=f"Database integrity error: {e}")
    except PostgresError as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")


def delete_insemination_id(insemination_round_id: str, company_id: int | None = None) -> None:
    """Delete an insemination ID"""
    try:
        if company_id is not None:
            with conn:
                cursor = conn.execute("""
                    DELETE FROM inseminations_ids 
                    WHERE insemination_round_id = ? AND company_id = ?
                """, (insemination_round_id, company_id))
        else:
            with conn:
                cursor = conn.execute("""
                    DELETE FROM inseminations_ids 
                    WHERE insemination_round_id = ?
                """, (insemination_round_id,))
            
            if cursor.rowcount == 0:
                raise HTTPException(status_code=404, detail="Insemination round ID not found")
    except PostgresError as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")
