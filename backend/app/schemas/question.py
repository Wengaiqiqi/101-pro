from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class QuestionOptionCreate(BaseModel):
    label: str = Field(min_length=1, max_length=16)
    content: str = Field(min_length=1)
    is_correct: bool = False
    sort_order: int = 0


class QuestionOptionResponse(BaseModel):
    id: int
    label: str
    content: str
    is_correct: bool
    sort_order: int

    model_config = ConfigDict(from_attributes=True)


class QuestionCreate(BaseModel):
    type: str = Field(min_length=1, max_length=32)
    stem: str = Field(min_length=1)
    answer_text: str = Field(min_length=1)
    explanation: str = ""
    difficulty: str = Field(default="normal", min_length=1, max_length=32)
    tags: list[str] = Field(default_factory=list)
    source: str = Field(default="", max_length=255)
    options: list[QuestionOptionCreate] = Field(default_factory=list)


class QuestionUpdate(BaseModel):
    type: str | None = Field(default=None, min_length=1, max_length=32)
    stem: str | None = Field(default=None, min_length=1)
    answer_text: str | None = Field(default=None, min_length=1)
    explanation: str | None = None
    difficulty: str | None = Field(default=None, min_length=1, max_length=32)
    tags: list[str] | None = None
    source: str | None = Field(default=None, max_length=255)
    options: list[QuestionOptionCreate] | None = None


class QuestionResponse(BaseModel):
    id: int
    bank_id: int
    type: str
    stem: str
    answer_text: str
    explanation: str
    difficulty: str
    tags: list[str]
    source: str
    created_at: datetime
    updated_at: datetime
    options: list[QuestionOptionResponse]

    model_config = ConfigDict(from_attributes=True)
