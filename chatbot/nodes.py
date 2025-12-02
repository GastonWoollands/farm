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
Eres un asistente experto en SQL que genera consultas para una base de datos SQLite de una granja.

Tienes acceso a las siguientes tablas y columnas:
{schema}

El usuario actual pertenece a la compañía con ID: {company_id}.

**REGLAS ESTRICTAS:**
1. **Todas las consultas deben incluir un filtro `WHERE company_id = {company_id}` o su equivalente en los `JOIN`.**
   - Si la tabla principal no tiene `company_id`, usa una tabla relacionada que sí lo tenga para filtrar correctamente.
   - Nunca devuelvas datos de otras compañías.
2. Usa únicamente los nombres de tablas y columnas que aparecen en el schema.
3. Si la pregunta es ambigua o no se puede filtrar por `company_id`, responde "NO_SQL".
4. Devuelve **solo una query SQL válida**, ejecutable en SQLite. Sin comentarios, sin Markdown, sin texto adicional.
5. Si la pregunta NO está relacionada con datos de la granja (animales, inseminaciones, métricas), responde "NO_SQL".
6. Usa alias cortos (`u`, `r`, `c`, etc.) si es necesario, pero mantén la legibilidad.
7. Asegúrate de que la consulta final termine con un punto y coma `;`.
8. IMPORTANTE: LA QUERY SOLO PUEDE TENER SELECT, NO PERMITIDO DELETE, UPDATE, INSERT, ETC.
9. EXTREMA IMPORTANCIA: SOLO CREA UNA QUERY SQL FILTRADA POR company_id!!!

10. **CONTEXTO DE CONVERSACIÓN**: Si hay historial de conversación, úsalo para entender referencias como "esas madres", "ellos", "esos registros", etc.
    - Si la pregunta hace referencia a resultados anteriores, usa esos valores en la consulta SQL.
    - Por ejemplo, si la pregunta anterior devolvió IDs como "MOTHER-002", "AC988", usa esos valores en un filtro WHERE o IN.

**MÉTRICAS DISPONIBLES EN LA INTERFAZ:**

El sistema calcula las siguientes métricas que los usuarios pueden consultar. Cuando un usuario pregunta por la definición o explicación de una métrica, debes responder con una explicación conceptual clara SIN mencionar SQL, tablas, filtros técnicos, o detalles de implementación:

1. **Total Animales (Total Registros)**: 
   - Es el conteo total de todos los animales registrados en el sistema.
   - Representa todos los terneros/animales registrados, NO las madres adultas.
   - Es el número total de registros de nacimientos o registros de animales.

2. **Madres Activas**:
   - Es el número de madres únicas que han parido (tienen registros de terneros).
   - Una madre activa es una vaca que tiene al menos un ternero registrado en el sistema.
   - Cuenta cada madre solo una vez, sin importar cuántos terneros haya parido.

3. **Total de Crías (Total Offspring)**:
   - Es el número total de terneros nacidos de todas las madres.
   - Diferencia con "Total Animales": "Total Animales" incluye todos los registros, mientras que "Total de Crías" solo incluye los terneros que tienen una madre identificada.

4. **Peso Promedio**:
   - Es el peso promedio de los terneros registrados al momento de su registro.
   - Se calcula sumando todos los pesos de los terneros y dividiéndolos entre el número de terneros.
   - Refleja el peso de los terneros recién nacidos, NO el peso de las madres.

5. **Peso Mínimo y Máximo**:
   - Peso mínimo: El peso más bajo registrado entre todos los terneros.
   - Peso máximo: El peso más alto registrado entre todos los terneros.
   - Estos valores ayudan a entender el rango de pesos de los terneros.

6. **Promedio de Crías por Madre**:
   - Se calcula dividiendo el total de crías entre el número de madres activas.
   - Indica cuántos terneros en promedio tiene cada madre.
   - Fórmula: Total de Crías / Madres Activas

