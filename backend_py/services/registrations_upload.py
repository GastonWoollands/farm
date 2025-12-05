"""
Registration (birth) file upload service
Handles CSV/XLSX file parsing, validation, and bulk insertion with company_id from file
"""

import sqlite3
import pandas as pd
import io
import re
import datetime as _dt
from typing import Dict, Optional
from fastapi import HTTPException, UploadFile
from ..db import conn
from .registrations import _normalize_text, VALID_GENDERS, VALID_STATUSES, VALID_COLORS
from .inseminations import _validate_date


def clean_mother_id(mother_id: str) -> str:
    """
    Remove parenthetical content from mother ID
    Example: "AC988C234(2383)" -> "AC988C234"
    """
    if not mother_id or pd.isna(mother_id):
        return None
    # Remove parentheses and content inside them
    cleaned = re.sub(r'\([^)]*\)', '', str(mother_id)).strip()
    return cleaned if cleaned else None


def replace_nd_value(value) -> Optional[str]:
    """
    Replace "#N/D" with None, otherwise return the value as string
    """
    if pd.isna(value):
        return None
    str_value = str(value).strip()
    if str_value == '#N/D' or str_value.upper() == '#N/D':
        return None
    return str_value if str_value else None


def parse_birth_date(date_value, year: int = 2024) -> Optional[str]:
    """
    Parse birth date handling Spanish month abbreviations and normalize to specified year
    
    Args:
        date_value: Date value in various formats (string, datetime, numeric)
        year: Target year to normalize dates to (default: 2024)
    
    Returns:
        Date string in YYYY-MM-DD format normalized to the specified year
    
    Supports:
    - Spanish month abbreviations: "27-ago" -> "27/08/{year}"
    - Datetime objects: normalize year to specified year
    - Standard date formats: validate and normalize to specified year
    - Excel serial numbers: convert and normalize to specified year
    """
    if pd.isna(date_value):
        return None
    
    # Validate year is reasonable
    if not (1900 <= year <= 2100):
        raise ValueError(f"Year must be between 1900 and 2100, got: {year}")
    
    # Spanish month abbreviations mapping
    spanish_months = {
        'ene': 1, 'feb': 2, 'mar': 3, 'abr': 4, 'may': 5, 'jun': 6,
        'jul': 7, 'ago': 8, 'sep': 9, 'oct': 10, 'nov': 11, 'dic': 12
    }
    
    # Handle datetime objects
    if isinstance(date_value, pd.Timestamp):
        # Normalize year to specified year
        date_value = date_value.replace(year=year)
        return date_value.strftime("%Y-%m-%d")
    elif isinstance(date_value, _dt.datetime):
        # Normalize year to specified year
        date_value = date_value.replace(year=year)
        return date_value.strftime("%Y-%m-%d")
    
    # Handle string dates
    if isinstance(date_value, str):
        date_str = date_value.strip()
        
        # Try to parse Spanish month abbreviation format: "DD-mmm"
        # Example: "27-ago" -> "27/08/{year}"
        spanish_pattern = r'^(\d{1,2})-([a-z]{3})$'
        match = re.match(spanish_pattern, date_str.lower())
        if match:
            day = int(match.group(1))
            month_abbr = match.group(2)
            if month_abbr in spanish_months:
                month = spanish_months[month_abbr]
                # Format as DD/MM/{year} and validate
                formatted_date = f"{day:02d}/{month:02d}/{year}"
                try:
                    return _validate_date(formatted_date)
                except Exception as e:
                    raise ValueError(f"Invalid date format after parsing Spanish month: {formatted_date} - {str(e)}")
        
        # Try to parse as standard date format
        try:
            parsed_date = _validate_date(date_str)
            # If year is not the target year, replace it
            dt = _dt.datetime.strptime(parsed_date, "%Y-%m-%d")
            if dt.year != year:
                dt = dt.replace(year=year)
                return dt.strftime("%Y-%m-%d")
            return parsed_date
        except Exception:
            # If standard parsing fails, try to extract date parts
            pass
    
    # Handle numeric dates (Excel serial numbers)
    if isinstance(date_value, (int, float)):
        try:
            dt = pd.to_datetime(date_value, origin='1899-12-30', unit='D')
            dt = dt.replace(year=year)
            return dt.strftime("%Y-%m-%d")
        except Exception:
            pass
    
    raise ValueError(f"Could not parse date: {date_value}")


