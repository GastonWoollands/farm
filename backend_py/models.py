from pydantic import BaseModel
from typing import Optional, List

class ValidateKeyBody(BaseModel):
    key: str

class RegisterBody(BaseModel):
    animalNumber: str
    createdAt: str | None = None
    motherId: str | None = None
    fatherId: str | None = None
    bornDate: str | None = None
    weight: float | None = None
    gender: str | None = None
    animalType: int | None = None
    status: str | None = None
    color: str | None = None
    notes: str | None = None
    notesMother: str | None = None
    inseminationRoundId: str | None = None
    inseminationIdentifier: str | None = None
    scrotalCircumference: float | None = None
    prAnimal: str | None = None
    prMother: str | None = None
    motherWeight: float | None = None

class UpdateBody(BaseModel):
    animalNumber: str
    createdAt: str
    motherId: str | None = None
    fatherId: str | None = None
    bornDate: str | None = None
    weight: float | None = None
    gender: str | None = None
    animalType: int | None = None
    status: str | None = None
    color: str | None = None
    notes: str | None = None
    notesMother: str | None = None
    inseminationRoundId: str | None = None
    inseminationIdentifier: str | None = None
    scrotalCircumference: float | None = None
    prAnimal: str | None = None
    prMother: str | None = None
    motherWeight: float | None = None
    
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

class InseminationBody(BaseModel):
    inseminationIdentifier: str
    inseminationRoundId: str
    motherId: str
    motherVisualId: str | None = None
    bullId: str | None = None
    inseminationDate: str
    animalType: str | None = None
    notes: str | None = None

class UpdateInseminationBody(BaseModel):
    inseminationIdentifier: str
    inseminationRoundId: str
    motherId: str
    motherVisualId: str | None = None
    bullId: str | None = None
    inseminationDate: str
    animalType: str | None = None
    notes: str | None = None
    
    class Config:
        extra = "ignore"
        validate_assignment = True

class DeleteInseminationBody(BaseModel):
    inseminationId: int | None = None
    motherId: str | None = None
    inseminationDate: str | None = None


class InseminationId(BaseModel):
    id: int
    insemination_round_id: str
    initial_date: str
    end_date: str
    notes: str | None = None
    created_at: str | None = None
    updated_at: str | None = None


class InseminationIdBody(BaseModel):
    insemination_round_id: str
    initial_date: str
    end_date: str
    notes: str | None = None


class UpdateInseminationIdBody(BaseModel):
    insemination_round_id: str | None = None
    initial_date: str | None = None
    end_date: str | None = None
    notes: str | None = None


# Multi-tenant models
class CompanyBody(BaseModel):
    name: str
    description: str | None = None

class UserBody(BaseModel):
    firebase_uid: str
    email: str
    display_name: str | None = None
    company_id: int | None = None
    role: str = "admin"

class AssignUserToCompanyBody(BaseModel):
    user_id: int
    company_id: int

class UpdateUserRoleBody(BaseModel):
    user_id: int
    role: str

class UserResponse(BaseModel):
    id: int
    firebase_uid: str
    email: str
    display_name: str | None
    company_id: int | None
    role: str
    company_name: str | None = None

class CompanyResponse(BaseModel):
    id: int
    name: str
    description: str | None
    created_at: str
    is_active: bool
    user_count: int = 0

class AuthContextResponse(BaseModel):
    user: UserResponse
    company_id: int | None
    has_company: bool
    permissions: dict