7. **Inseminaciones por Ronda**:
   - Agrupa las inseminaciones realizadas por ronda o período de tiempo.
   - Cada ronda representa un período específico de inseminaciones.
   - Permite analizar la actividad de inseminación por períodos.

**EXPLICACIONES DE DIFERENCIAS ENTRE MÉTRICAS:**

Cuando expliques diferencias entre métricas, usa lenguaje claro y conceptual, SIN mencionar SQL, tablas, campos técnicos, o filtros:

- **Total Animales vs Madres Activas**: 
  - "Total Animales" cuenta todos los registros de terneros, mientras que "Madres Activas" cuenta las madres únicas que han parido.
  - Ejemplo: Si hay 50 terneros de 20 madres diferentes, "Total Animales" = 50, "Madres Activas" = 20.
  - La diferencia es que una madre puede tener múltiples terneros, por lo que el total de animales es mayor que el número de madres.

- **Total Animales vs Total de Crías**:
  - "Total Animales" incluye todos los registros de animales (puede incluir animales sin madre identificada).
  - "Total de Crías" solo incluye los terneros que tienen una madre identificada.
  - Si todos los animales tienen madre identificada, ambos valores son iguales.

- **Peso del Ternero vs Peso de la Madre**:
  - El peso del ternero es el peso del animal recién nacido al momento del registro.
  - El peso de la madre es el peso de la vaca adulta que parió.
  - Son valores diferentes y no deben confundirse: el peso del ternero es mucho menor que el peso de la madre.

**CONTEXTO CRÍTICO DE LA BASE DE DATOS:**

**⚠️ IMPORTANTE - IDENTIFICADORES DE ANIMALES vs IDs TÉCNICOS:**

**CUANDO EL USUARIO PREGUNTA SOBRE "ID", "IDENTIFICADOR", "NÚMERO", "CÓDIGO":**
- El usuario SIEMPRE se refiere a identificadores de ANIMALES (animal_number, mother_id, father_id, bull_id), NO a los IDs técnicos internos.
- Los campos `id` (INTEGER PRIMARY KEY) en las tablas son identificadores técnicos internos que NUNCA deben mostrarse al usuario ni usarse en consultas cuando el usuario pregunta por "id".
- Cuando el usuario pregunta por "id de un animal", "identificador", "número de animal", "código", "ID de madre", "ID de toro", etc., debes usar:
  - `animal_number` para animales/terneros registrados
  - `mother_id` para madres
  - `father_id` o `bull_id` para toros/padres
  - `insemination_identifier` para identificadores de inseminación
  - `insemination_round_id` para rondas de inseminación

**REGLA CRÍTICA:**
- NUNCA uses el campo `id` (INTEGER PRIMARY KEY) cuando el usuario pregunta por "id" de animales, madres, toros, etc.
- El campo `id` es solo un identificador técnico interno de la base de datos y NO tiene significado para el usuario.
- Si el usuario pregunta "dame el id del animal", "muéstrame los ids", "identificadores", etc., SIEMPRE usa `animal_number`, `mother_id`, `father_id`, `bull_id`, etc., según el contexto.

**Tabla `registrations` (Registros de animales):**
- Esta tabla contiene los TERNEROS/ANIMALES RECIÉN NACIDOS o REGISTRADOS, NO las madres adultas.
- `id`: IDENTIFICADOR TÉCNICO INTERNO - NUNCA usar cuando el usuario pregunta por "id" de animales. Solo para relaciones técnicas.
- `animal_number`: Es el ID del animal REGISTRADO (el ternero/recién nacido). Ejemplo: "COW-002" es un ternero registrado. **USA ESTE cuando el usuario pregunta por "id de animal", "identificador de animal", "número de animal".**
- `mother_id`: Es el ID de la MADRE (la vaca adulta que parió). Ejemplo: "MOTHER-002" es la madre. **USA ESTE cuando el usuario pregunta por "id de madre", "identificador de madre", "código de madre".**
- `father_id`: Es el ID del TORO/PADRE (el semental). **USA ESTE cuando el usuario pregunta por "id de toro", "identificador de toro", "código de toro", "id del padre".**
- `born_date`: Fecha de nacimiento del ternero.
- `weight`: Peso del TERNERO registrado (NO el peso de la madre).
- `mother_weight`: Peso de la MADRE (si está disponible).
- `gender`: Género del ternero (MALE/FEMALE/UNKNOWN).
- `status`: Estado del ternero (ALIVE/DEAD).

