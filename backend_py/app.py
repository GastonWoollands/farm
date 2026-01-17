import logging
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from .routes import health, auth, registrations, admin, events, inseminations, father_assignment, animal_types, inseminations_ids, users, companies, user_context, chatbot, snapshots
from .db import init_pool, close_pool, get_conn

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Farm Backend", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(auth.router)
app.include_router(registrations.router)
app.include_router(admin.router)
app.include_router(events.router)
app.include_router(inseminations.router)
app.include_router(father_assignment.router)
app.include_router(animal_types.router)
app.include_router(inseminations_ids.router)
app.include_router(users.router, prefix="/users", tags=["users"])
app.include_router(companies.router, prefix="/companies", tags=["companies"])
app.include_router(user_context.router, prefix="/user-context", tags=["user-context"])
app.include_router(chatbot.router)
app.include_router(snapshots.router, tags=["snapshots"])


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Global exception handler to log all errors"""
    logger.error(f"Unhandled exception: {str(exc)}", exc_info=True)
    logger.error(f"Request URL: {request.url}")
    logger.error(f"Request method: {request.method}")
    return JSONResponse(
        status_code=500,
        content={"detail": f"Internal server error: {str(exc)}"}
    )


@app.on_event("startup")
async def startup_event():
    """Initialize database connection pool on application startup"""
    try:
        init_pool()
        # Verify pool works by getting a connection
        conn = get_conn()
        print(f"Database connection pool initialized successfully (min={5}, max={20})")
    except Exception as e:
        print(f"Failed to initialize database connection pool: {e}")
        raise


@app.on_event("shutdown")
async def shutdown_event():
    """Close database connection pool on application shutdown"""
    try:
        close_pool()
        print("Database connection pool closed successfully")
    except Exception as e:
        print(f"Error closing database connection pool: {e}")
