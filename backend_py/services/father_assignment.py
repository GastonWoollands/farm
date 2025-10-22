"""
Father Assignment Service
Handles automatic assignment of father IDs to registrations based on insemination data
"""

import sqlite3
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple
from ..db import conn


class FatherAssignmentService:
    """Service for assigning father IDs to registrations based on insemination data"""
    
    def __init__(self, gestation_days: int = 300):
        self.gestation_days = gestation_days
    
    def get_registrations_without_father(self) -> List[Dict]:
        """Get all registrations that don't have a father_id assigned"""
        try:
            cursor = conn.execute("""
                SELECT id, animal_number, mother_id, born_date, father_id, insemination_identifier
                FROM registrations 
                WHERE mother_id IS NOT NULL 
                AND born_date IS NOT NULL 
                AND (father_id IS NULL OR father_id = '')
                ORDER BY born_date DESC
            """)
            
            columns = [description[0] for description in cursor.description]
            return [dict(zip(columns, row)) for row in cursor.fetchall()]
        except sqlite3.Error as e:
            raise Exception(f"Database error fetching registrations: {e}")
    
    def get_inseminations_by_mother(self, mother_id: str) -> List[Dict]:
        """Get all inseminations for a specific mother, ordered by date"""
        try:
            cursor = conn.execute("""
                SELECT id, mother_id, bull_id, insemination_date, insemination_identifier
                FROM inseminations 
                WHERE mother_id = ?
                ORDER BY insemination_date DESC
            """, (mother_id,))
            
            columns = [description[0] for description in cursor.description]
            return [dict(zip(columns, row)) for row in cursor.fetchall()]
        except sqlite3.Error as e:
            raise Exception(f"Database error fetching inseminations: {e}")
    
    def calculate_gestation_period(self, insemination_date: str, born_date: str) -> int:
        """Calculate gestation period in days between insemination and birth"""
        try:
            insem_date = datetime.strptime(insemination_date, '%Y-%m-%d').date()
            birth_date = datetime.strptime(born_date, '%Y-%m-%d').date()
            return (birth_date - insem_date).days
        except ValueError as e:
            raise Exception(f"Date parsing error: {e}")
    
    def find_matching_insemination(self, mother_id: str, born_date: str) -> Optional[Dict]:
        """Find the most likely insemination that resulted in this birth"""
        inseminations = self.get_inseminations_by_mother(mother_id)
        
        if not inseminations:
            return None
        
        # Find the closest insemination within gestation period
        best_match = None
        min_days_over = float('inf')
        
        for insem in inseminations:
            try:
                gestation_days = self.calculate_gestation_period(
                    insem['insemination_date'], 
                    born_date
                )
                
                # If within normal gestation period, this is a match
                if gestation_days <= self.gestation_days:
                    return insem
                
                # If over gestation period, track the closest one
                if gestation_days < min_days_over:
                    min_days_over = gestation_days
                    best_match = insem
                    
            except Exception:
                continue
        
        # If no insemination within normal period, return closest (will be marked as REPASO)
        return best_match
    
    def assign_father_id(self, registration_id: int, father_id: str, insemination_identifier: str = None) -> bool:
        """Assign father_id and insemination_identifier to a registration"""
        try:
            with conn:
                cursor = conn.execute("""
                    UPDATE registrations 
                    SET father_id = ?, insemination_identifier = ?, updated_at = datetime('now')
                    WHERE id = ?
                """, (father_id, insemination_identifier, registration_id))
                
                return cursor.rowcount > 0
        except sqlite3.Error as e:
            raise Exception(f"Database error updating registration: {e}")
    
    def process_single_registration(self, registration: Dict) -> Dict:
        """Process a single registration and assign father if possible"""
        result = {
            'registration_id': registration['id'],
            'animal_number': registration['animal_number'],
            'mother_id': registration['mother_id'],
            'born_date': registration['born_date'],
            'assigned_father': None,
            'gestation_days': None,
            'status': 'no_insemination',
            'error': None
        }
        
        try:
            # Find matching insemination
            matching_insem = self.find_matching_insemination(
                registration['mother_id'], 
                registration['born_date']
            )
            
            if not matching_insem:
                result['status'] = 'no_insemination'
                return result
            
            # Calculate gestation period
            gestation_days = self.calculate_gestation_period(
                matching_insem['insemination_date'],
                registration['born_date']
            )
            result['gestation_days'] = gestation_days
            
            # Determine father ID
            if gestation_days <= self.gestation_days:
                assigned_father = matching_insem['bull_id'] or 'UNKNOWN'
                result['status'] = 'assigned'
            else:
                assigned_father = 'REPASO'
                result['status'] = 'repaso'
            
            # Update registration
            insemination_identifier = matching_insem.get('insemination_identifier')
            if self.assign_father_id(registration['id'], assigned_father, insemination_identifier):
                result['assigned_father'] = assigned_father
                result['insemination_identifier'] = insemination_identifier
            else:
                result['error'] = 'Failed to update registration'
                result['status'] = 'error'
                
        except Exception as e:
            result['error'] = str(e)
            result['status'] = 'error'
        
        return result
    
    def process_all_registrations(self, dry_run: bool = False) -> Dict:
        """Process all registrations without father IDs"""
        start_time = datetime.now()
        
        # Get all registrations without father IDs
        registrations = self.get_registrations_without_father()
        
        results = {
            'total_processed': len(registrations),
            'assigned': 0,
            'repaso': 0,
            'no_insemination': 0,
            'errors': 0,
            'processing_time_seconds': 0,
            'results': []
        }
        
        if not registrations:
            results['processing_time_seconds'] = (datetime.now() - start_time).total_seconds()
            return results
        
        # Process each registration
        for registration in registrations:
            if dry_run:
                # For dry run, just simulate the process
                result = self.process_single_registration(registration)
                result['assigned_father'] = None  # Don't actually assign
            else:
                result = self.process_single_registration(registration)
            
            results['results'].append(result)
            
            # Count results
            if result['status'] == 'assigned':
                results['assigned'] += 1
            elif result['status'] == 'repaso':
                results['repaso'] += 1
            elif result['status'] == 'no_insemination':
                results['no_insemination'] += 1
            elif result['status'] == 'error':
                results['errors'] += 1
        
        results['processing_time_seconds'] = (datetime.now() - start_time).total_seconds()
        return results
    
    def get_assignment_stats(self) -> Dict:
        """Get statistics about father ID assignments"""
        try:
            cursor = conn.execute("""
                SELECT 
                    COUNT(*) as total_registrations,
                    COUNT(CASE WHEN father_id IS NOT NULL AND father_id != '' THEN 1 END) as with_father,
                    COUNT(CASE WHEN father_id IS NULL OR father_id = '' THEN 1 END) as without_father,
                    COUNT(CASE WHEN father_id = 'REPASO' THEN 1 END) as repaso_count
                FROM registrations 
                WHERE mother_id IS NOT NULL AND born_date IS NOT NULL
            """)
            
            row = cursor.fetchone()
            return {
                'total_registrations': row[0],
                'with_father': row[1],
                'without_father': row[2],
                'repaso_count': row[3],
                'assignment_rate': round((row[1] / row[0]) * 100, 2) if row[0] > 0 else 0
            }
        except sqlite3.Error as e:
            raise Exception(f"Database error fetching stats: {e}")


def create_father_assignment_service(gestation_days: int = 300) -> FatherAssignmentService:
    """Factory function to create a FatherAssignmentService instance"""
    return FatherAssignmentService(gestation_days)