**Tabla `inseminations` (Inseminaciones):**
- Contiene registros de inseminaciones realizadas a las MADRES (vacas adultas).
- `id`: IDENTIFICADOR TÉCNICO INTERNO - NUNCA usar cuando el usuario pregunta por "id" de inseminaciones.
- `mother_id`: ID de la madre inseminada. **USA ESTE cuando el usuario pregunta por "id de madre" en contexto de inseminaciones.**
- `bull_id`: ID del toro usado para la inseminación. **USA ESTE cuando el usuario pregunta por "id de toro" en contexto de inseminaciones.**
- `insemination_identifier`: Identificador de la inseminación. **USA ESTE cuando el usuario pregunta por "id de inseminación", "identificador de inseminación".**
- `insemination_date`: Fecha de la inseminación.
- `insemination_round_id`: ID de la ronda de inseminación. **USA ESTE cuando el usuario pregunta por "id de ronda", "identificador de ronda".**

**Tabla `inseminations_ids` (Rondas de inseminación):**
- Agrupa inseminaciones por ronda.
- `id`: IDENTIFICADOR TÉCNICO INTERNO - NUNCA usar cuando el usuario pregunta por "id" de rondas.
- `insemination_round_id`: ID de la ronda. **USA ESTE cuando el usuario pregunta por "id de ronda", "identificador de ronda".**
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
- Si pregunta "id de las madres", "identificadores de madres", "códigos de madres", usa `mother_id`, NUNCA el campo técnico `id`.

**CUANDO EL USUARIO PREGUNTA SOBRE "TERNEROS":**
- Busca en `registrations` usando `animal_number` o filtros por `born_date`, `weight`, etc.
- Los terneros están relacionados con sus madres a través de `mother_id`.
- Si pregunta "id de los terneros", "identificadores de animales", "números de animal", "códigos", usa `animal_number`, NUNCA el campo técnico `id`.

**CUANDO EL USUARIO PREGUNTA SOBRE "INSEMINACIONES":**
- Busca en la tabla `inseminations`.
- Usa `mother_id` para identificar la madre inseminada.
- Usa `insemination_round_id` para agrupar por ronda.
- Si pregunta "id de inseminaciones", "identificadores de inseminaciones", usa `insemination_identifier`, NUNCA el campo técnico `id`.
- Si pregunta "id de toros", "identificadores de toros", usa `bull_id`, NUNCA el campo técnico `id`.

{history_context}

**Ejemplos:**

Usuario: "¿Cuántos registros hay en la tabla registrations?"
SQL: SELECT COUNT(*) FROM registrations WHERE company_id = {company_id};

Usuario: "¿Cuál es el evento más reciente?"
SQL: SELECT * FROM events_state WHERE company_id = {company_id} ORDER BY created_at DESC LIMIT 1;

Usuario: "Dame los terneros de las madres MOTHER-002 y AC988"
SQL: SELECT * FROM registrations WHERE company_id = {company_id} AND mother_id IN ('MOTHER-002', 'AC988');

Usuario: "Dame los ids de los animales"
SQL: SELECT animal_number FROM registrations WHERE company_id = {company_id};

Usuario: "Muestra los identificadores de las madres"
SQL: SELECT DISTINCT mother_id FROM registrations WHERE company_id = {company_id} AND mother_id IS NOT NULL;

Usuario: "¿Cuál es el id del animal con mayor peso?"
SQL: SELECT animal_number FROM registrations WHERE company_id = {company_id} ORDER BY weight DESC LIMIT 1;

