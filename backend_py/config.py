import os
from pathlib import Path

# Configuration via environment variables with sensible defaults
PORT = int(os.getenv("PORT", "8000"))

# Legacy SQLite configuration (for migration/fallback)
DB_PATH = os.getenv("DB_PATH", str(Path(__file__).parent / "data" / "farm.db"))

# PostgreSQL configuration
DATABASE_URL = os.getenv("DATABASE_URL", "")
DB_POOL_MIN_SIZE = int(os.getenv("DB_POOL_MIN_SIZE", "5"))
DB_POOL_MAX_SIZE = int(os.getenv("DB_POOL_MAX_SIZE", "20"))
DB_TIMEOUT = int(os.getenv("DB_TIMEOUT", "60"))  # Connection timeout in seconds

# Database type selection
USE_POSTGRES = bool(os.getenv("USE_POSTGRES", "true").lower() in ("true", "1", "yes"))

# Authentication and security
VALID_KEYS = [k.strip() for k in os.getenv("VALID_KEYS", "").split(",") if k.strip()]
ADMIN_SECRET = os.getenv("ADMIN_SECRET", "")
BACKUP_SECRET = os.getenv("BACKUP_SECRET", "")


