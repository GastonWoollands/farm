"""
Background Father Assignment Service
Handles real-time father ID assignment when new inseminations are created
"""

import threading
import logging
from typing import List
from .father_assignment import create_father_assignment_service

# Setup logging for background tasks
logger = logging.getLogger(__name__)


def trigger_father_assignment_for_mother(mother_id: str, gestation_days: int = 300, min_gestation_days: int = 260):
    """
    Trigger father assignment for all registrations of a specific mother in the background.
    
    This function runs in a separate thread to avoid blocking the HTTP request.
    It processes registrations for the given mother_id that don't have a father_id yet.
    
    Args:
        mother_id: The mother's animal ID to process
        gestation_days: Maximum gestation period in days (default: 300)
        min_gestation_days: Minimum gestation period in days (default: 260)
    """
    def _process_in_background():
        try:
            service = create_father_assignment_service(gestation_days, min_gestation_days)
            results = service.process_registrations_for_mother(mother_id)
            
            if results['total_processed'] > 0:
                logger.info(
                    f"Background father assignment for mother {mother_id}: "
                    f"processed={results['total_processed']}, "
                    f"assigned={results['assigned']}, "
                    f"repaso={results['repaso']}, "
                    f"time={results['processing_time_seconds']:.3f}s"
                )
            else:
                logger.debug(f"No registrations to process for mother {mother_id}")
                
        except Exception as e:
            # Log error but don't raise - this is a background task
            logger.error(f"Error in background father assignment for mother {mother_id}: {str(e)}", exc_info=True)
    
    # Start background thread
    thread = threading.Thread(target=_process_in_background, daemon=True)
    thread.start()
    logger.debug(f"Started background father assignment thread for mother {mother_id}")


def trigger_father_assignment_for_multiple_mothers(mother_ids: List[str], gestation_days: int = 300, min_gestation_days: int = 260):
    """
    Trigger father assignment for multiple mothers in the background.
    
    This is optimized for bulk uploads where multiple inseminations are created at once.
    It processes each mother in a separate background thread.
    
    Args:
        mother_ids: List of mother animal IDs to process
        gestation_days: Maximum gestation period in days (default: 300)
        min_gestation_days: Minimum gestation period in days (default: 260)
    """
    # Use a set to avoid processing the same mother multiple times
    unique_mother_ids = list(set(mother_ids))
    
    for mother_id in unique_mother_ids:
        trigger_father_assignment_for_mother(mother_id, gestation_days, min_gestation_days)
    
    logger.info(f"Triggered background father assignment for {len(unique_mother_ids)} unique mothers")