Usuario: "Dame los códigos de los toros"
SQL: SELECT DISTINCT bull_id FROM inseminations WHERE company_id = {company_id} AND bull_id IS NOT NULL;

Pregunta actual: {question}
SQL:
""")
        
        self.validation_prompt = ChatPromptTemplate.from_template("""
Eres un asistente que determina si una pregunta del usuario está relacionada con los datos de la granja y requiere una consulta SQL.

Schema disponible:
{schema}

**CONTEXTO:**
Este es un sistema de gestión de granja que maneja:
- Registros de animales (terneros, vacas, toros)
- Inseminaciones
- Métricas de la granja (Total Animales, Madres Activas, Peso Promedio, etc.)
- Rondas de inseminación

**MÉTRICAS DISPONIBLES:**
- Total Animales / Total Registros
- Madres Activas
- Total de Crías
- Peso Promedio, Mínimo, Máximo
- Promedio de Crías por Madre
- Inseminaciones por Ronda
- Diferencias entre métricas

Pregunta del usuario: {question}

**Responde SOLO con "YES" si la pregunta:**
- Pregunta sobre datos de animales (terneros, madres, toros)
- Pregunta sobre inseminaciones
- Pregunta sobre métricas (Total Animales, Total Registros, Madres Activas, Peso Promedio, etc.)
- Pregunta sobre diferencias entre métricas
- Pregunta sobre conteos, estadísticas, filtros de datos
- Pregunta sobre registros específicos
- Pregunta sobre fechas, pesos, géneros, estados de animales
- Pregunta sobre rondas de inseminación
- Pregunta que pide explicación o definición de una métrica (ej: "qué es", "qué significa", "explica", "definición")
- Pregunta sobre "total de registros", "total registros", "total animales", etc. (con o sin "de")

**Responde SOLO con "NO" si la pregunta es:**
- Un saludo general ("Hola", "Buenos días", etc.)
- Conversación casual no relacionada con datos
- Pregunta sobre cómo usar el sistema o la interfaz
- Pregunta sobre programación, tecnología, o temas no relacionados
- Pregunta sobre temas generales (clima, política, deportes, etc.)
- Pregunta que no puede responderse con datos de la base de datos
- Pregunta sobre funciones del sistema (cómo registrar, cómo buscar, etc.)

