from datetime import datetime
from typing import Any

import re

from pydantic import BaseModel, ConfigDict, Field, model_validator


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
    correct_answer_text: str | None = None
    correct_option_labels: list[str] = Field(default_factory=list)
    explanation: str = ""
    elapsed_seconds: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

    @model_validator(mode="before")
    @classmethod
    def attach_answer_reveal(cls, value: Any) -> Any:
        if isinstance(value, dict):
            return value
        question = getattr(value, "question", None)
        if question is None:
            return value
        question_type = str(getattr(question, "type", ""))
        answer_text = str(getattr(question, "answer_text", ""))
        labels = (
            [part for part in re.split(r"[\s,|]+", answer_text) if part]
            if question_type in {"single_choice", "multiple_choice", "true_false"}
            else []
        )
        return {
            "id": value.id,
            "session_id": value.session_id,
            "question_id": value.question_id,
            "user_answer_json": value.user_answer_json,
            "is_correct": value.is_correct,
            "feedback": value.feedback,
            "correct_answer_text": answer_text,
            "correct_option_labels": labels,
            "explanation": str(getattr(question, "explanation", "")),
            "elapsed_seconds": value.elapsed_seconds,
            "created_at": value.created_at,
        }


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
