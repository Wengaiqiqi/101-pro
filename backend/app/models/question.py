from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, JSON, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class QuestionBank(Base):
    __tablename__ = "question_banks"

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="", server_default="")
    visibility: Mapped[str] = mapped_column(String(32), default="private", server_default="private")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, server_default=func.now())

    owner: Mapped["User"] = relationship()
    questions: Mapped[list["Question"]] = relationship(
        back_populates="bank",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class Question(Base):
    __tablename__ = "questions"

    id: Mapped[int] = mapped_column(primary_key=True)
    bank_id: Mapped[int] = mapped_column(ForeignKey("question_banks.id", ondelete="CASCADE"), index=True)
    type: Mapped[str] = mapped_column(String(32))
    stem: Mapped[str] = mapped_column(Text)
    answer_text: Mapped[str] = mapped_column(Text)
    explanation: Mapped[str] = mapped_column(Text, default="", server_default="")
    difficulty: Mapped[str] = mapped_column(String(32), default="normal", server_default="normal")
    tags: Mapped[list[str]] = mapped_column(JSON, default=list, server_default="[]")
    source: Mapped[str] = mapped_column(String(255), default="", server_default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, server_default=func.now())

    bank: Mapped[QuestionBank] = relationship(back_populates="questions")
    options: Mapped[list["QuestionOption"]] = relationship(
        back_populates="question",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class QuestionOption(Base):
    __tablename__ = "question_options"
    __table_args__ = (
        UniqueConstraint("question_id", "label", name="uq_question_options_question_label"),
        UniqueConstraint("question_id", "sort_order", name="uq_question_options_question_sort_order"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    question_id: Mapped[int] = mapped_column(ForeignKey("questions.id", ondelete="CASCADE"), index=True)
    label: Mapped[str] = mapped_column(String(16))
    content: Mapped[str] = mapped_column(Text)
    is_correct: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    sort_order: Mapped[int] = mapped_column(Integer, default=0, server_default="0")

    question: Mapped[Question] = relationship(back_populates="options")