def find_column(df: pd.DataFrame, column_keywords: list[str], require_id: bool = False) -> Optional[str]:
    """
    Find column in dataframe by keywords (case-insensitive, partial match)
    Returns column name or None if not found
    """
    df_columns = [str(col).strip().upper() for col in df.columns]
    column_keywords = [kw.strip().upper() for kw in column_keywords]
    
    for col in df.columns:
        col_upper = str(col).strip().upper()
        for keyword in column_keywords:
            if keyword in col_upper or col_upper in keyword:
                return str(col)
    
    if require_id:
        raise HTTPException(
            status_code=400,
            detail=f"Required column not found. Looking for: {', '.join(column_keywords)}. Available columns: {', '.join(df.columns)}"
        )
    
    return None


async def parse_birth_file(file: UploadFile) -> pd.DataFrame:
    """
    Parse CSV or XLSX file and return normalized dataframe
    Returns: dataframe with mapped columns
    """
    # Read file content
    content = await file.read()
    
    # Determine file type
    filename = file.filename.lower() if file.filename else ""
    if filename.endswith('.csv'):
        df = pd.read_csv(io.BytesIO(content), parse_dates=False, keep_default_na=False)
    elif filename.endswith(('.xlsx', '.xls')):
        df = pd.read_excel(io.BytesIO(content), parse_dates=False, keep_default_na=False)
    else:
        raise HTTPException(status_code=400, detail="File must be CSV or XLSX format")
    
    if df.empty:
        raise HTTPException(status_code=400, detail="File is empty")
    
    return df


