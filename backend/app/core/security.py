import base64
import hashlib
import hmac
import json
import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

logger = logging.getLogger(__name__)

try:
    from jose import jwt
    from jose.exceptions import JWTError
except ModuleNotFoundError:  # pragma: no cover - exercised only in minimal local envs
    jwt = None

    class JWTError(Exception):
        pass

try:
    import bcrypt as _bcrypt
except ModuleNotFoundError:  # pragma: no cover - exercised only in minimal local envs
    _bcrypt = None

from app.core.config import get_settings


def _allow_crypto_fallback() -> bool:
    return get_settings().is_development_like()


def _require_crypto_fallback_allowed(dependency: str) -> None:
    if not _allow_crypto_fallback():
        raise RuntimeError(f"{dependency} is required outside development/test environments")


def _b64encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64decode(data: str) -> bytes:
    padding = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode((data + padding).encode("ascii"))


def _sign(data: str, secret: str) -> str:
    signature = hmac.new(secret.encode("utf-8"), data.encode("ascii"), hashlib.sha256).digest()
    return _b64encode(signature)


def hash_password(password: str) -> str:
    if _bcrypt is not None:
        return _bcrypt.hashpw(password.encode("utf-8"), _bcrypt.gensalt()).decode("utf-8")
    _require_crypto_fallback_allowed("bcrypt")
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("ascii"), 200_000)
    return f"pbkdf2_sha256${salt}${_b64encode(digest)}"


def verify_password(password: str, password_hash: str) -> bool:
    if _bcrypt is not None:
        try:
            return _bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
        except Exception:
            return False
    _require_crypto_fallback_allowed("bcrypt")
    try:
        algorithm, salt, expected = password_hash.split("$", 2)
    except ValueError:
        return False
    if algorithm != "pbkdf2_sha256":
        return False
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("ascii"), 200_000)
    return hmac.compare_digest(_b64encode(digest), expected)


def create_access_token(subject: str, password_version: int = 1) -> str:
    settings = get_settings()
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_expire_minutes)
    payload: dict[str, Any] = {
        "sub": subject,
        "exp": int(expires_at.timestamp()),
        "pwd_ver": password_version,
    }
    if jwt is not None:
        return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)

    _require_crypto_fallback_allowed("python-jose")
    if settings.jwt_secret_key == "change-me-in-development":
        logger.warning("Using default JWT secret! Set JWT_SECRET_KEY environment variable.")
    header = {"alg": "HS256", "typ": "JWT"}
    signing_input = ".".join(
        [
            _b64encode(json.dumps(header, separators=(",", ":")).encode("utf-8")),
            _b64encode(json.dumps(payload, separators=(",", ":")).encode("utf-8")),
        ]
    )
    return f"{signing_input}.{_sign(signing_input, settings.jwt_secret_key)}"


def decode_access_token(token: str) -> dict[str, Any]:
    settings = get_settings()
    if jwt is not None:
        return jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])

    _require_crypto_fallback_allowed("python-jose")
    try:
        header, payload, signature = token.split(".", 2)
    except ValueError as exc:
        raise JWTError("Invalid token") from exc
    signing_input = f"{header}.{payload}"
    if not hmac.compare_digest(_sign(signing_input, settings.jwt_secret_key), signature):
        raise JWTError("Invalid signature")
    decoded = json.loads(_b64decode(payload))
    expires_at = decoded.get("exp")
    if not isinstance(expires_at, int):
        raise JWTError("Token missing expiration")
    if expires_at < int(datetime.now(timezone.utc).timestamp()):
        raise JWTError("Token expired")
    return decoded
