import sqlite3
from ..db import conn

def get_animal_types():
    """Get all animal types from the lookup table"""
    cursor = conn.execute("SELECT id, name, description FROM animal_types ORDER BY id")
    return [{"id": row[0], "name": row[1], "description": row[2]} for row in cursor.fetchall()]

def get_animal_type_by_id(animal_type_id):
    """Get a specific animal type by ID"""
    cursor = conn.execute("SELECT id, name, description FROM animal_types WHERE id = ?", (animal_type_id,))
    row = cursor.fetchone()
    if row:
        return {"id": row[0], "name": row[1], "description": row[2]}
    return None

def get_animal_type_by_name(name):
    """Get a specific animal type by name"""
    cursor = conn.execute("SELECT id, name, description FROM animal_types WHERE name = ?", (name,))
    row = cursor.fetchone()
    if row:
        return {"id": row[0], "name": row[1], "description": row[2]}
    return None
