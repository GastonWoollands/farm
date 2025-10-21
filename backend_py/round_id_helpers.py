#!/usr/bin/env python3
"""
Helper functions for insemination round ID generation
"""

import datetime
from typing import Union

def generate_round_id(date_input: Union[str, datetime.date, datetime.datetime]) -> str:
    """
    Generate insemination round ID from date in YYYYMM format
    
    Args:
        date_input: Date in various formats (string, date, datetime)
        
    Returns:
        Round ID in YYYYMM format (e.g., "202408", "202510")
        
    Examples:
        >>> generate_round_id("2024-08-15")
        "202408"
        >>> generate_round_id("2025-01-03")
        "202501"
        >>> generate_round_id(datetime.date(2024, 12, 25))
        "202412"
    """
    if isinstance(date_input, str):
        # Parse string date
        try:
            # Try ISO format first
            parsed_date = datetime.datetime.fromisoformat(date_input.replace('Z', '+00:00'))
        except ValueError:
            # Try other common formats
            formats = [
                "%Y-%m-%d",      # 2024-01-15
                "%d/%m/%Y",       # 15/01/2024
                "%m/%d/%Y",       # 01/15/2024
                "%d-%m-%Y",       # 15-01-2024
                "%Y-%m-%d %H:%M:%S",  # 2024-01-15 10:30:00
            ]
            
            for fmt in formats:
                try:
                    parsed_date = datetime.datetime.strptime(date_input.strip(), fmt)
                    break
                except ValueError:
                    continue
            else:
                raise ValueError(f"Could not parse date: {date_input}")
    elif isinstance(date_input, datetime.date):
        parsed_date = datetime.datetime.combine(date_input, datetime.time())
    elif isinstance(date_input, datetime.datetime):
        parsed_date = date_input
    else:
        raise ValueError(f"Invalid date type: {type(date_input)}")
    
    return parsed_date.strftime("%Y%m")

def get_current_round_id() -> str:
    """
    Get the current round ID based on today's date
    
    Returns:
        Current round ID in YYYYMM format
    """
    return datetime.datetime.now().strftime("%Y%m")

def parse_round_id(round_id: str) -> tuple[int, int]:
    """
    Parse round ID to get year and month
    
    Args:
        round_id: Round ID in YYYYMM format
        
    Returns:
        Tuple of (year, month)
        
    Examples:
        >>> parse_round_id("202408")
        (2024, 8)
        >>> parse_round_id("202501")
        (2025, 1)
    """
    if len(round_id) != 6 or not round_id.isdigit():
        raise ValueError(f"Invalid round ID format: {round_id}. Expected YYYYMM format.")
    
    year = int(round_id[:4])
    month = int(round_id[4:6])
    
    if month < 1 or month > 12:
        raise ValueError(f"Invalid month in round ID: {round_id}")
    
    return year, month

def get_round_display_name(round_id: str) -> str:
    """
    Get a human-readable display name for the round ID
    
    Args:
        round_id: Round ID in YYYYMM format
        
    Returns:
        Human-readable name (e.g., "August 2024", "January 2025")
        
    Examples:
        >>> get_round_display_name("202408")
        "August 2024"
        >>> get_round_display_name("202501")
        "January 2025"
    """
    year, month = parse_round_id(round_id)
    month_names = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
    ]
    return f"{month_names[month-1]} {year}"

if __name__ == "__main__":
    # Test the functions
    print("🧪 Testing Round ID Functions")
    print("=" * 40)
    
    test_dates = [
        "2024-08-15",
        "2025-01-03", 
        "2024-12-25",
        datetime.date(2024, 6, 10),
        datetime.datetime(2024, 3, 15, 14, 30)
    ]
    
    for date in test_dates:
        round_id = generate_round_id(date)
        display_name = get_round_display_name(round_id)
        year, month = parse_round_id(round_id)
        print(f"📅 {date} → {round_id} → {display_name} ({year}-{month:02d})")
    
    print(f"\n📊 Current Round ID: {get_current_round_id()}")
    print(f"📊 Current Display: {get_round_display_name(get_current_round_id())}")
