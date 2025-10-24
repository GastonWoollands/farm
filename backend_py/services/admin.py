import sqlite3
from fastapi import HTTPException
from ..db import conn

def delete_all(user_identifier: str | None = None) -> None:
    try:
        with conn:
            if user_identifier:
                # Delete by either created_by (Firebase UID) or user_key (legacy)
                conn.execute("DELETE FROM registrations WHERE created_by = ? OR user_key = ?", (user_identifier, user_identifier))
            else:
                conn.execute("DELETE FROM registrations")
    except sqlite3.Error as e:
        raise HTTPException(status_code=500, detail=f"DB error: {e}")

def exec_sql(sql: str, params: tuple) -> dict:
    try:
        cur = conn.execute(sql, params)
        if cur.description:
            cols = [d[0] for d in cur.description]
            rows = [dict(zip(cols, r)) for r in cur.fetchall()]
            return {"rows": rows}
        else:
            changed = conn.total_changes
            conn.commit()
            return {"ok": True, "changes": changed}
    except sqlite3.Error as e:
        raise HTTPException(status_code=400, detail=f"SQL error: {e}")

def migrate_legacy_data(company_id: int) -> dict:
    """Migrate legacy data (company_id = NULL) to specified company"""
    try:
        with conn:
            # Migrate registrations
            cursor = conn.execute("UPDATE registrations SET company_id = ? WHERE company_id IS NULL", (company_id,))
            registrations_updated = cursor.rowcount
            
            # Migrate events_state
            cursor = conn.execute("UPDATE events_state SET company_id = ? WHERE company_id IS NULL", (company_id,))
            events_updated = cursor.rowcount
            
            # Migrate inseminations
            cursor = conn.execute("UPDATE inseminations SET company_id = ? WHERE company_id IS NULL", (company_id,))
            inseminations_updated = cursor.rowcount
            
            conn.commit()
            
            return {
                "ok": True,
                "message": f"Legacy data migrated to company {company_id}",
                "migrated": {
                    "registrations": registrations_updated,
                    "events": events_updated,
                    "inseminations": inseminations_updated
                }
            }
    except sqlite3.Error as e:
        raise HTTPException(status_code=500, detail=f"Migration error: {e}")