**Ejemplos:**
- "¿Cuántos animales tengo?" → YES
- "¿Qué es Total Animales?" → YES (explicación de métrica)
- "¿Qué significa total de registros?" → YES (explicación de métrica)
- "¿Qué significa total registros?" → YES (explicación de métrica)
- "¿Cuál es la diferencia entre Total Animales y Madres Activas?" → YES
- "Hola, ¿cómo estás?" → NO
- "¿Cómo registro un animal?" → NO
- "¿Qué tiempo hace?" → NO
- "Explícame la métrica de Madres Activas" → YES
- "que significa total de registros?" → YES

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
                    "non_sql_response": "Lo siento, solo puedo responder preguntas relacionadas con los datos de tu granja. Puedo ayudarte con:\n\nMétricas y estadísticas:\n- Total de animales registrados\n- Madres activas\n- Peso promedio, mínimo, máximo\n- Inseminaciones por ronda\n- Diferencias entre métricas\n\nDatos de animales:\n- Consultas sobre terneros, madres, toros\n- Búsquedas por peso, fecha, género, estado\n- Relaciones entre madres y crías\n\nInseminaciones:\n- Registros de inseminaciones\n- Rondas de inseminación\n- Toros utilizados\n\n¿Hay algo específico sobre tus datos que te gustaría consultar?"
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
    
    def _is_metric_explanation_question(self, question: str) -> bool:
        """Check if question is asking for metric explanation (not data query)."""
        question_lower = question.lower()
        
        # Keywords that indicate explanation request
        explanation_keywords = [
            "qué es", "que es", "qué significa", "que significa",
            "explica", "explicame", "explicación", "definición", "definicion",
            "diferencia entre", "diferencias entre", "diferencia de",
            "cómo se calcula", "como se calcula", "cómo funciona", "como funciona"
        ]
        
        # Metric names and variations (including with/without "de")
        metric_patterns = [
            "total animales", "total de animales", "total animal",
            "total registros", "total de registros", "total registro",
            "madres activas", "madre activa", "madres activa",
            "total de crías", "total crías", "total de crias", "total crias",
            "peso promedio", "peso medio", "peso promedio de",
            "peso mínimo", "peso minimo", "peso máximo", "peso maximo",
            "promedio de crías", "promedio de crias", "crías por madre", "crias por madre",
            "inseminaciones por ronda", "ronda de inseminación", "ronda de inseminacion"
        ]
        
        # Check if question contains explanation keywords
        has_explanation_keyword = any(keyword in question_lower for keyword in explanation_keywords)
        
        # Check if question contains any metric pattern
        has_metric_name = any(pattern in question_lower for pattern in metric_patterns)
        
        # Also check for metric keywords even without exact match
        metric_keywords = ["total", "registro", "madre", "cría", "cria", "peso", "inseminación", "inseminacion", "ronda"]
        has_metric_keyword = any(keyword in question_lower for keyword in metric_keywords)
        
        # If it has explanation keyword and metric-related content, it's an explanation question
        if has_explanation_keyword:
            if has_metric_name:
                return True
            # Also check if it has metric keywords and explanation keywords together
            if has_metric_keyword and ("total" in question_lower or "registro" in question_lower or "madre" in question_lower):
                return True
        
        # Check for "diferencia" questions (always explanations)
        if "diferencia" in question_lower and has_metric_name:
            return True
        
        return False
    
    def _get_metric_explanation(self, question: str) -> str:
        """Provide conceptual explanation of metrics without technical details."""
        question_lower = question.lower()
        
        explanations = {
            "total animales": """Total Animales (Total Registros)

Es el número total de todos los animales registrados en tu sistema. Representa todos los terneros o animales que han sido registrados al nacer, sin importar si tienen o no una madre identificada.

Esta métrica te da una visión general de cuántos animales has registrado en total en tu granja.""",

            "total registros": """Total Animales (Total Registros)

Es el número total de todos los animales registrados en tu sistema. Representa todos los terneros o animales que han sido registrados al nacer, sin importar si tienen o no una madre identificada.

Esta métrica te da una visión general de cuántos animales has registrado en total en tu granja.""",

            "total de registros": """Total Animales (Total Registros)

Es el número total de todos los animales registrados en tu sistema. Representa todos los terneros o animales que han sido registrados al nacer, sin importar si tienen o no una madre identificada.

Esta métrica te da una visión general de cuántos animales has registrado en total en tu granja.""",

            "total registro": """Total Animales (Total Registros)

Es el número total de todos los animales registrados en tu sistema. Representa todos los terneros o animales que han sido registrados al nacer, sin importar si tienen o no una madre identificada.

Esta métrica te da una visión general de cuántos animales has registrado en total en tu granja.""",

            "madres activas": """Madres Activas

Es el número de madres únicas que han parido y tienen al menos un ternero registrado en el sistema. Cada madre cuenta solo una vez, sin importar cuántos terneros haya parido.

Por ejemplo, si una madre ha parido 3 terneros, solo cuenta como 1 madre activa. Esta métrica te ayuda a entender cuántas vacas reproductoras activas tienes en tu granja.""",

            "total de crías": """Total de Crías

Es el número total de terneros que han nacido y tienen una madre identificada en el sistema. A diferencia de "Total Animales", esta métrica solo incluye los terneros que están asociados a una madre específica.

Si todos tus animales tienen una madre identificada, el "Total de Crías" será igual al "Total Animales". Si algunos animales no tienen madre identificada, el "Total de Crías" será menor.""",

            "peso promedio": """Peso Promedio

Es el peso promedio de todos los terneros registrados al momento de su registro o nacimiento. Se calcula sumando todos los pesos de los terneros y dividiéndolos entre el número de terneros.

Esta métrica te ayuda a entender el peso típico de tus terneros recién nacidos y puede indicar la salud general de tus animales.""",

            "peso mínimo": """Peso Mínimo

Es el peso más bajo registrado entre todos los terneros en tu sistema. Te ayuda a identificar el ternero con menor peso al nacer.""",

            "peso máximo": """Peso Máximo

Es el peso más alto registrado entre todos los terneros en tu sistema. Te ayuda a identificar el ternero con mayor peso al nacer.""",

            "promedio de crías": """Promedio de Crías por Madre

Es el número promedio de terneros que tiene cada madre. Se calcula dividiendo el total de crías entre el número de madres activas.

Por ejemplo, si tienes 50 crías de 20 madres, el promedio sería 2.5 crías por madre. Esta métrica te ayuda a entender la productividad de tus madres.""",

            "inseminaciones por ronda": """Inseminaciones por Ronda

Agrupa las inseminaciones realizadas por ronda o período de tiempo. Cada ronda representa un período específico durante el cual se realizaron inseminaciones.

Esta métrica te permite analizar la actividad de inseminación por períodos y entender cuántas inseminaciones se realizaron en cada ronda."""
        }
        
        # Find matching explanation - check variations
        for metric_key, explanation in explanations.items():
            # Check exact match
            if metric_key in question_lower:
                return explanation
            # Check variations (with/without "de", singular/plural)
            metric_variations = [
                metric_key,
                metric_key.replace(" de ", " "),
                metric_key.replace(" ", " de "),
                metric_key.replace("registros", "registro"),
                metric_key.replace("registro", "registros"),
            ]
            for variation in metric_variations:
                if variation in question_lower:
                    return explanation
        
        # Special handling for "total de registros" / "total registros" variations
        if ("total" in question_lower and "registro" in question_lower) or ("total" in question_lower and "registros" in question_lower):
            return explanations.get("total registros", explanations.get("total de registros", None))
        
        # Default explanation for difference questions
        if "diferencia" in question_lower:
            if "total animales" in question_lower and "madres activas" in question_lower:
                return """Diferencia entre Total Animales y Madres Activas

Total Animales cuenta todos los registros de terneros en tu sistema. Si tienes 50 terneros registrados, el Total Animales será 50.

Madres Activas cuenta las madres únicas que han parido. Si esos 50 terneros provienen de 20 madres diferentes, las Madres Activas serán 20.

La diferencia es que una madre puede tener múltiples terneros, por lo que el total de animales siempre será mayor o igual que el número de madres activas."""
            
            elif "total animales" in question_lower and "total de crías" in question_lower:
                return """Diferencia entre Total Animales y Total de Crías

Total Animales incluye todos los registros de animales en tu sistema, incluso aquellos que no tienen una madre identificada.

Total de Crías solo incluye los terneros que tienen una madre identificada en el sistema.

Si todos tus animales tienen una madre identificada, ambos valores serán iguales. Si algunos animales no tienen madre identificada, el Total de Crías será menor que el Total Animales."""
        
        return None
    
    def interpret_question(self, state: Dict[str, Any]) -> Dict[str, Any]:
        """Generate SQL query from question - simplified version."""
        question = state.get("question", "").strip()
        history = state.get("history", [])
        
        # Preserve existing state
        result = {**state}
        
        if not question:
            result.update({"sql": None, "error": "La pregunta está vacía."})
            return result
        
        # Check if this is a metric explanation question (not a data query)
        if self._is_metric_explanation_question(question):
            explanation = self._get_metric_explanation(question)
            if explanation:
                result.update({
                    "sql": None,
                    "error": None,
                    "non_sql_response": explanation
                })
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
                    "non_sql_response": "Lo siento, solo puedo responder preguntas relacionadas con los datos de tu granja. Puedo ayudarte con:\n\nMétricas y estadísticas:\n- Total de animales registrados\n- Madres activas\n- Peso promedio, mínimo, máximo\n- Inseminaciones por ronda\n- Explicaciones de métricas y diferencias entre ellas\n\nDatos de animales:\n- Consultas sobre terneros, madres, toros\n- Búsquedas por peso, fecha, género, estado\n- Relaciones entre madres y crías\n\nInseminaciones:\n- Registros de inseminaciones\n- Rondas de inseminación\n- Toros utilizados\n\n¿Hay algo específico sobre tus datos que te gustaría consultar?"
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
                result["final_answer"] = "Lo siento, solo puedo responder preguntas relacionadas con los datos de tu granja. Puedo ayudarte con:\n\nMétricas:\n- ¿Cuántos animales tengo registrados?\n- ¿Qué es Total Animales?\n- ¿Cuál es la diferencia entre Total Animales y Madres Activas?\n- ¿Cuál es el peso promedio?\n\nDatos de animales:\n- Dame los terneros de mayor peso\n- Muestra las madres con mayor peso\n- ¿Cuántos animales hay por género?\n\nInseminaciones:\n- ¿Cuántas inseminaciones hay en 2025?\n- Muestra las rondas de inseminación\n\n¿Hay algo específico sobre tus datos que te gustaría consultar?"
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

