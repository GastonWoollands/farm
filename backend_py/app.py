from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .routes import health, auth, registrations, admin, events, inseminations, father_assignment, animal_types, inseminations_ids

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


