import base64
import hashlib
from dataclasses import dataclass

from cryptography.fernet import Fernet
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.user import User, UserModelSettings
from app.schemas.model_settings import ModelSettingsResponse, ModelSettingsUpdate
from app.services.llm_client import LLMConfig


@dataclass(frozen=True)
class ResolvedModelConfig:
    provider: str
    base_url: str
    model: str
    api_key: str


def _fernet() -> Fernet:
    secret = get_settings().api_key_encryption_secret.encode("utf-8")
    key = base64.urlsafe_b64encode(hashlib.sha256(secret).digest())
    return Fernet(key)


def encrypt_api_key(api_key: str) -> str:
    return _fernet().encrypt(api_key.encode("utf-8")).decode("utf-8")


def decrypt_api_key(encrypted_api_key: str) -> str:
    return _fernet().decrypt(encrypted_api_key.encode("utf-8")).decode("utf-8")


def get_model_settings(db: Session, user: User) -> ModelSettingsResponse:
    user_settings = db.scalar(select(UserModelSettings).where(UserModelSettings.user_id == user.id))
    platform_available = bool(get_settings().model_api_key)
    if user_settings is None:
        settings = get_settings()
        return ModelSettingsResponse(
            provider=settings.model_provider,
            base_url=settings.model_base_url,
            model=settings.model_name,
            has_api_key=False,
            platform_available=platform_available,
        )

    return ModelSettingsResponse(
        provider=user_settings.provider,
        base_url=user_settings.base_url,
        model=user_settings.model,
        has_api_key=bool(user_settings.encrypted_api_key),
        platform_available=platform_available,
    )


def save_model_settings(db: Session, user: User, payload: ModelSettingsUpdate) -> ModelSettingsResponse:
    user_settings = db.scalar(select(UserModelSettings).where(UserModelSettings.user_id == user.id))
    if user_settings is None:
        user_settings = UserModelSettings(user_id=user.id)
        db.add(user_settings)

    user_settings.provider = payload.provider
    user_settings.base_url = payload.base_url
    user_settings.model = payload.model
    user_settings.encrypted_api_key = encrypt_api_key(payload.api_key)

    db.commit()
    db.refresh(user_settings)
    return get_model_settings(db, user)


def resolve_model_config(db: Session, user: User) -> ResolvedModelConfig:
    user_settings = db.scalar(select(UserModelSettings).where(UserModelSettings.user_id == user.id))
    if user_settings is not None and user_settings.encrypted_api_key:
        return ResolvedModelConfig(
            provider=user_settings.provider,
            base_url=user_settings.base_url,
            model=user_settings.model,
            api_key=decrypt_api_key(user_settings.encrypted_api_key),
        )

    settings = get_settings()
    if settings.model_api_key:
        return ResolvedModelConfig(
            provider=settings.model_provider,
            base_url=settings.model_base_url,
            model=settings.model_name,
            api_key=settings.model_api_key,
        )

    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="No model API key configured for user or platform",
    )


def test_model_connection(config: ResolvedModelConfig) -> dict[str, object]:
    llm_config = LLMConfig(
        provider=config.provider,
        base_url=config.base_url,
        model=config.model,
        api_key=config.api_key,
    )
    return {"ok": True, "provider": llm_config.provider, "model": llm_config.model}
