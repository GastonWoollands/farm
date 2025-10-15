import os
from pathlib import Path

# Configuration via environment variables with sensible defaults
PORT = int(os.getenv("PORT", "8000"))
DB_PATH = "/data/farm.db"
VALID_KEYS = [k.strip() for k in os.getenv("VALID_KEYS", "").split(",") if k.strip()]
ADMIN_SECRET = os.getenv("ADMIN_SECRET", "")