**IMPORTANTE - IDENTIFICADORES DE ANIMALES vs IDs TÉCNICOS:**
- Los campos `id` (INTEGER PRIMARY KEY) son identificadores técnicos internos que NUNCA deben mostrarse al usuario.
- Cuando el usuario pregunta por "id", "identificador", "número", "código", se refiere a:
  - `animal_number` para animales/terneros
  - `mother_id` para madres
  - `father_id` o `bull_id` para toros
  - `insemination_identifier` para inseminaciones
  - `insemination_round_id` para rondas
- NUNCA muestres el campo técnico `id` en las respuestas, incluso si está en los resultados.

**Tabla `registrations` (Registros de animales):**
- Esta tabla contiene TERNEROS/ANIMALES RECIÉN NACIDOS, NO las madres adultas.
- `id`: IDENTIFICADOR TÉCNICO INTERNO - NUNCA mostrar al usuario.
- `animal_number`: Es el ID del ANIMAL REGISTRADO (el ternero/recién nacido). Ejemplo: "COW-002" es un ternero. **Este es el "id" que el usuario quiere ver cuando pregunta por "id de animal".**
- `mother_id`: Es el ID de la MADRE (la vaca adulta que parió). Ejemplo: "MOTHER-002" es la madre. **Este es el "id" que el usuario quiere ver cuando pregunta por "id de madre".**
- `father_id`: Es el ID del TORO/PADRE. **Este es el "id" que el usuario quiere ver cuando pregunta por "id de toro" o "id del padre".**
- `weight`: Peso del TERNERO registrado (NO el peso de la madre).
- `mother_weight`: Peso de la MADRE (si está disponible).
- `born_date`: Fecha de nacimiento del ternero.

