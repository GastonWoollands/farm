"""Node functions for the LangGraph chatbot."""

import sqlite3
import logging
from typing import Dict, Any
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.prompts import ChatPromptTemplate

logger = logging.getLogger(__name__)

# Maximum number of conversation history entries to keep
MAX_HISTORY = 5


class NodeHandler:
    """Handler for chatbot nodes."""
    
    def __init__(self, config):
        """Initialize with configuration."""
        self.config = config
        self.llm = ChatGoogleGenerativeAI(model=config.llm_model)
        self._init_prompts()
    
    def _init_prompts(self):
        """Initialize prompt templates."""
        self.sql_prompt = ChatPromptTemplate.from_template("""
Eres un asistente experto en SQL que genera consultas para una base de datos SQLite.

Tienes acceso a las siguientes tablas y columnas:
{schema}

El usuario actual pertenece a la compañía con ID: {company_id}.

**Reglas estrictas:**
1. **Todas las consultas deben incluir un filtro `WHERE company_id = {company_id}` o su equivalente en los `JOIN`.**
   - Si la tabla principal no tiene `company_id`, usa una tabla relacionada que sí lo tenga para filtrar correctamente.
   - Nunca devuelvas datos de otras compañías.
2. Usa únicamente los nombres de tablas y columnas que aparecen en el schema.
3. Si la pregunta es ambigua o no se puede filtrar por `company_id`, responde "NO_SQL".
4. Devuelve **solo una query SQL válida**, ejecutable en SQLite. Sin comentarios, sin Markdown, sin texto adicional.
5. Si la pregunta no requiere SQL, responde "NO_SQL".
6. Usa alias cortos (`u`, `r`, `c`, etc.) si es necesario, pero mantén la legibilidad.
7. Asegúrate de que la consulta final termine con un punto y coma `;`.
8. IMPORTANTE: LA QUERY SOLO PUEDE TENER SELECT, NO PERMITIDO DELETE, UPDATE, INSERT, ETC.

9. EXTREMA IMPORTANCIA: SOLO CREA UNA QUERY SQL FILTRADA POR company_id!!!

10. **CONTEXTO DE CONVERSACIÓN**: Si hay historial de conversación, úsalo para entender referencias como "esas madres", "ellos", "esos registros", etc.
    - Si la pregunta hace referencia a resultados anteriores, usa esos valores en la consulta SQL.
    - Por ejemplo, si la pregunta anterior devolvió IDs como "MOTHER-002", "AC988", usa esos valores en un filtro WHERE o IN.

**CONTEXTO CRÍTICO DE LA BASE DE DATOS:**

**Tabla `registrations` (Registros de animales):**
- Esta tabla contiene los TERNEROS/ANIMALES RECIÉN NACIDOS o REGISTRADOS, NO las madres adultas.
- `animal_number`: Es el ID del animal REGISTRADO (el ternero/recién nacido). Ejemplo: "COW-002" es un ternero registrado.
- `mother_id`: Es el ID de la MADRE (la vaca adulta que parió). Ejemplo: "MOTHER-002" es la madre.
- `father_id` o `bull_id`: Es el ID del TORO/PADRE (el semental).
- `born_date`: Fecha de nacimiento del ternero.
- `weight`: Peso del TERNERO registrado (NO el peso de la madre).
- `mother_weight`: Peso de la MADRE (si está disponible).
- `gender`: Género del ternero (MALE/FEMALE/UNKNOWN).
- `status`: Estado del ternero (ALIVE/DEAD).

**Tabla `inseminations` (Inseminaciones):**
- Contiene registros de inseminaciones realizadas a las MADRES (vacas adultas).
- `mother_id`: ID de la madre inseminada.
- `bull_id`: ID del toro usado para la inseminación.
- `insemination_date`: Fecha de la inseminación.
- `insemination_round_id`: ID de la ronda de inseminación.

**Tabla `inseminations_ids` (Rondas de inseminación):**
- Agrupa inseminaciones por ronda.
- `insemination_round_id`: ID de la ronda.
- `initial_date` y `end_date`: Fechas de la ronda.

**RELACIONES IMPORTANTES:**
- Un ternero (`registrations.animal_number`) tiene una madre (`registrations.mother_id`).
- Una madre puede tener múltiples terneros (múltiples registros con el mismo `mother_id`).
- Las inseminaciones se registran en la tabla `inseminations` con `mother_id`.
- Los terneros nacen aproximadamente 300 días después de la inseminación.

**CUANDO EL USUARIO PREGUNTA SOBRE "MADRES":**
- Si pregunta "madres con mayor peso", usa `mother_weight` (peso de la madre) o agrupa por `mother_id` y usa funciones de agregación.
- NO confundas `animal_number` (el ternero) con `mother_id` (la madre).
- NO confundas `weight` (peso del ternero) con `mother_weight` (peso de la madre).
- Para identificar madres, usa `mother_id` como identificador principal.
- Para encontrar madres, agrupa por `mother_id` o busca registros donde el animal es una madre (puede requerir JOIN o subconsultas).

**CUANDO EL USUARIO PREGUNTA SOBRE "TERNEROS":**
- Busca en `registrations` usando `animal_number` o filtros por `born_date`, `weight`, etc.
- Los terneros están relacionados con sus madres a través de `mother_id`.

**CUANDO EL USUARIO PREGUNTA SOBRE "INSEMINACIONES":**
- Busca en la tabla `inseminations`.
- Usa `mother_id` para identificar la madre inseminada.
- Usa `insemination_round_id` para agrupar por ronda.

{history_context}

**Ejemplos:**

Usuario: "¿Cuántos registros hay en la tabla registrations?"
SQL: SELECT COUNT(*) FROM registrations WHERE company_id = {company_id};

Usuario: "¿Cuál es el evento más reciente?"
SQL: SELECT * FROM events_state WHERE company_id = {company_id} ORDER BY created_at DESC LIMIT 1;

Usuario: "Dame los terneros de las madres MOTHER-002 y AC988"
SQL: SELECT * FROM registrations WHERE company_id = {company_id} AND mother_id IN ('MOTHER-002', 'AC988');

Pregunta actual: {question}
SQL:
""")
        
        self.validation_prompt = ChatPromptTemplate.from_template("""
Eres un asistente que determina si una pregunta del usuario requiere una consulta SQL a la base de datos.

Schema disponible:
{schema}

Pregunta del usuario: {question}

Responde SOLO con "YES" si la pregunta requiere datos de la base de datos (tablas, conteos, filtros, etc.).
Responde SOLO con "NO" si la pregunta es:
- Un saludo o conversación general
- No relacionada con datos de la base de datos
- Una pregunta sobre cómo usar el sistema
- Una pregunta que no puede responderse con SQL

Respuesta (YES o NO):
""")
    
    def initial(self, state: Dict[str, Any]) -> Dict[str, Any]:
        """Validate user input."""
        question = state.get("question", "").strip()
        
        if not question:
            logger.warning("Empty question received")
            return {"error": "La pregunta está vacía.", "question": ""}
        
        # Security checks
        dangerous_keywords = ["drop", "delete", "update", "insert", "alter", "truncate"]
        if any(keyword in question.lower() for keyword in dangerous_keywords):
            logger.warning(f"Potentially dangerous question: {question}")
            return {"error": "Pregunta inválida o potencialmente peligrosa.", "question": question}
        
        logger.info(f"Question validated: {question[:50]}...")
        return {"question": question}
    
    def validate_user_question(self, state: Dict[str, Any]) -> Dict[str, Any]:
        """Check if question requires SQL."""
        question = state.get("question", "")
        if not question:
            return {"is_sql_needed": False, "error": "No hay pregunta para validar."}
        
        try:
            prompt = self.validation_prompt.format(
                schema=self.config.schema,
                question=question
            )
            response = self.llm.invoke(prompt)
            answer = response.content.strip().upper()
            
            is_sql_needed = answer == "YES"
            
            if not is_sql_needed:
                logger.info("Question does not require SQL")
                return {
                    "is_sql_needed": False,
                    "non_sql_response": "Lo siento, solo puedo responder preguntas sobre los datos de la base de datos. ¿Hay algo específico que te gustaría consultar?"
                }
            
            logger.info("Question requires SQL")
            return {"is_sql_needed": True}
            
        except Exception as e:
            logger.error(f"Error validating question: {e}")
            return {"is_sql_needed": False, "error": f"Error validando pregunta: {str(e)}"}
    
    def _extract_sql(self, text: str) -> str:
        """Extract SQL query from LLM response."""
        text = text.strip()
        
        # Check for NO_SQL response - this is a valid response for non-SQL questions
        if "NO_SQL" in text.upper() or "no sql" in text.lower():
            return "NO_SQL"  # Return special marker instead of None
        
        # Remove markdown code blocks
        if "```" in text:
            # Find code block
            start_idx = text.find("```")
            end_idx = text.find("```", start_idx + 3)
            if end_idx != -1:
                code_block = text[start_idx + 3:end_idx].strip()
                # Remove language identifier (sql, python, etc.)
                if code_block.startswith("sql"):
                    code_block = code_block[3:].strip()
                elif code_block.startswith("SQL"):
                    code_block = code_block[3:].strip()
                text = code_block
        
        # Find first SELECT statement
        text_lower = text.lower()
        select_idx = text_lower.find("select")
        if select_idx == -1:
            return None
        
        # Extract from SELECT to end or next markdown block
        sql = text[select_idx:]
        
        # Remove trailing markdown or comments
        lines = sql.split("\n")
        cleaned_lines = []
        for line in lines:
            # Skip comment lines
            stripped = line.strip()
            if stripped.startswith("--") or stripped.startswith("/*"):
                continue
            # Stop at markdown blocks
            if "```" in stripped:
                break
            cleaned_lines.append(line)
        
        sql = "\n".join(cleaned_lines).strip()
        
        # Remove inline comments (-- style)
        lines = sql.split("\n")
        cleaned_lines = []
        for line in lines:
            if "--" in line:
                comment_idx = line.find("--")
                # Only remove if it's not part of a string
                if comment_idx > 0:
                    line = line[:comment_idx].rstrip()
            cleaned_lines.append(line)
        
        sql = "\n".join(cleaned_lines).strip()
        
        # Ensure it ends with exactly one semicolon
        sql = sql.rstrip(";").strip() + ";"
        
        return sql if sql.lower().startswith("select") else None
    
    def interpret_question(self, state: Dict[str, Any]) -> Dict[str, Any]:
        """Generate SQL query from question - simplified version."""
        question = state.get("question", "").strip()
        history = state.get("history", [])
        
        # Preserve existing state
        result = {**state}
        
        if not question:
            result.update({"sql": None, "error": "La pregunta está vacía."})
            return result
        
        try:
            import json
            schema_str = json.dumps(self.config.schema, indent=2, ensure_ascii=False)
            
            # Build history context for follow-up questions
            history_context = ""
            if history and len(history) > 0:
                # Get last few exchanges for context
                recent_history = history[-3:]  # Last 3 exchanges
                history_lines = []
                for msg in recent_history:
                    user_msg = msg.get("user", "")
                    bot_msg = msg.get("bot", "")
                    if user_msg:
                        history_lines.append(f"Usuario: {user_msg}")
                    if bot_msg:
                        # Extract IDs or values from bot response for context
                        history_lines.append(f"Asistente: {bot_msg}")
                
                if history_lines:
                    history_context = "\n**Historial de conversación reciente:**\n" + "\n".join(history_lines) + "\n"
                    history_context += "\nIMPORTANTE: Si la pregunta actual hace referencia a resultados anteriores (como 'esas madres', 'ellos', 'esos registros'), usa los valores específicos del historial en la consulta SQL.\n"
            
            prompt = self.sql_prompt.format(
                schema=schema_str,
                question=question,
                company_id=self.config.company_id,
                history_context=history_context
            )
            response = self.llm.invoke(prompt)
            raw_sql = response.content.strip()
            
            logger.debug(f"Raw LLM response: {raw_sql[:200]}...")
            
            # Extract SQL from response
            sql = self._extract_sql(raw_sql)
            
            # Handle NO_SQL response (non-SQL questions)
            if sql == "NO_SQL":
                result.update({
                    "sql": None,
                    "error": None,
                    "non_sql_response": "Lo siento, solo puedo responder preguntas relacionadas con los datos de tu granja. Por ejemplo, puedo ayudarte con:\n- Consultas sobre animales registrados\n- Información sobre inseminaciones\n- Estadísticas y conteos\n- Búsquedas de registros específicos\n\n¿Hay algo específico sobre tus datos que te gustaría consultar?"
                })
                return result
            
            if not sql:
                result.update({"sql": None, "error": "No se pudo generar una consulta SQL válida."})
                return result
            
            # Basic validation: must start with SELECT and include company_id
            sql_lower = sql.lower()
            if not sql_lower.startswith("select"):
                result.update({"sql": None, "error": "La consulta debe ser una SELECT."})
                return result
            
            company_id_str = str(self.config.company_id)
            if f"company_id = {company_id_str}" not in sql and f"company_id={company_id_str}" not in sql:
                if "company_id" not in sql_lower:
                    result.update({"sql": None, "error": f"La consulta debe filtrar por company_id = {company_id_str}."})
                    return result
            
            logger.info(f"Generated SQL: {sql[:100]}...")
            result.update({"sql": sql, "error": None})
            return result
            
        except Exception as e:
            logger.error(f"Error generating SQL: {e}", exc_info=True)
            result.update({"sql": None, "error": f"Error generando SQL: {str(e)}"})
            return result
    
    def check_query(self, state: Dict[str, Any]) -> Dict[str, Any]:
        """Validate SQL query."""
        sql = state.get("sql")
        
        if not sql:
            error = state.get("error", "SQL vacío")
            logger.warning(f"SQL validation failed: {error}")
            return {"error": error, "sql_valid": False, "sql": None}
        
        sql = sql.strip()
        sql_lower = sql.lower()
        company_id_str = str(self.config.company_id)
        
        logger.debug(f"Validating SQL: {sql[:200]}...")
        
        if not sql_lower.strip().startswith("select"):
            logger.warning(f"Invalid SQL: does not start with SELECT")
            return {
                "error": f"La consulta debe ser una SELECT. SQL: {sql[:100]}...",
                "sql_valid": False,
                "sql": sql
            }

        has_company_filter = (
            f"company_id = {company_id_str}" in sql or
            f"company_id={company_id_str}" in sql or
            f"company_id = '{company_id_str}'" in sql or
            f"company_id='{company_id_str}'" in sql or
            f"company_id = \"{company_id_str}\"" in sql or
            f"company_id=\"{company_id_str}\"" in sql or
            f"company_id IN" in sql_lower or
            f"company_id in" in sql_lower
        )
        
        if not has_company_filter:
            logger.warning(f"SQL missing company_id filter")
            return {
                "error": f"La consulta debe filtrar por company_id = {company_id_str}. SQL: {sql[:100]}...",
                "sql_valid": False,
                "sql": sql
            }
        
        logger.info("SQL query validated successfully")
        return {"sql": sql, "sql_valid": True}
    
    def run_query(self, state: Dict[str, Any]) -> Dict[str, Any]:
        """Execute SQL query."""
        sql = state.get("sql", "")
        
        # Preserve existing state
        result = {**state}
        
        # If there's a non-SQL response, skip query execution
        if state.get("non_sql_response"):
            result.update({"answer": None})
            return result
        
        if not sql:
            # Only show error if there's no non-SQL response
            if not state.get("non_sql_response"):
                result.update({"answer": None, "error": "No hay SQL para ejecutar."})
            return result
        
        # If there's already an error, skip execution
        if state.get("error"):
            result.update({"answer": None})
            return result
        
        try:
            # Clean SQL: remove multiple semicolons and ensure single statement
            sql = sql.strip()
            # Remove trailing semicolons and add exactly one
            sql = sql.rstrip(";").strip() + ";"
            # Remove any extra semicolons in the middle (shouldn't happen, but safety check)
            if sql.count(";") > 1:
                # Take only the first statement
                sql = sql.split(";")[0] + ";"
            
            logger.debug(f"Executing SQL: {sql[:200]}...")
            
            conn = sqlite3.connect(self.config.db_path)
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            
            query_result = cursor.execute(sql).fetchall()
            
            # Get column names from the query result
            column_names = [description[0] for description in cursor.description] if cursor.description else []
            
            # Convert rows to dictionaries for easier formatting
            answer = [dict(row) for row in query_result]
            
            conn.close()
            
            logger.info(f"Query executed successfully, {len(answer)} rows returned")
            result.update({
                "answer": answer,
                "column_names": column_names,
                "error": None
            })
            return result
            
        except sqlite3.Error as e:
            logger.error(f"SQL execution error: {e}", exc_info=True)
            result.update({"answer": None, "error": f"Error ejecutando SQL: {str(e)}"})
            return result
        except Exception as e:
            logger.error(f"Unexpected error: {e}", exc_info=True)
            result.update({"answer": None, "error": f"Error inesperado: {str(e)}"})
            return result
    
    def format_response(self, state: Dict[str, Any]) -> Dict[str, Any]:
        """Format final response in a user-friendly way."""
        # Preserve existing state
        result = {**state}
        
        # Check for non-SQL response first (user-friendly message for non-data questions)
        non_sql_response = state.get("non_sql_response")
        if non_sql_response:
            result["final_answer"] = non_sql_response
            return result
        
        error = state.get("error")
        if error:
            # Make error messages more user-friendly
            if "No hay SQL para ejecutar" in error or "No se pudo generar" in error:
                result["final_answer"] = "Lo siento, solo puedo responder preguntas relacionadas con los datos de tu granja. Por ejemplo:\n\n- ¿Cuántos registros hay?\n- Dame los terneros de mayor peso\n- ¿Cuántas inseminaciones hay en 2025?\n- Muestra las madres con mayor peso\n\n¿Hay algo específico sobre tus datos que te gustaría consultar?"
            else:
                result["final_answer"] = f"Error: {error}"
            return result
        
        answer = state.get("answer")
        if not answer:
            result["final_answer"] = "No se encontraron resultados."
            return result
        
        # Single value result (e.g., COUNT)
        if len(answer) == 1 and isinstance(answer[0], dict):
            if len(answer[0]) == 1:
                # Single column, single row
                value = list(answer[0].values())[0]
                result["final_answer"] = str(value) if value is not None else "0"
                return result
        
        # Multiple rows - format in a user-friendly way
        try:
            # Use LLM to format the response naturally
            formatted_response = self._format_with_llm(answer, state.get("question", ""))
            if formatted_response:
                result["final_answer"] = formatted_response
                return result
        except Exception as e:
            logger.warning(f"Error formatting with LLM: {e}, falling back to simple format")
        
        # Fallback to simple formatting
        result["final_answer"] = self._format_simple(answer)
        return result
    
    def _format_simple(self, answer: list) -> str:
        """Simple formatting fallback."""
        if not answer:
            return "No se encontraron resultados."
        
        # If answer is a list of dicts, format nicely
        if isinstance(answer[0], dict):
            formatted_lines = []
            for idx, row in enumerate(answer, 1):
                # Filter out None values and internal IDs
                relevant_items = {
                    k: v for k, v in row.items() 
                    if v is not None 
                    and k not in ['id', 'company_id', 'created_at', 'updated_at', 'user_id', 'firebase_uid']
                }
                
                if relevant_items:
                    # Format as key-value pairs
                    items = []
                    for key, value in relevant_items.items():
                        # Format key names (snake_case to readable)
                        readable_key = key.replace('_', ' ').title()
                        items.append(f"{readable_key}: {value}")
                    
                    formatted_lines.append(f"{idx}. " + " | ".join(items))
            
            if formatted_lines:
                return "\n".join(formatted_lines)
        
        # Fallback for tuple format
        formatted_rows = []
        for row in answer:
            if isinstance(row, (list, tuple)):
                formatted_rows.append(" | ".join(str(val) if val is not None else "-" for val in row))
            else:
                formatted_rows.append(str(row))
        
        return "\n".join(formatted_rows)
    
    def _format_with_llm(self, answer: list, question: str) -> str:
        """Use LLM to format the response in natural language."""
        if not answer or len(answer) == 0:
            return None
        
        try:
            import json
            
            # Limit to first 20 rows for LLM formatting
            limited_answer = answer[:20]
            
            # Build prompt for formatting
            format_prompt = f"""
Eres un asistente que formatea resultados de consultas SQL en respuestas naturales y fáciles de leer.

Pregunta del usuario: {question}

Resultados de la consulta (JSON):
{json.dumps(limited_answer, indent=2, ensure_ascii=False, default=str)}

**CONTEXTO CRÍTICO DE LA BASE DE DATOS:**

**Tabla `registrations` (Registros de animales):**
- Esta tabla contiene TERNEROS/ANIMALES RECIÉN NACIDOS, NO las madres adultas.
- `animal_number`: Es el ID del ANIMAL REGISTRADO (el ternero/recién nacido). Ejemplo: "COW-002" es un ternero.
- `mother_id`: Es el ID de la MADRE (la vaca adulta que parió). Ejemplo: "MOTHER-002" es la madre.
- `father_id` o `bull_id`: Es el ID del TORO/PADRE.
- `weight`: Peso del TERNERO registrado (NO el peso de la madre).
- `mother_weight`: Peso de la MADRE (si está disponible).
- `born_date`: Fecha de nacimiento del ternero.

**DIFERENCIAS IMPORTANTES:**
- Si la pregunta es sobre "MADRES", el campo relevante es `mother_id`, NO `animal_number`.
- Si la pregunta es sobre "TERNEROS" o "animales registrados", el campo relevante es `animal_number`.
- `animal_number` = el ternero/animal registrado
- `mother_id` = la madre (vaca adulta)
- `father_id`/`bull_id` = el toro/padre
- `weight` = peso del TERNERO (NO de la madre)
- `mother_weight` = peso de la MADRE

**Tabla `inseminations` (Inseminaciones):**
- Contiene registros de inseminaciones a MADRES (vacas adultas).
- `mother_id`: ID de la madre inseminada.
- `bull_id`: ID del toro usado.

**INSTRUCCIONES DE FORMATEO:**
1. Natural y fácil de leer
2. Mostrando solo la información relevante (evita IDs técnicos como `id`, `company_id`, timestamps como `created_at`, `updated_at`, `user_id`, `firebase_uid`)
3. Organizada y clara
4. En español
5. Si hay múltiples resultados, usa una lista numerada o formato de tabla simple

**IMPORTANTE:**
- NO confundas `animal_number` (ternero) con `mother_id` (madre).
- Si la pregunta es sobre "madres", identifica correctamente que `mother_id` es la madre, NO `animal_number`.
- Si la pregunta es sobre "terneros" o "animales registrados", `animal_number` es el animal.
- No inventes información que no esté en los resultados.
- Si hay muchos resultados, muestra los primeros y menciona cuántos hay en total.
- Usa nombres de columnas legibles:
  - `animal_number` → "Número de animal" o "ID del animal registrado" (si es ternero)
  - `mother_id` → "ID de madre" o "Madre"
  - `father_id`/`bull_id` → "ID de toro" o "Toro"
  - `weight` → "Peso"
  - `born_date` → "Fecha de nacimiento"
  - `gender` → "Género"
  - `status` → "Estado"

Responde SOLO con la respuesta formateada, sin explicaciones adicionales:
"""
            
            response = self.llm.invoke(format_prompt)
            formatted = response.content.strip()
            
            # Add note if results were limited
            if len(answer) > 20:
                formatted += f"\n\n(Se muestran los primeros 20 de {len(answer)} resultados)"
            
            return formatted
            
        except Exception as e:
            logger.error(f"Error in LLM formatting: {e}")
            return None
    
    def update_memory(self, state: Dict[str, Any]) -> Dict[str, Any]:
        """Update conversation history with question and answer."""
        question = state.get("question", "")
        answer = state.get("final_answer", "")
        history = state.get("history", [])
        
        if question and answer:
            history.append({"user": question, "bot": answer})
            # Keep only the last MAX_HISTORY entries
            history = history[-MAX_HISTORY:]
            logger.info(f"Updated history with {len(history)} entries")
        else:
            logger.debug(f"No history update: question={bool(question)}, answer={bool(answer)}")
        
        # Preserve all existing state, only update history
        updated_state = {**state, "history": history}
        return updated_state

