# LiveStock - Farm Management System

A complete farm management solution for tracking cattle registrations, metrics, and objectives.

## Description

LiveStock is a full-stack application designed for farm owners to manage their cattle inventory. It provides offline-capable registration, real-time metrics tracking, search functionality, and goal setting for farm operations.

## Project Structure

```
farm/
├── backend_py/           # FastAPI backend service
│   ├── app.py           # FastAPI application setup
│   ├── main.py          # Server entry point
│   ├── models.py        # Data models
│   ├── db.py            # Database operations
│   ├── config.py        # Configuration
│   ├── requirements.txt # Python dependencies
│   └── routes/          # API endpoints
├── frontend/            # Progressive Web Application
│   ├── index.html       # Main application
│   ├── styles.css       # Styling
│   ├── app.js          # Core logic
│   ├── manifest.json    # PWA configuration
│   └── app/            # JavaScript modules
├── data/               # Data storage directory
├── pyproject.toml      # Python project configuration
└── poetry.lock         # Dependency lock file
```

## Architecture

### Backend (Python/FastAPI)
- **RESTful API** for data management
- **Firebase Integration** for authentication and cloud storage
- **CORS Support** for frontend communication
- **Health Monitoring** endpoints

### Frontend (Vanilla JS/PWA)
- **Progressive Web App** with offline capabilities
- **IndexedDB** for local data storage
- **Firebase Authentication** for user management
- **Responsive Design** for mobile and desktop

## Dependencies

### Backend Dependencies
- FastAPI (0.115.0) - Web framework
- Uvicorn (0.30.6) - ASGI server
- Firebase Admin (6.5.0) - Firebase SDK

### Frontend Dependencies
- Firebase SDK - Authentication and database
- IndexedDB - Local storage
- Service Worker - Offline functionality

## Features

### Core Functionality
- **Animal Registration** - Add cows with detailed information
- **Search & Edit** - Find and modify existing records
- **Metrics Dashboard** - Real-time farm statistics
- **Objectives Tracking** - Set and monitor annual goals
- **Offline Support** - Works without internet connection
- **Data Synchronization** - Automatic cloud backup

### User Interface
- **Responsive Design** - Mobile and desktop friendly
- **Spanish Localization** - Full Spanish interface
- **Clean UI** - Minimalist, Apple-inspired design
- **Progressive Web App** - Installable on mobile devices

## Getting Started

### Prerequisites
- Python 3.10+
- Modern web browser
- Firebase project setup

### Backend Setup
```bash
cd backend_py
pip install -r requirements.txt
uvicorn main:app --reload
```

### Frontend Setup
```bash
cd frontend
# Serve with any static server
python -m http.server 8000
```

### Configuration
1. Set up Firebase project
2. Configure authentication
3. Update `frontend/config.js` with Firebase credentials
4. Set environment variables for backend

## API Endpoints

- `GET /health` - Health check
- `POST /auth/login` - User authentication
- `GET /registrations` - List animals
- `POST /registrations` - Create animal
- `PUT /registrations/{id}` - Update animal
- `DELETE /registrations/{id}` - Delete animal

## Database Schema

The system uses SQLite with a multi-tenant architecture. For complete database schema documentation, see [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md).

### Core Tables

1. **companies** - Company/organization information for multi-tenant data isolation
2. **users** - User accounts linked to Firebase authentication
3. **registrations** - Animal registration/birth records
4. **inseminations** - Artificial insemination records
5. **inseminations_ids** - Insemination round/period definitions
6. **events_state** - Audit log tracking all changes
7. **animal_types** - Lookup table for animal classifications
8. **roles** - Role definitions and permissions

### Key Relationships

- **Companies** → **Users** (one-to-many)
- **Companies** → **Registrations** (one-to-many)
- **Companies** → **Inseminations** (one-to-many)
- **Registrations** → **Events** (one-to-many)
- **Inseminations** ↔ **Registrations** (logical via mother_id and insemination_identifier)

### Multi-Tenant Architecture

All major tables include a `company_id` column for data isolation:
- Data is filtered by company_id at the application level
- Users must belong to a company to access company-specific data
- Legacy users (without company_id) can only access their own data

### Schema Files

- **DATABASE_SCHEMA.md** - Human-readable database documentation
- **database_schema.json** - Machine-readable schema for LLM consumption

## Data Model

### Animal Registration
- Animal ID (unique identifier)
- Mother ID (optional)
- Father ID (optional)
- Birth date
- Weight
- Gender (Male/Female/Unknown)
- Status (Alive/Dead/Unknown)
- Color (Colorado/Negro/Otros)
- Notes

## Deployment

### Backend
Deploy to any Python hosting service (Heroku, Railway, DigitalOcean)

### Frontend
Deploy to static hosting (Vercel, Netlify, GitHub Pages)

## License

This project is for farm management purposes.
