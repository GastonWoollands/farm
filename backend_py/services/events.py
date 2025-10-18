import sqlite3
from typing import List, Dict, Optional
from ..db import conn
from ..models import EventState

def get_events_by_animal(animal_id: int, user_id: str) -> List[Dict]:
    """Get all events for a specific animal"""
    try:
        cursor = conn.execute(
            """
            SELECT id, animal_id, event_type, modified_field, old_value, new_value, 
                   user_id, event_date, notes
            FROM events_state 
            WHERE animal_id = ? AND user_id = ?
            ORDER BY event_date DESC
            """,
            (animal_id, user_id)
        )
        rows = cursor.fetchall()
        return [
            {
                "id": row[0],
                "animal_id": row[1],
                "event_type": row[2],
                "modified_field": row[3],
                "old_value": row[4],
                "new_value": row[5],
                "user_id": row[6],
                "event_date": row[7],
                "notes": row[8]
            }
            for row in rows
        ]
    except sqlite3.Error as e:
        print(f"Error getting events: {e}")
        return []

def get_events_by_user(user_id: str, limit: int = 100) -> List[Dict]:
    """Get recent events for a user"""
    try:
        cursor = conn.execute(
            """
            SELECT e.id, e.animal_id, e.event_type, e.modified_field, e.old_value, e.new_value, 
                   e.user_id, e.event_date, e.notes, r.animal_number
            FROM events_state e
            JOIN registrations r ON e.animal_id = r.id
            WHERE e.user_id = ?
            ORDER BY e.event_date DESC
            LIMIT ?
            """,
            (user_id, limit)
        )
        rows = cursor.fetchall()
        return [
            {
                "id": row[0],
                "animal_id": row[1],
                "event_type": row[2],
                "modified_field": row[3],
                "old_value": row[4],
                "new_value": row[5],
                "user_id": row[6],
                "event_date": row[7],
                "notes": row[8],
                "animal_number": row[9]
            }
            for row in rows
        ]
    except sqlite3.Error as e:
        print(f"Error getting user events: {e}")
        return []

def get_events_by_type(event_type: str, user_id: str, limit: int = 100) -> List[Dict]:
    """Get events by type (nacimiento, death, correccion)"""
    try:
        cursor = conn.execute(
            """
            SELECT e.id, e.animal_id, e.event_type, e.modified_field, e.old_value, e.new_value, 
                   e.user_id, e.event_date, e.notes, r.animal_number
            FROM events_state e
            JOIN registrations r ON e.animal_id = r.id
            WHERE e.event_type = ? AND e.user_id = ?
            ORDER BY e.event_date DESC
            LIMIT ?
            """,
            (event_type, user_id, limit)
        )
        rows = cursor.fetchall()
        return [
            {
                "id": row[0],
                "animal_id": row[1],
                "event_type": row[2],
                "modified_field": row[3],
                "old_value": row[4],
                "new_value": row[5],
                "user_id": row[6],
                "event_date": row[7],
                "notes": row[8],
                "animal_number": row[9]
            }
            for row in rows
        ]
    except sqlite3.Error as e:
        print(f"Error getting events by type: {e}")
        return []

def get_death_events(user_id: str, limit: int = 50) -> List[Dict]:
    """Get all death events for a user"""
    return get_events_by_type("death", user_id, limit)

def get_birth_events(user_id: str, limit: int = 50) -> List[Dict]:
    """Get all birth events for a user"""
    return get_events_by_type("born", user_id, limit)

