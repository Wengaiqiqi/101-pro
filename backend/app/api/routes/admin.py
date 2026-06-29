from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_admin_user, get_db
from app.core.security import hash_password, verify_password
from app.models.global_settings import GlobalSettings
from app.services.model_settings_service import ResolvedModelConfig, encrypt_api_key, decrypt_api_key, test_model_connection
from app.models.user import User
from app.schemas.admin import AdminUserUpdate, ChangePasswordRequest, GlobalSettingsResponse, GlobalSettingsUpdate
from app.schemas.user import UserResponse

router = APIRouter(prefix="/admin", tags=["admin"])

SETTINGS_KEYS = ["model_provider", "model_base_url", "model_name", "model_api_key"]


# ── User Management ───────────────────────────────────────────────

@router.get("/users", response_model=list[UserResponse])
def list_users(
    db: Session = Depends(get_db),
    _admin: User = Depends(get_admin_user),
):
    users = db.scalars(select(User).order_by(User.id)).all()
    return users


@router.patch("/users/{user_id}", response_model=UserResponse)
def update_user(
    user_id: int,
    payload: AdminUserUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="用户不存在")
    if user.id == admin.id:
        raise HTTPException(status_code=400, detail="不能修改自己的账号")
    if payload.is_active is not None:
        user.is_active = payload.is_active
    db.commit()
    db.refresh(user)
    return user


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="用户不存在")
    if user.id == admin.id:
        raise HTTPException(status_code=400, detail="不能删除自己的账号")
    db.delete(user)
    db.commit()


@router.post("/change-password")
def change_password(
    payload: ChangePasswordRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    if not verify_password(payload.old_password, admin.password_hash):
        raise HTTPException(status_code=400, detail="原密码错误")
    if len(payload.new_password) < 6:
        raise HTTPException(status_code=400, detail="新密码长度不能少于6位")
    admin.password_hash = hash_password(payload.new_password)
    db.commit()
    return {"message": "密码修改成功"}


# ── Global Settings ───────────────────────────────────────────────

def _get_setting(db: Session, key: str) -> str:
    row = db.scalar(select(GlobalSettings).where(GlobalSettings.key == key))
    return row.value if row else ""


def _set_setting(db: Session, key: str, value: str):
    row = db.scalar(select(GlobalSettings).where(GlobalSettings.key == key))
    if row:
        row.value = value
    else:
        db.add(GlobalSettings(key=key, value=value))


@router.get("/settings", response_model=GlobalSettingsResponse)
def get_global_settings(
    db: Session = Depends(get_db),
    _admin: User = Depends(get_admin_user),
):
    return GlobalSettingsResponse(
        model_provider=_get_setting(db, "model_provider"),
        model_base_url=_get_setting(db, "model_base_url"),
        model_name=_get_setting(db, "model_name"),
        has_api_key=bool(_get_setting(db, "model_api_key")),
    )


@router.put("/settings", response_model=GlobalSettingsResponse)
def update_global_settings(
    payload: GlobalSettingsUpdate,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_admin_user),
):
    if payload.model_provider is not None:
        _set_setting(db, "model_provider", payload.model_provider.strip())
    if payload.model_base_url is not None:
        _set_setting(db, "model_base_url", payload.model_base_url.strip().rstrip("/"))
    if payload.model_name is not None:
        _set_setting(db, "model_name", payload.model_name.strip())
    if payload.model_api_key is not None:
        encrypted = encrypt_api_key(payload.model_api_key.strip())
        _set_setting(db, "model_api_key", encrypted)
    db.commit()
    return GlobalSettingsResponse(
        model_provider=_get_setting(db, "model_provider"),
        model_base_url=_get_setting(db, "model_base_url"),
        model_name=_get_setting(db, "model_name"),
        has_api_key=bool(_get_setting(db, "model_api_key")),
    )


@router.post("/settings/test")
def test_global_settings(
    db: Session = Depends(get_db),
    _admin: User = Depends(get_admin_user),
):
    api_key_encrypted = _get_setting(db, "model_api_key")
    if not api_key_encrypted:
        return {"ok": False, "message": "未配置 API Key"}
    try:
        api_key = decrypt_api_key(api_key_encrypted)
    except Exception:
        api_key = api_key_encrypted
    config = ResolvedModelConfig(
        provider=_get_setting(db, "model_provider"),
        base_url=_get_setting(db, "model_base_url"),
        model=_get_setting(db, "model_name"),
        api_key=api_key,
    )
    return test_model_connection(config)
