#!/usr/bin/env python3
"""
Daily Father Assignment Automation Script
Runs automatically every night to assign father IDs to new registrations
"""

import requests
import json
import logging
from datetime import datetime
import os

# Configuration
API_BASE_URL = os.getenv("FARM_API_URL", "http://localhost:8000")
USER_KEY = os.getenv("FARM_USER_KEY", "system")
GESTATION_DAYS = int(os.getenv("GESTATION_DAYS", "300"))

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('/var/log/farm/father_assignment.log'),
        logging.StreamHandler()
    ]
)

def run_daily_father_assignment():
    """Run the daily father assignment process"""
    
    headers = {
        "X-User-Key": USER_KEY,
        "Content-Type": "application/json"
    }
    
    start_time = datetime.now()
    logging.info(f"Starting daily father assignment process at {start_time}")
    
    try:
        # First, get current stats
        response = requests.get(f"{API_BASE_URL}/father-assignment/stats", headers=headers)
        if response.status_code == 200:
            stats_before = response.json()['stats']
            logging.info(f"Stats before processing: {stats_before}")
        else:
            logging.error(f"Failed to get stats: {response.status_code}")
            return False
        
        # Process all pending assignments
        response = requests.post(
            f"{API_BASE_URL}/father-assignment/process?dry_run=false&gestation_days={GESTATION_DAYS}",
            headers=headers
        )
        
        if response.status_code == 200:
            results = response.json()['results']
            end_time = datetime.now()
            duration = (end_time - start_time).total_seconds()
            
            logging.info(f"Father assignment process completed in {duration:.2f} seconds")
            logging.info(f"Results: {results}")
            
            # Get updated stats
            response = requests.get(f"{API_BASE_URL}/father-assignment/stats", headers=headers)
            if response.status_code == 200:
                stats_after = response.json()['stats']
                logging.info(f"Stats after processing: {stats_after}")
                
                # Calculate improvement
                improvement = stats_after['with_father'] - stats_before['with_father']
                logging.info(f"Father IDs assigned: {improvement}")
            
            return True
        else:
            logging.error(f"Father assignment failed: {response.status_code} - {response.text}")
            return False
            
    except Exception as e:
        logging.error(f"Father assignment process failed: {str(e)}")
        return False

def validate_existing_assignments():
    """Validate existing father ID assignments"""
    
    headers = {
        "X-User-Key": USER_KEY,
        "Content-Type": "application/json"
    }
    
    try:
        response = requests.post(
            f"{API_BASE_URL}/father-assignment/validate-assignments?gestation_days={GESTATION_DAYS}",
            headers=headers
        )
        
        if response.status_code == 200:
            validation = response.json()
            logging.info(f"Assignment validation completed:")
            logging.info(f"  - Total validated: {validation['total_validated']}")
            logging.info(f"  - Valid assignments: {validation['valid_assignments']}")
            logging.info(f"  - Invalid assignments: {validation['invalid_assignments']}")
            logging.info(f"  - Validation rate: {validation['validation_rate']}%")
            
            # Log any invalid assignments
            if validation['invalid_assignments'] > 0:
                logging.warning(f"Found {validation['invalid_assignments']} invalid assignments")
                for result in validation['results']:
                    if not result['is_valid']:
                        logging.warning(f"  - Registration {result['registration_id']}: "
                                      f"Current: {result['current_father']}, "
                                      f"Expected: {result['expected_father']}")
        else:
            logging.error(f"Validation failed: {response.status_code} - {response.text}")
            
    except Exception as e:
        logging.error(f"Validation process failed: {str(e)}")

def main():
    """Main execution function"""
    
    logging.info("=" * 60)
    logging.info("FARM FATHER ASSIGNMENT DAILY PROCESS")
    logging.info("=" * 60)
    
    # Run the main assignment process
    success = run_daily_father_assignment()
    
    if success:
        # Validate existing assignments (optional)
        logging.info("Running assignment validation...")
        validate_existing_assignments()
        
        logging.info("Daily father assignment process completed successfully")
    else:
        logging.error("Daily father assignment process failed")
        exit(1)

if __name__ == "__main__":
    main()
