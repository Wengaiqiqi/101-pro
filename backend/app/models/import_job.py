from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, Integer, JSON, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class ImportJob(Base):
    __tablename__ = "import_jobs"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    bank_id: Mapped[int] = mapped_column(ForeignKey("question_banks.id", ondelete="CASCADE"), index=True)
    original_filename: Mapped[str] = mapped_column(String(255))
    stored_path: Mapped[str] = mapped_column(String(1000))
    mime_type: Mapped[str] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(32), default="pending", server_default="pending")
    progress: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    generation_config: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, server_default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, server_default=func.now())

    user: Mapped["User"] = relationship()
    bank: Mapped["QuestionBank"] = relationship()
    chunks: Mapped[list["ImportJobChunk"]] = relationship(
        back_populates="import_job",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    drafts: Mapped[list["ImportedQuestionDraft"]] = relationship(
        back_populates="import_job",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class ImportJobChunk(Base):
    __tablename__ = "import_job_chunks"
    __table_args__ = (
        UniqueConstraint("import_job_id", "chunk_index", name="uq_import_job_chunks_job_index"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    import_job_id: Mapped[int] = mapped_column(ForeignKey("import_jobs.id", ondelete="CASCADE"), index=True)
    chunk_index: Mapped[int] = mapped_column(Integer)
    text: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(32), default="pending", server_default="pending")
    raw_model_output: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, server_default=func.now())

    import_job: Mapped[ImportJob] = relationship(back_populates="chunks")
    drafts: Mapped[list["ImportedQuestionDraft"]] = relationship(back_populates="source_chunk", passive_deletes=True)


class ImportedQuestionDraft(Base):
    __tablename__ = "imported_question_drafts"

    id: Mapped[int] = mapped_column(primary_key=True)
    import_job_id: Mapped[int] = mapped_column(ForeignKey("import_jobs.id", ondelete="CASCADE"), index=True)
    source_chunk_id: Mapped[int | None] = mapped_column(ForeignKey("import_job_chunks.id", ondelete="SET NULL"), nullable=True, index=True)
    type: Mapped[str] = mapped_column(String(32))
    stem: Mapped[str] = mapped_column(Text)
    options_json: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list, server_default="[]")
    answer_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, server_default="{}")
    explanation: Mapped[str] = mapped_column(Text, default="", server_default="")
    difficulty: Mapped[str] = mapped_column(String(32), default="normal", server_default="normal")
    tags: Mapped[list[str]] = mapped_column(JSON, default=list, server_default="[]")
    status: Mapped[str] = mapped_column(String(32), default="pending", server_default="pending")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, server_default=func.now())

    import_job: Mapped[ImportJob] = relationship(back_populates="drafts")
    source_chunk: Mapped[ImportJobChunk | None] = relationship(back_populates="drafts")
