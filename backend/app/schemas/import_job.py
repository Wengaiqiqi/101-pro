from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, model_validator


class ImportJobResponse(BaseModel):
    id: int
    user_id: int
    bank_id: int
    original_filename: str
    mime_type: str
    status: str
    progress: int
    error_message: str | None
    generation_config: dict[str, Any]
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ImportJobChunkResponse(BaseModel):
    id: int
    import_job_id: int
    chunk_index: int
    text: str
    status: str
    raw_model_output: dict[str, Any] | None
    error_message: str | None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ImportedQuestionDraftResponse(BaseModel):
    id: int
    import_job_id: int
    source_chunk_id: int | None
    type: str
    stem: str
    options_json: list[dict[str, Any]]
    answer_json: dict[str, Any]
    explanation: str
    difficulty: str
    tags: list[str]
    status: str
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ImportedQuestionDraftUpdate(BaseModel):
    type: str | None = Field(default=None, min_length=1, max_length=32)
    stem: str | None = Field(default=None, min_length=1)
    options_json: list[dict[str, Any]] | None = None
    answer_json: dict[str, Any] | None = None
    explanation: str | None = None
    difficulty: str | None = Field(default=None, min_length=1, max_length=32)
    tags: list[str] | None = None
    status: str | None = Field(default=None, min_length=1, max_length=32)

    @model_validator(mode="before")
    @classmethod
    def reject_null_updates(cls, data: Any) -> Any:
        if isinstance(data, dict):
            update_fields = {
                "type",
                "stem",
                "options_json",
                "answer_json",
                "explanation",
                "difficulty",
                "tags",
                "status",
            }
            null_fields = update_fields.intersection(field for field, value in data.items() if value is None)
            if null_fields:
                fields = ", ".join(sorted(null_fields))
                raise ValueError(f"Update fields cannot be null: {fields}")
        return data


class ImportPublishResponse(BaseModel):
    published_count: int
    question_ids: list[int]
