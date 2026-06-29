from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class PracticeSessionCreate(BaseModel):
    bank_id: int
    mode: str = Field(default="normal", min_length=1, max_length=32)
    question_count: int = Field(default=1, ge=1)


class PracticeAnswerCreate(BaseModel):
    question_id: int
    user_answer: Any
    elapsed_seconds: int = Field(default=0, ge=0)


class PracticeAnswerResponse(BaseModel):
    id: int
    session_id: int
    question_id: int
    user_answer_json: dict[str, Any]
    is_correct: bool
    feedback: str | None = None
    elapsed_seconds: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PracticeSessionResponse(BaseModel):
    id: int
    user_id: int
    bank_id: int
    mode: str
    question_count: int
    started_at: datetime
    finished_at: datetime | None
    score: int
    accuracy: int
    answers: list[PracticeAnswerResponse]

    model_config = ConfigDict(from_attributes=True)


class WrongQuestionResponse(BaseModel):
    id: int
    user_id: int
    question_id: int
    wrong_count: int
    last_wrong_at: datetime | None
    mastery_status: str
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class DailyActivity(BaseModel):
    date: str
    session_count: int
    question_count: int
    correct_count: int
    elapsed_seconds: int


class ActivityStatsResponse(BaseModel):
    days: int
    total_sessions: int
    total_questions: int
    total_correct: int
    total_elapsed_seconds: int
    daily: list[DailyActivity]
