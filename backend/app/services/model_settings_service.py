import base64
import hashlib
import logging
from dataclasses import dataclass

from cryptography.fernet import Fernet
from app.core.exceptions import BadRequestError
from app.core.validators import validate_base_url
from sqlalchemy.exc import IntegrityError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.global_settings import GlobalSettings
from app.models.user import User, UserModelSettings
from app.schemas.model_settings import ModelSettingsResponse, ModelSettingsUpdate
from app.services.llm_client import LLMConfig

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class ResolvedModelConfig:
    provider: str
    base_url: str
    model: str
    api_key: str


_fernet_instance: Fernet | None = None


def _fernet() -> Fernet:
    global _fernet_instance
    if _fernet_instance is None:
        secret = get_settings().api_key_encryption_secret.encode("utf-8")
        key = base64.urlsafe_b64encode(hashlib.sha256(secret).digest())
        _fernet_instance = Fernet(key)
    return _fernet_instance


def encrypt_api_key(api_key: str) -> str:
    return _fernet().encrypt(api_key.encode("utf-8")).decode("utf-8")


def decrypt_api_key(encrypted_api_key: str) -> str:
    return _fernet().decrypt(encrypted_api_key.encode("utf-8")).decode("utf-8")


def _get_global_setting(db: Session, key: str) -> str:
    row = db.scalar(select(GlobalSettings).where(GlobalSettings.key == key))
    return row.value if row else ""


def _get_global_settings_batch(db: Session, keys: list[str]) -> dict[str, str]:
    """Fetch multiple global settings in a single query."""
    rows = db.execute(
        select(GlobalSettings).where(GlobalSettings.key.in_(keys))
    ).scalars().all()
    return {row.key: row.value for row in rows}


def get_model_settings(db: Session, user: User) -> ModelSettingsResponse:
    user_settings = db.scalar(select(UserModelSettings).where(UserModelSettings.user_id == user.id))
    platform_available = bool(get_settings().model_api_key)
    if user_settings is None:
        # Fall back to global admin settings, then platform env
        global_provider = _get_global_setting(db, "model_provider")
        global_base_url = _get_global_setting(db, "model_base_url")
        global_model = _get_global_setting(db, "model_name")
        global_has_key = bool(_get_global_setting(db, "model_api_key"))
        if global_has_key:
            return ModelSettingsResponse(
                provider=global_provider,
                base_url=global_base_url,
                model=global_model,
                has_api_key=False,
                platform_available=True,
                using_global=True,
            )
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
        if payload.api_key is None:
            raise BadRequestError("首次配置需要提供 API Key")
        user_settings = UserModelSettings(user_id=user.id)
        db.add(user_settings)

    validate_base_url(payload.base_url.strip())
    user_settings.provider = payload.provider.strip()
    user_settings.base_url = payload.base_url.strip().rstrip("/")
    user_settings.model = payload.model.strip()
    if payload.api_key is not None:
        user_settings.encrypted_api_key = encrypt_api_key(payload.api_key.strip())

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        user_settings = db.scalar(select(UserModelSettings).where(UserModelSettings.user_id == user.id))
        if user_settings is None:
            raise
        user_settings.provider = payload.provider.strip()
        user_settings.base_url = payload.base_url.strip().rstrip("/")
        user_settings.model = payload.model.strip()
        if payload.api_key is not None:
            user_settings.encrypted_api_key = encrypt_api_key(payload.api_key.strip())
        db.commit()
    db.refresh(user_settings)
    return get_model_settings(db, user)


def resolve_model_config(db: Session, user: User) -> ResolvedModelConfig:
    user_settings = db.scalar(select(UserModelSettings).where(UserModelSettings.user_id == user.id))
    if user_settings is not None and user_settings.encrypted_api_key:
        validate_base_url(user_settings.base_url)
        return ResolvedModelConfig(
            provider=user_settings.provider,
            base_url=user_settings.base_url,
            model=user_settings.model,
            api_key=decrypt_api_key(user_settings.encrypted_api_key),
        )

    # Fall back to global admin settings (single batch query)
    global_settings = _get_global_settings_batch(db, ["model_api_key", "model_provider", "model_base_url", "model_name"])
    global_api_key = global_settings.get("model_api_key", "")
    if global_api_key:
        try:
            decrypted = decrypt_api_key(global_api_key)
        except Exception as e:
            logger.warning(f"Failed to decrypt global API key: {e}")
            decrypted = None

        if decrypted:
            global_base_url = global_settings.get("model_base_url", "")
            validate_base_url(global_base_url)
            return ResolvedModelConfig(
                provider=global_settings.get("model_provider", ""),
                base_url=global_base_url,
                model=global_settings.get("model_name", ""),
                api_key=decrypted,
            )

    settings = get_settings()
    if settings.model_api_key:
        validate_base_url(settings.model_base_url)
        return ResolvedModelConfig(
            provider=settings.model_provider,
            base_url=settings.model_base_url,
            model=settings.model_name,
            api_key=settings.model_api_key,
        )

    raise BadRequestError("未配置模型 API Key，请先在引擎设置中配置")


def test_model_connection(config: ResolvedModelConfig) -> dict[str, object]:
    validate_base_url(config.base_url)
    llm_config = LLMConfig(
        provider=config.provider,
        base_url=config.base_url,
        model=config.model,
        api_key=config.api_key,
    )
    try:
        import httpx
    except ModuleNotFoundError as exc:
        if get_settings().is_development_like():
            return {
                "ok": False,
                "provider": llm_config.provider,
                "model": llm_config.model,
                "message": "httpx is not installed; connection test was not executed",
            }
        raise RuntimeError("httpx is required to test model connections") from exc

    url = f"{llm_config.base_url.rstrip('/')}/chat/completions"
    try:
        response = httpx.post(
            url,
            headers={"Authorization": f"Bearer {llm_config.api_key}"},
            json={
                "model": llm_config.model,
                "messages": [{"role": "user", "content": "Reply with ok."}],
                "max_tokens": 16,
            },
            timeout=15,
        )
        response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        return {
            "ok": False,
            "provider": llm_config.provider,
            "model": llm_config.model,
            "message": f"Provider returned HTTP {exc.response.status_code}",
        }
    except httpx.HTTPError:
        return {
            "ok": False,
            "provider": llm_config.provider,
            "model": llm_config.model,
            "message": "Could not connect to model provider",
        }
    return {"ok": True, "provider": llm_config.provider, "model": llm_config.model}
