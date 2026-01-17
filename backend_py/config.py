import os
from pathlib import Path

# Configuration via environment variables with sensible defaults
PORT = int(os.getenv("PORT", "8000"))

# PostgreSQL configuration (required)
DATABASE_URL = os.getenv("DATABASE_URL", "")
if not DATABASE_URL:
    raise ValueError("DATABASE_URL environment variable is required for PostgreSQL connection")

DB_POOL_MIN_SIZE = int(os.getenv("DB_POOL_MIN_SIZE", "5"))
DB_POOL_MAX_SIZE = int(os.getenv("DB_POOL_MAX_SIZE", "20"))
DB_TIMEOUT = int(os.getenv("DB_TIMEOUT", "60"))  # Connection timeout in seconds

# Authentication and security
VALID_KEYS = [k.strip() for k in os.getenv("VALID_KEYS", "").split(",") if k.strip()]
ADMIN_SECRET = os.getenv("ADMIN_SECRET", "")
BACKUP_SECRET = os.getenv("BACKUP_SECRET", "")


