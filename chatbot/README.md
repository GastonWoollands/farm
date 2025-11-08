# Chatbot Module

A modular LangGraph-based chatbot that answers user questions about data stored in a SQLite database using natural language.

## Architecture

The chatbot uses a graph-based workflow with the following nodes:

1. **initial** - Validates user input (not empty, not malicious)
2. **validate_user_question** - Determines if the question requires SQL or is a general conversation
3. **interpret_question** - Generates SQL query from natural language using Gemini LLM
4. **check_query** - Validates SQL query (must be SELECT, must include company_id filter)
5. **run_query** - Executes SQL query against SQLite database
6. **format_response** - Formats results into user-friendly response

## Flow

```
initial → validate_user_question → [SQL needed?]
                                    ├─ YES → interpret_question → check_query → run_query → format_response
                                    └─ NO  → format_response
```

## Usage

```python
from chatbot.config import ChatbotConfig
from chatbot.graph import ChatbotGraph

# Initialize configuration
config = ChatbotConfig(
    company_id="2",  # Get from authenticated user
    llm_model="gemini-2.0-flash-exp"
)

# Create chatbot
chatbot = ChatbotGraph(config)

# Ask a question
result = chatbot.invoke("¿Cuántos registros hay en la tabla registrations?")
print(result["final_answer"])
```

## Configuration

Configuration can be set via:
- Constructor parameters
- Environment variables:
  - `DB_PATH` - Path to SQLite database
  - `SCHEMA_PATH` - Path to database schema JSON
  - `COMPANY_ID` - Company ID for multi-tenant filtering
  - `LLM_MODEL` - Gemini model name (default: gemini-2.0-flash-exp)

## Security

- All queries are validated to ensure they start with `SELECT`
- All queries must include `company_id` filter for multi-tenant isolation
- Dangerous keywords are filtered from user input
- SQL injection protection through parameter validation

## Dependencies

- `langchain-google-genai` - For Gemini LLM integration
- `langgraph` - For graph-based workflow
- `sqlite3` - For database access (built-in)

## Files

- `config.py` - Configuration management
- `nodes.py` - Node handler functions
- `graph.py` - LangGraph definition and compilation
- `main.py` - Example usage

