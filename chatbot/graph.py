"""LangGraph definition for the chatbot."""

import logging
from typing import Dict, Any
from langgraph.graph import StateGraph, END

from .config import ChatbotConfig
from .nodes import NodeHandler

logger = logging.getLogger(__name__)


class ChatbotGraph:
    """LangGraph-based chatbot for SQL query generation."""
    
    def __init__(self, config: ChatbotConfig):
        """
        Initialize chatbot graph.
        
        Args:
            config: ChatbotConfig instance
        """
        self.config = config
        self.config.validate()
        self.handler = NodeHandler(config)
        self.graph = self._build_graph()
    
    def _build_graph(self) -> StateGraph:
        """Build and compile the LangGraph - simplified version."""
        builder = StateGraph(dict)
        
        # Simple flow: interpret -> query -> format -> update_memory
        builder.add_node("interpret", self.handler.interpret_question)
        builder.add_node("query", self.handler.run_query)
        builder.add_node("format", self.handler.format_response)
        builder.add_node("update_memory", self.handler.update_memory)
        
        # Simple linear flow
        builder.set_entry_point("interpret")
        builder.add_edge("interpret", "query")
        builder.add_edge("query", "format")
        builder.add_edge("format", "update_memory")
        builder.add_edge("update_memory", END)
        
        return builder.compile()
    
    def invoke(self, question: str, **kwargs) -> Dict[str, Any]:
        """
        Invoke the graph with a question.
        
        Args:
            question: User question
            **kwargs: Additional state values (can include 'history' for conversation history)
        
        Returns:
            Dict with keys:
                - final_answer: str - The formatted answer
                - history: list - Updated conversation history
                - sql: str (optional) - Generated SQL query
                - error: str (optional) - Error message if any
                - question: str - The original question
        """
        initial_state = {
            "question": question,
            "schema": self.config.schema,
            "company_id": self.config.company_id,
            "history": kwargs.get("history", []),  # Initialize history if not provided
            **{k: v for k, v in kwargs.items() if k != "history"}  # Other kwargs
        }
        
        logger.info(f"Invoking graph with question: {question[:50]}...")
        result = self.graph.invoke(initial_state)
        logger.info("Graph execution completed")
        
        # Ensure consistent return format for UI
        return {
            "final_answer": result.get("final_answer", ""),
            "history": result.get("history", []),
            "sql": result.get("sql"),
            "error": result.get("error"),
            "question": result.get("question", question),
            "success": result.get("error") is None
        }

