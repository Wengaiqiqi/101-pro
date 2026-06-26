import base64
import hashlib
import hmac
import json
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

try:
    from jose import jwt
    from jose.exceptions import JWTError
except ModuleNotFoundError:  # pragma: no cover - exercised only in minimal local envs
    jwt = None

    class JWTError(Exception):
        pass

try:
    from passlib.context import CryptContext
except ModuleNotFoundError:  # pragma: no cover - exercised only in minimal local envs
    CryptContext = None

from app.core.config import get_settings

password_context = CryptContext(schemes=["bcrypt"], deprecated="auto") if CryptContext else None


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
    if password_context is not None:
        return password_context.hash(password)
    _require_crypto_fallback_allowed("passlib")
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("ascii"), 200_000)
    return f"pbkdf2_sha256${salt}${_b64encode(digest)}"


def verify_password(password: str, password_hash: str) -> bool:
    if password_context is not None:
        return password_context.verify(password, password_hash)
    _require_crypto_fallback_allowed("passlib")
    try:
        algorithm, salt, expected = password_hash.split("$", 2)
    except ValueError:
        return False
    if algorithm != "pbkdf2_sha256":
        return False
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("ascii"), 200_000)
    return hmac.compare_digest(_b64encode(digest), expected)


def create_access_token(subject: str) -> str:
    settings = get_settings()
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_expire_minutes)
    payload: dict[str, Any] = {"sub": subject, "exp": int(expires_at.timestamp())}
    if jwt is not None:
        return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)

    _require_crypto_fallback_allowed("python-jose")
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
