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

class DeleteBody(BaseModel):
    animalNumber: str
    createdAt: str | None = None

class ExecSqlBody(BaseModel):
    sql: str
    params: list | None = None