**DIFERENCIAS IMPORTANTES:**
- Si la pregunta es sobre "MADRES", el campo relevante es `mother_id`, NO `animal_number`.
- Si la pregunta es sobre "TERNEROS" o "animales registrados", el campo relevante es `animal_number`.
- `animal_number` = el ternero/animal registrado (el "id" del animal para el usuario)
- `mother_id` = la madre (vaca adulta) (el "id" de la madre para el usuario)
- `father_id`/`bull_id` = el toro/padre (el "id" del toro para el usuario)
- `weight` = peso del TERNERO (NO de la madre)
- `mother_weight` = peso de la MADRE

**Tabla `inseminations` (Inseminaciones):**
- Contiene registros de inseminaciones a MADRES (vacas adultas).
- `id`: IDENTIFICADOR TÉCNICO INTERNO - NUNCA mostrar al usuario.
- `mother_id`: ID de la madre inseminada. **Este es el "id" que el usuario quiere ver cuando pregunta por "id de madre" en inseminaciones.**
- `bull_id`: ID del toro usado. **Este es el "id" que el usuario quiere ver cuando pregunta por "id de toro" en inseminaciones.**
- `insemination_identifier`: Identificador de la inseminación. **Este es el "id" que el usuario quiere ver cuando pregunta por "id de inseminación".**

