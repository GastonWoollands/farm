"""
Insemination file upload service
Handles CSV/XLSX file parsing, validation, and bulk insertion with strict company_id enforcement
"""

import sqlite3
import pandas as pd
import io
from typing import List, Dict, Tuple, Optional
from fastapi import HTTPException, UploadFile
from ..db import conn
from ..models import InseminationBody
from .inseminations import _normalize_text, _validate_date


def find_column(df: pd.DataFrame, column_keywords: List[str], require_id: bool = False, verbose: bool = True) -> Optional[str]:
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


def drop_repaso_duplicates(df: pd.DataFrame, id_cols: List[str], toro_col: str, verbose: bool = True) -> pd.DataFrame:
    """
    Remove duplicate rows based on ID columns, keeping the last occurrence
    """
    if not id_cols or not all(col in df.columns for col in id_cols if col):
        return df
    
    # Filter out rows with all ID columns as NaN
    valid_id_cols = [col for col in id_cols if col and col in df.columns]
    if not valid_id_cols:
        return df
    
    # Remove duplicates, keeping last
    df_clean = df.drop_duplicates(subset=valid_id_cols, keep='last')
    
    if verbose:
        removed = len(df) - len(df_clean)
        if removed > 0:
            print(f"Removed {removed} duplicate rows")
    
    return df_clean


async def parse_insemination_file(file: UploadFile, insemination_round_id: str) -> Tuple[pd.DataFrame, Dict[str, str]]:
    """
    Parse CSV or XLSX file and return normalized dataframe with column mappings
    Returns: (dataframe, column_mapping)
    """
    # Read file content
    content = await file.read()
    
    # Determine file type
    # Read files without auto-parsing dates to preserve dd/mm/yyyy format
    # This prevents pandas from misinterpreting dates as mm/dd/yyyy
    filename = file.filename.lower() if file.filename else ""
    if filename.endswith('.csv'):
        # Read CSV without auto-parsing dates - preserve original format
        df = pd.read_csv(io.BytesIO(content), parse_dates=False, keep_default_na=False)
    elif filename.endswith(('.xlsx', '.xls')):
        # For Excel files, read without auto-parsing dates to preserve dd/mm/yyyy format
        df = pd.read_excel(io.BytesIO(content), parse_dates=False, keep_default_na=False)
    else:
        raise HTTPException(status_code=400, detail="File must be CSV or XLSX format")
    
    if df.empty:
        raise HTTPException(status_code=400, detail="File is empty")
    
    # Find required columns
    idv_col = find_column(df, ["idv", "idv vaca", "idv vaquillona", "mother_id", "mother id"], require_id=True)
    ide_col = find_column(df, ["ide", "ide vaca", "ide vaquillona", "mother_visual_id", "mother visual id"], require_id=False)
    bull_col = find_column(df, ["toro", "bull", "bull_id", "bull id", "father", "father_id", "father id"], require_id=True)
    date_col = find_column(df, ["date", "insemination_date", "insemination date", "fecha", "fecha inseminacion"], require_id=False)
    
    column_mapping = {
        "idv": idv_col,
        "ide": ide_col,
        "bull": bull_col,
        "date": date_col
    }
    
    # Validate required columns are found
    if not idv_col:
        raise HTTPException(status_code=400, detail="IDV column not found. Required columns: IDV, Bull name")
    if not bull_col:
        raise HTTPException(status_code=400, detail="Bull name column not found. Required columns: IDV, Bull name")
    
    # Select and rename columns
    selected_cols = [idv_col, bull_col]
    new_names = ["idv", "bull"]
    
    if ide_col:
        selected_cols.append(ide_col)
        new_names.append("ide")
    
    if date_col:
        selected_cols.append(date_col)
        new_names.append("date")
    
    df_selected = df[selected_cols].copy()
    df_selected.columns = new_names
    
    # Remove rows with missing required data
    df_selected = df_selected[df_selected['idv'].notna()].copy()
    df_selected = df_selected[df_selected['bull'].notna()].copy()
    
    if df_selected.empty:
        raise HTTPException(status_code=400, detail="No valid rows found after filtering missing data")
    
    # Remove duplicates based on IDV
    df_selected = drop_repaso_duplicates(df_selected, id_cols=["idv"], toro_col="bull", verbose=False)
    
    return df_selected, column_mapping


