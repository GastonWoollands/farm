"""
Chatbot API routes for LLM-based SQL query generation
"""

from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import sys
from pathlib import Path

# Add project root to path for chatbot imports
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))

from backend_py.services.auth_service import authenticate_user

# Import chatbot modules from project root
try:
    from chatbot.config import ChatbotConfig
    from chatbot.graph import ChatbotGraph
except ImportError:
    # Fallback: try relative import from project root
    import os
    chatbot_path = os.path.join(project_root, 'chatbot')
    if os.path.exists(chatbot_path):
        sys.path.insert(0, str(project_root))
        from chatbot.config import ChatbotConfig
        from chatbot.graph import ChatbotGraph
    else:
        raise ImportError("Could not find chatbot module. Make sure chatbot/ directory exists in project root.")

router = APIRouter(prefix="/chatbot", tags=["chatbot"])


class ChatbotRequest(BaseModel):
    question: str
    history: Optional[List[Dict[str, str]]] = None


class ChatbotResponse(BaseModel):
    final_answer: str
    history: List[Dict[str, str]]
    sql: Optional[str] = None
    error: Optional[str] = None
    question: str
    success: bool


@router.post("/ask", response_model=ChatbotResponse)
async def ask_question(request: ChatbotRequest, http_request: Request):
    """
    Ask a question to the chatbot.
    
    The chatbot will:
    1. Generate SQL query from natural language
    2. Execute query filtered by user's company_id
    3. Return formatted answer
    4. Update conversation history
    """
    # Authenticate user and get company_id
    user, company_id = authenticate_user(http_request)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    # Get company_id from user context
    if company_id is None:
        # Try to get from user object
        company_id = user.get('company_id')
    
    if company_id is None:
        raise HTTPException(
            status_code=400,
            detail="Company ID is required. Please contact an administrator to assign you to a company."
        )
    
    try:
        # Initialize chatbot with company_id
        config = ChatbotConfig(
            company_id=str(company_id),
            llm_model="gemini-2.0-flash-exp"
        )
        chatbot = ChatbotGraph(config)
        
        # Invoke chatbot with question and history
        result = chatbot.invoke(
            question=request.question,
            history=request.history or []
        )
        
        # Format history as list of dicts with 'user' and 'bot' keys
        history = result.get("history", [])
        formatted_history = []
        for msg in history:
            if isinstance(msg, dict):
                formatted_history.append({
                    "user": msg.get("user", ""),
                    "bot": msg.get("bot", "")
                })
            else:
                # Handle legacy format if needed
                formatted_history.append(msg)
        
        return ChatbotResponse(
            final_answer=result.get("final_answer", ""),
            history=formatted_history,
            sql=result.get("sql"),
            error=result.get("error"),
            question=result.get("question", request.question),
            success=not result.get("error") and bool(result.get("final_answer"))
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error processing question: {str(e)}"
        )

