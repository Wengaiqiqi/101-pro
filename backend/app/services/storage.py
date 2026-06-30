import re
from pathlib import Path
from uuid import uuid4

from fastapi import HTTPException, UploadFile, status

from app.core.config import get_settings

ALLOWED_IMPORT_EXTENSIONS = {".pdf", ".doc", ".docx", ".txt", ".md", ".markdown"}
MAX_IMPORT_FILE_SIZE = 50 * 1024 * 1024  # 50MB


def _storage_root() -> Path:
    return Path(get_settings().storage_root).resolve()


def _ensure_inside_root(path: Path, root: Path) -> None:
    try:
        path.resolve().relative_to(root)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="存储路径无效") from exc


def _sanitize_filename(filename: str) -> str:
    """Remove control characters and limit filename length."""
    # Remove control characters
    cleaned = re.sub(r"[\x00-\x1f\x7f]", "", filename)
    # Limit length
    if len(cleaned) > 255:
        name, ext = Path(cleaned).stem, Path(cleaned).suffix
        cleaned = name[:255 - len(ext)] + ext
    return cleaned or "upload"


def save_upload(user_id: int, upload: UploadFile) -> tuple[str, str]:
    root = _storage_root()
    user_dir = (root / str(user_id)).resolve()
    _ensure_inside_root(user_dir, root)
    user_dir.mkdir(parents=True, exist_ok=True)

    # Validate file extension
    original_filename = _sanitize_filename(Path(upload.filename or "upload").name)
    ext = Path(original_filename).suffix.lower()
    if ext not in ALLOWED_IMPORT_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"不支持的文件格式: {ext}，仅支持: {', '.join(ALLOWED_IMPORT_EXTENSIONS)}"
        )

    stored_name = f"{uuid4().hex}_{original_filename}"
    stored_path = (user_dir / stored_name).resolve()
    _ensure_inside_root(stored_path, root)

    # Write with size limit
    total_size = 0
    with stored_path.open("wb") as output:
        while chunk := upload.file.read(1024 * 1024):
            total_size += len(chunk)
            if total_size > MAX_IMPORT_FILE_SIZE:
                stored_path.unlink(missing_ok=True)
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"文件大小超过限制 ({MAX_IMPORT_FILE_SIZE // 1024 // 1024}MB)"
                )
            output.write(chunk)

    return original_filename, str(stored_path)
