from pathlib import Path
from uuid import uuid4

from fastapi import HTTPException, UploadFile, status

from app.core.config import get_settings


def _storage_root() -> Path:
    return Path(get_settings().storage_root).resolve()


def _ensure_inside_root(path: Path, root: Path) -> None:
    try:
        path.resolve().relative_to(root)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="存储路径无效") from exc


def save_upload(user_id: int, upload: UploadFile) -> tuple[str, str]:
    root = _storage_root()
    user_dir = (root / str(user_id)).resolve()
    _ensure_inside_root(user_dir, root)
    user_dir.mkdir(parents=True, exist_ok=True)

    original_filename = Path(upload.filename or "upload").name
    stored_name = f"{uuid4().hex}_{original_filename}"
    stored_path = (user_dir / stored_name).resolve()
    _ensure_inside_root(stored_path, root)

    with stored_path.open("wb") as output:
        while chunk := upload.file.read(1024 * 1024):
            output.write(chunk)

    return original_filename, str(stored_path)
