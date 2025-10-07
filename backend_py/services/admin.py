import sqlite3
from fastapi import HTTPException
from ..db import conn

def delete_all(x_user_key: str | None = None) -> None:
    try:
        with conn:
            if x_user_key:
                conn.execute("DELETE FROM registrations WHERE user_key = ?", (x_user_key,))
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


