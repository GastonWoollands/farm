"""Configuration for the chatbot system."""

import os
import json
from pathlib import Path
from typing import Dict, Optional


class ChatbotConfig:
    """Configuration manager for the chatbot."""
    
    def __init__(
        self,
        db_path: Optional[str] = None,
        schema_path: Optional[str] = None,
        llm_model: str = "gemini-2.0-flash-exp",
        company_id: Optional[str] = None
    ):
        """
        Initialize configuration.
        
        Args:
            db_path: Path to SQLite database. Defaults to backend_py/data/farm.db
            schema_path: Path to database schema JSON. Defaults to database_schema.json
            llm_model: Gemini model name
            company_id: Company ID for multi-tenant filtering
        """
        self.llm_model = llm_model
        self.company_id = company_id or os.getenv("COMPANY_ID", "1")
        
        # Set default paths relative to project root
        project_root = Path(__file__).parent.parent
        self.db_path = db_path or os.getenv(
            "DB_PATH", 
            str(project_root / "backend_py" / "data" / "farm.db")
        )
        self.schema_path = schema_path or os.getenv(
            "SCHEMA_PATH",
            str(project_root / "database_schema.json")
        )
        
        self._schema: Optional[Dict] = None
    
    @property
    def schema(self) -> Dict:
        """Load and cache database schema."""
        if self._schema is None:
            with open(self.schema_path, "r", encoding="utf-8") as f:
                self._schema = json.load(f)
        return self._schema
    
    def validate(self) -> bool:
        """Validate configuration."""
        if not Path(self.db_path).exists():
            raise FileNotFoundError(f"Database not found: {self.db_path}")
        if not Path(self.schema_path).exists():
            raise FileNotFoundError(f"Schema not found: {self.schema_path}")
        return True

