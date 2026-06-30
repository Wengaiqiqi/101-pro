from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    nickname: Mapped[str] = mapped_column(String(80), default="", server_default="")
    avatar_url: Mapped[str | None] = mapped_column(String(500), nullable=True, default=None)
    role: Mapped[str] = mapped_column(String(32), default="user", server_default="user")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    password_version: Mapped[int] = mapped_column(Integer, default=1, server_default="1")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), server_default=func.now())

    model_settings: Mapped["UserModelSettings | None"] = relationship(back_populates="user", passive_deletes=True)


class UserModelSettings(Base):
    __tablename__ = "user_model_settings"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True, index=True)
    provider: Mapped[str] = mapped_column(String(80))
    base_url: Mapped[str] = mapped_column(String(500))
    model: Mapped[str] = mapped_column(String(160))
    encrypted_api_key: Mapped[str] = mapped_column(String(2000))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), server_default=func.now())

    user: Mapped[User] = relationship(back_populates="model_settings")
