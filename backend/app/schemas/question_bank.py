from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, model_validator


class QuestionBankCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str = ""


class QuestionBankUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    visibility: str | None = Field(default=None, min_length=1, max_length=32)

    @model_validator(mode="before")
    @classmethod
    def reject_null_updates(cls, data: Any) -> Any:
        if isinstance(data, dict):
            null_fields = {"name", "description", "visibility"}.intersection(
                field for field, value in data.items() if value is None
            )
            if null_fields:
                fields = ", ".join(sorted(null_fields))
                raise ValueError(f"Update fields cannot be null: {fields}")
        return data


class QuestionBankResponse(BaseModel):
    id: int
    owner_id: int
    name: str
    description: str
    visibility: str
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