async def upload_registrations_from_file(
    file: UploadFile,
    created_by: str = "admin_upload",
    year: int = 2024
) -> Dict[str, any]:
    """
    Upload registrations from CSV/XLSX file with company_id from file
    
    Args:
        file: Uploaded CSV or XLSX file
        created_by: User ID for created_by field (default: "admin_upload")
        year: Year to use for date normalization (default: 2024)
    
    Returns:
        Dict with uploaded count, skipped count, and errors
    """
    # Parse file
    try:
        df = await parse_birth_file(file)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error parsing file: {str(e)}")
    
    # Find columns
    animal_number_col = find_column(df, ["idv ternero", "animal_number", "animal number"], require_id=True)
    fecha_col = find_column(df, ["fecha nacimiento", "born_date", "born date", "fecha"], require_id=False)
    mother_id_col = find_column(df, ["idv madre", "mother_id", "mother id"], require_id=False)
    rp_mother_col = find_column(df, ["rp_madre", "rp_mother", "rp mother"], require_id=False)
    weight_col = find_column(df, ["peso nacim", "weight", "peso"], require_id=False)
    gender_col = find_column(df, ["sexo", "gender", "sex"], require_id=False)
    color_col = find_column(df, ["color"], require_id=False)
    father_id_col = find_column(df, ["padre", "father_id", "father id"], require_id=False)
    weaning_weight_col = find_column(df, ["peso destete", "weaning_weight", "weaning weight"], require_id=False)
    notes_col = find_column(df, ["notas", "notes", "note"], require_id=False)
    company_id_col = find_column(df, ["company_id", "company id", "company"], require_id=True)
    
    # Validate company_id column exists
    if not company_id_col:
        raise HTTPException(status_code=400, detail="company_id column is required in the file")
    
    # Process rows
    uploaded_count = 0
    skipped_count = 0
    errors = []
    warnings = []
    
    # Cache for company_id validation
    validated_company_ids = {}
    
    try:
        with conn:
            for index, row in df.iterrows():
                try:
                    # Extract company_id
                    company_id_raw = row[company_id_col] if company_id_col in row else None
                    if pd.isna(company_id_raw):
                        skipped_count += 1
                        errors.append(f"Row {index + 2}: Missing company_id")
                        continue
                    
                    try:
                        company_id = int(float(company_id_raw))  # Handle float company_ids
                    except (ValueError, TypeError):
                        skipped_count += 1
                        errors.append(f"Row {index + 2}: Invalid company_id format: {company_id_raw}")
                        continue
                    
                    # Validate company_id exists (use cache)
                    if company_id not in validated_company_ids:
                        cursor = conn.execute(
                            "SELECT id FROM companies WHERE id = ? AND is_active = 1",
                            (company_id,)
                        )
                        if not cursor.fetchone():
                            skipped_count += 1
                            errors.append(f"Row {index + 2}: Company ID {company_id} does not exist or is inactive")
                            continue
                        validated_company_ids[company_id] = True
                    
                    # Extract and clean animal_number (required)
                    animal_number_raw = row[animal_number_col] if animal_number_col in row else None
                    if pd.isna(animal_number_raw):
                        skipped_count += 1
                        errors.append(f"Row {index + 2}: Missing animal_number (IDV TERNERO)")
                        continue
                    
                    animal_number = _normalize_text(replace_nd_value(animal_number_raw))
                    if not animal_number:
                        skipped_count += 1
                        errors.append(f"Row {index + 2}: Invalid animal_number")
                        continue
                    
                    # Extract and clean mother_id
                    mother_id_raw = row[mother_id_col] if mother_id_col and mother_id_col in row else None
                    mother_id = None
                    if mother_id_raw is not None and not pd.isna(mother_id_raw):
                        mother_id_cleaned = clean_mother_id(str(mother_id_raw))
                        mother_id = _normalize_text(replace_nd_value(mother_id_cleaned))
                    
                    # Extract father_id
                    father_id_raw = row[father_id_col] if father_id_col and father_id_col in row else None
                    father_id = None
                    if father_id_raw is not None and not pd.isna(father_id_raw):
                        father_id = _normalize_text(replace_nd_value(father_id_raw))
                    
                    # Parse birth_date
                    born_date = None
                    if fecha_col and fecha_col in row and not pd.isna(row[fecha_col]):
                        try:
                            born_date = parse_birth_date(row[fecha_col], year=year)
                        except Exception as e:
                            skipped_count += 1
                            errors.append(f"Row {index + 2}: Invalid date format - {str(e)}")
                            continue
                    
                    # Extract weight
                    weight = None
                    if weight_col and weight_col in row and not pd.isna(row[weight_col]):
                        weight_raw = replace_nd_value(row[weight_col])
                        if weight_raw is not None and weight_raw.strip():
                            try:
                                weight_val = float(weight_raw)
                                if not (0 <= weight_val <= 10000):
                                    skipped_count += 1
                                    errors.append(f"Row {index + 2}: Weight must be between 0 and 10000 kg")
                                    continue
                                weight = weight_val
                            except (ValueError, TypeError):
                                # If it's not a valid number, just set to None (don't error)
                                weight = None
                    
                    # Extract weaning_weight
                    weaning_weight = None
                    if weaning_weight_col and weaning_weight_col in row and not pd.isna(row[weaning_weight_col]):
                        weaning_weight_raw = replace_nd_value(row[weaning_weight_col])
                        if weaning_weight_raw is not None and weaning_weight_raw.strip():
                            try:
                                weaning_weight_val = float(weaning_weight_raw)
                                if not (0 <= weaning_weight_val <= 10000):
                                    skipped_count += 1
                                    errors.append(f"Row {index + 2}: Weaning weight must be between 0 and 10000 kg")
                                    continue
                                weaning_weight = weaning_weight_val
                            except (ValueError, TypeError):
                                # If it's not a valid number, just set to None (don't error)
                                weaning_weight = None
                    
                    # Extract and normalize gender
                    gender = None
                    if gender_col and gender_col in row and not pd.isna(row[gender_col]):
                        gender_raw = str(row[gender_col]).strip().upper()
                        if gender_raw == 'HEMBRA':
                            gender = 'FEMALE'
                        elif gender_raw == 'MACHO':
                            gender = 'MALE'
                        elif gender_raw in VALID_GENDERS:
                            gender = gender_raw
                        else:
                            gender = 'UNKNOWN'
                    
                    # Determine animal_type based on gender
                    animal_type = None
                    if gender == 'FEMALE':
                        animal_type = 1  # Cow
                    elif gender == 'MALE':
                        animal_type = 2  # Bull
                    
                    # Extract and normalize status (default to ALIVE)
                    status = 'ALIVE'
                    
                    # Extract and normalize color
                    color = None
                    if color_col and color_col in row and not pd.isna(row[color_col]):
                        color_raw = _normalize_text(replace_nd_value(row[color_col]))
                        if color_raw and color_raw in VALID_COLORS:
                            color = color_raw
                    
                    # Extract rp_mother
                    rp_mother = None
                    if rp_mother_col and rp_mother_col in row and not pd.isna(row[rp_mother_col]):
                        rp_mother = _normalize_text(replace_nd_value(row[rp_mother_col]))
                    
                    # Extract notes
                    notes = None
                    if notes_col and notes_col in row and not pd.isna(row[notes_col]):
                        notes = _normalize_text(replace_nd_value(row[notes_col]))
                    
                    # Validate gender
                    if gender and gender not in VALID_GENDERS:
                        skipped_count += 1
                        errors.append(f"Row {index + 2}: Invalid gender. Must be one of: {', '.join(VALID_GENDERS)}")
                        continue
                    
                    # Validate color
                    if color and color not in VALID_COLORS:
                        skipped_count += 1
                        errors.append(f"Row {index + 2}: Invalid color. Must be one of: {', '.join(VALID_COLORS)}")
                        continue
                    
                    # Check for duplicates (per company_id)
                    cursor = conn.execute(
                        """
                        SELECT id FROM registrations 
                        WHERE animal_number = ? AND company_id = ?
                        AND (mother_id = ? OR (mother_id IS NULL AND ? IS NULL))
                        AND (father_id = ? OR (father_id IS NULL AND ? IS NULL))
                        """,
                        (animal_number, company_id, mother_id, mother_id, father_id, father_id)
                    )
                    if cursor.fetchone():
                        skipped_count += 1
                        errors.append(f"Row {index + 2}: Duplicate registration - {animal_number} already exists for this company")
                        continue
                    
                    # Insert registration
                    created_at = _dt.datetime.utcnow().isoformat()
                    
                    cursor = conn.execute(
                        """
                        INSERT INTO registrations (
                            animal_number, created_at, user_key, created_by, company_id,
                            mother_id, father_id, born_date, weight, gender, animal_type, status, color, notes,
                            short_id, rp_mother, weaning_weight
                        )
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, substr(replace(hex(randomblob(16)), 'E', ''), 1, 10), ?, ?)
                        """,
                        (
                            animal_number,
                            created_at,
                            None,  # legacy user_key deprecated
                            created_by,
                            company_id,
                            mother_id,
                            father_id,
                            born_date,
                            weight,
                            gender,
                            animal_type,
                            status,
                            color,
                            notes,
                            rp_mother,
                            weaning_weight,
                        ),
                    )
                    uploaded_count += 1
                    
                except sqlite3.IntegrityError as e:
                    if "UNIQUE constraint failed" in str(e):
                        skipped_count += 1
                        errors.append(f"Row {index + 2}: Duplicate registration (database constraint)")
                    else:
                        skipped_count += 1
                        errors.append(f"Row {index + 2}: Database error - {str(e)}")
                except Exception as e:
                    skipped_count += 1
                    errors.append(f"Row {index + 2}: Error - {str(e)}")
                    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing file: {str(e)}")
    
    return {
        "ok": True,
        "uploaded": uploaded_count,
        "skipped": skipped_count,
        "errors": errors[:50],  # Limit errors to first 50
        "warnings": warnings,
        "total_rows": len(df)
    }
