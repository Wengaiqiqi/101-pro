import os
import uuid
from pathlib import Path

from fastapi import UploadFile
from sqlalchemy.orm import Session

from app.core.exceptions import BadRequestError
from app.models.user import User
from app.schemas.user import UserUpdate

ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp"}
MAX_AVATAR_SIZE = 5 * 1024 * 1024  # 5MB

# Magic bytes for image type detection
MAGIC_BYTES = {
    b"\x89PNG": ".png",
    b"\xff\xd8\xff": ".jpg",
    b"GIF8": ".gif",
    b"RIFF": ".webp",
}


def _get_avatar_dir() -> Path:
    """Get avatar directory, creating it if needed."""
    avatar_dir = Path("uploads/avatars")
    avatar_dir.mkdir(parents=True, exist_ok=True)
    return avatar_dir


def _detect_image_type(content: bytes) -> str | None:
    """Detect image type from magic bytes."""
    for magic, ext in MAGIC_BYTES.items():
        if content[:len(magic)] == magic:
            return ext
    return None


def update_user_profile(db: Session, user: User, payload: UserUpdate) -> User:
    if payload.nickname is not None:
        user.nickname = payload.nickname
    if payload.avatar_url is not None:
        if payload.avatar_url != "" and not payload.avatar_url.startswith("/uploads/"):
            raise BadRequestError("无效的头像 URL")
        user.avatar_url = payload.avatar_url
    db.commit()
    db.refresh(user)
    return user


def change_password(db: Session, user: User, old_password: str, new_password: str) -> None:
    from app.core.security import hash_password, verify_password
    from app.core.validators import validate_password_strength
    from app.core.exceptions import BadRequestError
    if not verify_password(old_password, user.password_hash):
        raise BadRequestError("原密码错误")
    validate_password_strength(new_password)
    user.password_hash = hash_password(new_password)
    user.password_version = (user.password_version or 1) + 1
    db.commit()


async def upload_avatar(db: Session, user: User, file: UploadFile) -> User:
    # Validate file extension
    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise BadRequestError(f"不支持的文件格式，仅支持: {', '.join(ALLOWED_EXTENSIONS)}")

    # Read and validate size
    content = await file.read()
    if len(content) > MAX_AVATAR_SIZE:
        raise BadRequestError("头像文件大小不能超过 5MB")

    # Verify file content is a valid image
    detected_ext = _detect_image_type(content)
    if detected_ext is None:
        raise BadRequestError("无法识别的图片格式")

    # Generate unique filename with correct extension
    filename = f"{user.id}_{uuid.uuid4().hex}{detected_ext}"
    filepath = _get_avatar_dir() / filename

    # Save file
    filepath.write_bytes(content)

    # Delete old avatar file if it exists
    if user.avatar_url and user.avatar_url.startswith("/uploads/avatars/"):
        old_filename = user.avatar_url.split("/")[-1]
        old_filepath = _get_avatar_dir() / old_filename
        try:
            if old_filepath.exists():
                old_filepath.unlink()
        except OSError:
            pass  # Ignore errors when deleting old file

    # Update user
    user.avatar_url = f"/uploads/avatars/{filename}"
    db.commit()
    db.refresh(user)
    return user
