# Backend API - Contando vacas

FastAPI backend service for the Contando vacas farm management application.

## Description

RESTful API that handles authentication, animal registrations, and data management for the farm tracking system. Built with FastAPI and Firebase integration.

## Dependencies

### Core Dependencies
- **FastAPI** (0.115.0) - Modern web framework for building APIs
- **Uvicorn** (0.30.6) - ASGI server for running the FastAPI application
- **Firebase Admin** (6.5.0) - Firebase SDK for server-side operations

### Installation
```bash
pip install -r requirements.txt
```

## File Structure

```
backend_py/
├── app.py              # FastAPI application setup and CORS configuration
├── main.py             # Application entry point
├── config.py           # Configuration settings
├── db.py               # Database connection and operations
├── models.py           # Pydantic models for data validation
├── requirements.txt    # Python dependencies
└── routes/             # API route modules
    ├── health.py       # Health check endpoints
    ├── auth.py        # Authentication endpoints
    ├── registrations.py # Animal registration CRUD operations
    └── admin.py       # Administrative functions
```

## File Interactions

### Core Files
- **`app.py`** - Main FastAPI app with CORS middleware and route registration
- **`main.py`** - Entry point that runs the server
- **`config.py`** - Environment variables and configuration
- **`db.py`** - Database connection and CRUD operations
- **`models.py`** - Data models for request/response validation

### Route Modules
- **`health.py`** - Health check endpoints (`/health`)
- **`auth.py`** - Authentication endpoints (`/auth/*`)
- **`registrations.py`** - Animal registration endpoints (`/registrations/*`)
- **`admin.py`** - Admin functions (`/admin/*`)

## API Endpoints

- `GET /health` - Health check
- `POST /auth/login` - User authentication
- `GET /registrations` - List animal registrations
- `POST /registrations` - Create new registration
- `PUT /registrations/{id}` - Update registration
- `DELETE /registrations/{id}` - Delete registration

## Running the Server

```bash
# Development
uvicorn main:app --reload --host 0.0.0.0 --port 8000

# Production
uvicorn main:app --host 0.0.0.0 --port 8000
```

## Environment Variables

- `FIREBASE_PROJECT_ID` - Firebase project identifier
- `FIREBASE_PRIVATE_KEY` - Firebase service account private key
- `FIREBASE_CLIENT_EMAIL` - Firebase service account email
