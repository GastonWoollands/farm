from pydantic import BaseModel

class ValidateKeyBody(BaseModel):
    key: str

class RegisterBody(BaseModel):
    animalNumber: str
    createdAt: str | None = None
    motherId: str | None = None
    bornDate: str | None = None
    weight: float | None = None
    gender: str | None = None
    status: str | None = None
    color: str | None = None
    notes: str | None = None
    notesMother: str | None = None

class UpdateBody(BaseModel):
    animalNumber: str
    createdAt: str
    motherId: str | None = None
    bornDate: str | None = None
    weight: float | None = None
    gender: str | None = None
    status: str | None = None
    color: str | None = None
    notes: str | None = None
    notesMother: str | None = None
    
    class Config:
        # Allow extra fields and be more lenient with validation
        extra = "ignore"
        validate_assignment = True

class DeleteBody(BaseModel):
    animalNumber: str
    createdAt: str | None = None

class ExecSqlBody(BaseModel):
    sql: str
    params: list | None = None

class EventState(BaseModel):
    id: int | None = None
    animal_id: int
    animal_number: str
    event_type: str
    modified_field: str | None = None
    old_value: str | None = None
    new_value: str | None = None
    user_id: str
    event_date: str
    notes: str | None = None