async def upload_inseminations_from_file(
    file: UploadFile,
    insemination_round_id: str,
    created_by: str,
    company_id: int,
    initial_date: Optional[str] = None,
    end_date: Optional[str] = None
) -> Dict[str, any]:
    """
    Upload inseminations from CSV/XLSX file with strict company_id enforcement
    
    Args:
        file: Uploaded CSV or XLSX file
        insemination_round_id: Round ID for all inseminations
        created_by: User ID (firebase_uid)
        company_id: Company ID (MUST be provided, cannot be None)
        initial_date: Optional start date for round update
        end_date: Optional end date for round update
    
    Returns:
        Dict with uploaded count, skipped count, and errors
    """
    # STRICT VALIDATION: company_id must be provided
    if company_id is None:
        raise HTTPException(
            status_code=400,
            detail="Company ID is required. Cannot upload inseminations without company association."
        )
    
    # Parse file
    try:
        df, column_mapping = await parse_insemination_file(file, insemination_round_id)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error parsing file: {str(e)}")
    
    # Normalize insemination_round_id
    insemination_round_id = _normalize_text(insemination_round_id) or insemination_round_id
    
    # STRICT VALIDATION: Round must exist for this company before upload
    # No auto-creation - user must explicitly create round first
    try:
        with conn:
            # Check if round exists for this company
            cursor = conn.execute(
                """
                SELECT id, initial_date, end_date 
                FROM inseminations_ids 
                WHERE insemination_round_id = ? AND company_id = ?
                """,
                (insemination_round_id, company_id)
            )
            round_data = cursor.fetchone()
            
            if not round_data:
                # Round doesn't exist - user must create it first
                raise HTTPException(
                    status_code=404,
                    detail=f"Insemination round '{insemination_round_id}' not found for your company. Please create the round first before uploading data."
                )
            
            # Round exists - get initial_date for default date
            round_id, existing_initial_date, existing_end_date = round_data
            default_insemination_date = existing_initial_date  # Use round's initial_date as default
            
            if initial_date or end_date:
                update_fields = []
                params = []
                
                if initial_date:
                    update_fields.append("initial_date = ?")
                    params.append(_validate_date(initial_date))
                    # Update default date if initial_date is provided
                    default_insemination_date = _validate_date(initial_date)
                
                if end_date:
                    update_fields.append("end_date = ?")
                    params.append(_validate_date(end_date))
                
                if update_fields:
                    params.append(insemination_round_id)
                    params.append(company_id)
                    
                    conn.execute(
                        f"""
                        UPDATE inseminations_ids 
                        SET {', '.join(update_fields)}, updated_at = datetime('now')
                        WHERE insemination_round_id = ? AND company_id = ?
                        """,
                        params
                    )
                
    except HTTPException:
        raise  # Re-raise HTTP exceptions
    except sqlite3.Error as e:
        raise HTTPException(status_code=500, detail=f"Database error validating round: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error validating round: {str(e)}")
    
    # Process rows
    uploaded_count = 0
    skipped_count = 0
    errors = []
    warnings = []
    using_default_date = False
    
    try:
        with conn:
            for index, row in df.iterrows():
                try:
                    # Extract and normalize data
                    mother_id = str(row['idv']).strip().upper() if pd.notna(row['idv']) else None
                    mother_visual_id = str(row['ide']).strip().upper() if 'ide' in row and pd.notna(row['ide']) else None
                    bull_id = str(row['bull']).strip().upper() if pd.notna(row['bull']) else None
                    
                    # Parse date - use default if not in file
                    if 'date' in row and pd.notna(row['date']):
                        date_value = row['date']
                        # Convert date to string format
                        # Handle pandas auto-parsed dates (which might be in mm/dd/yyyy format)
                        if isinstance(date_value, pd.Timestamp):
                            # Convert to dd/mm/yyyy format first, then let _validate_date handle it
                            # This ensures consistency with user-friendly format
                            insemination_date_str = date_value.strftime("%d/%m/%Y")
                        elif isinstance(date_value, str):
                            # Preserve original format (should be dd/mm/yyyy)
                            insemination_date_str = date_value.strip()
                        elif isinstance(date_value, (int, float)):
                            # Handle Excel date serial numbers if pandas auto-parsed them
                            # Convert to datetime and then to dd/mm/yyyy format
                            try:
                                dt = pd.to_datetime(date_value, origin='1899-12-30', unit='D')
                                insemination_date_str = dt.strftime("%d/%m/%Y")
                            except:
                                insemination_date_str = str(date_value).strip()
                        else:
                            # For other types, convert to string
                            insemination_date_str = str(date_value).strip()
                    else:
                        # Use round's initial_date as default
                        if default_insemination_date:
                            insemination_date_str = default_insemination_date
                            using_default_date = True
                        else:
                            skipped_count += 1
                            errors.append(f"Row {index + 1}: Missing date and no default date available")
                            continue
                    
                    # Validate required fields
                    if not mother_id:
                        skipped_count += 1
                        errors.append(f"Row {index + 1}: Missing IDV")
                        continue
                    
                    if not bull_id:
                        skipped_count += 1
                        errors.append(f"Row {index + 1}: Missing bull name")
                        continue
                    
                    # Validate date
                    try:
                        insemination_date = _validate_date(insemination_date_str)
                    except Exception as e:
                        skipped_count += 1
                        errors.append(f"Row {index + 1}: Invalid date format - {str(e)}")
                        continue
                    
                    # SIMPLE DUPLICATE CHECK: Key = (mother_id, insemination_date, company_id)
                    cursor = conn.execute(
                        """
                        SELECT id FROM inseminations 
                        WHERE mother_id = ? AND insemination_date = ? AND company_id = ?
                        """,
                        (mother_id, insemination_date, company_id)
                    )
                    if cursor.fetchone():
                        skipped_count += 1
                        errors.append(f"Row {index + 1}: Duplicate - {mother_id} on {insemination_date} already exists")
                        continue
                    
                    # Generate insemination identifier
                    insemination_identifier = f"INS-{mother_id}-{index + 1}"
                    
                    # Insert insemination with STRICT company_id enforcement
                    cursor = conn.execute(
                        """
                        INSERT INTO inseminations (
                            insemination_identifier, insemination_round_id, mother_id, mother_visual_id,
                            bull_id, insemination_date, animal_type, notes, created_by, company_id
                        )
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            insemination_identifier,
                            insemination_round_id,
                            mother_id,
                            mother_visual_id,
                            bull_id,
                            insemination_date,
                            None,  # animal_type - can be determined later if needed
                            None,  # notes
                            created_by,
                            company_id  # STRICTLY ENFORCED - must match authenticated user's company
                        )
                    )
                    uploaded_count += 1
                    
                except sqlite3.IntegrityError as e:
                    if "UNIQUE constraint failed" in str(e):
                        skipped_count += 1
                        errors.append(f"Row {index + 1}: Duplicate insemination (database constraint)")
                    else:
                        skipped_count += 1
                        errors.append(f"Row {index + 1}: Database error - {str(e)}")
                except Exception as e:
                    skipped_count += 1
                    errors.append(f"Row {index + 1}: Error - {str(e)}")
                    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing file: {str(e)}")
    
    # Add warning if default date was used
    if using_default_date and default_insemination_date:
        warnings.append(f"Using insemination round initial date ({default_insemination_date}) as default date for all records")
    
    return {
        "ok": True,
        "uploaded": uploaded_count,
        "skipped": skipped_count,
        "errors": errors[:50],  # Limit errors to first 50
        "warnings": warnings,
        "total_rows": len(df)
    }

