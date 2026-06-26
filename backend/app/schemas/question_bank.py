from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class QuestionBankCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str = ""


class QuestionBankUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    visibility: str | None = Field(default=None, min_length=1, max_length=32)


class QuestionBankResponse(BaseModel):
    id: int
    owner_id: int
    name: str
    description: str
    visibility: str
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