**MÉTRICAS DISPONIBLES (para explicaciones):**
Cuando expliques métricas, usa lenguaje conceptual y claro, SIN mencionar SQL, tablas, campos técnicos, filtros, o detalles de implementación:

- **Total Animales**: Conteo total de todos los animales registrados en el sistema (todos los terneros registrados).
- **Madres Activas**: Número de madres únicas que han parido (cada madre cuenta solo una vez).
- **Total de Crías**: Total de terneros que tienen una madre identificada.
- **Peso Promedio**: Promedio del peso de los terneros al momento de su registro.
- **Peso Mínimo/Máximo**: Valores mínimo y máximo del peso de terneros registrados.
- **Promedio de Crías por Madre**: Se calcula dividiendo el total de crías entre el número de madres activas.

**INSTRUCCIONES DE FORMATEO:**
1. Natural y fácil de leer
2. Mostrando solo la información relevante (evita IDs técnicos como `id`, `company_id`, timestamps como `created_at`, `updated_at`, `user_id`, `firebase_uid`)
3. **CRÍTICO**: NUNCA muestres el campo técnico `id` (INTEGER PRIMARY KEY) al usuario. Si está en los resultados, omítelo completamente.
4. Cuando el usuario pregunta por "id", "identificador", "número", "código", muestra `animal_number`, `mother_id`, `father_id`, `bull_id`, `insemination_identifier`, etc., según corresponda.
5. Organizada y clara
6. En español
7. Si hay múltiples resultados, usa una lista numerada o formato de tabla simple
8. Si la pregunta es sobre métricas o diferencias entre métricas, incluye una explicación clara y breve

**IMPORTANTE - PROHIBIDO REVELAR DETALLES TÉCNICOS:**
- **NUNCA** menciones SQL, queries, tablas, campos técnicos, filtros, o detalles de implementación cuando expliques métricas.
- **NUNCA** muestres código SQL, nombres de tablas, o filtros técnicos al usuario.
- Si la pregunta es sobre la definición o explicación de una métrica, responde solo con el concepto y significado, sin detalles técnicos.
- NO confundas `animal_number` (ternero) con `mother_id` (madre).
- Si la pregunta es sobre "madres", identifica correctamente que `mother_id` es la madre, NO `animal_number`.
- Si la pregunta es sobre "terneros" o "animales registrados", `animal_number` es el animal.
- **CRÍTICO**: NUNCA muestres el campo técnico `id` (INTEGER PRIMARY KEY) al usuario. Si aparece en los resultados, omítelo completamente de la respuesta formateada.
- Cuando el usuario pregunta por "id", "identificador", "número", "código", interpreta que se refiere a `animal_number`, `mother_id`, `father_id`, `bull_id`, etc., NO al campo técnico `id`.
- No inventes información que no esté en los resultados.
- Si hay muchos resultados, muestra los primeros y menciona cuántos hay en total.
- Si la pregunta es sobre métricas o diferencias, explica claramente qué significa cada métrica usando lenguaje simple y conceptual.
- Usa nombres de columnas legibles (pero solo cuando muestres datos, no en explicaciones de métricas):
  - `animal_number` → "Número de animal", "ID del animal", "Identificador del animal", o "Código del animal" (si es ternero)
  - `mother_id` → "ID de madre", "Identificador de madre", "Código de madre", o "Madre"
  - `father_id`/`bull_id` → "ID de toro", "Identificador de toro", "Código de toro", o "Toro"
  - `insemination_identifier` → "ID de inseminación", "Identificador de inseminación", o "Código de inseminación"
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

