from fastapi import APIRouter, Depends, UploadFile, File, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.admin import ChangePasswordRequest
from app.schemas.user import UserResponse, UserUpdate
from app.services import user_service

router = APIRouter(tags=["users"])


@router.get("/users/me", response_model=UserResponse)
def get_current_user_info(current_user: User = Depends(get_current_user)) -> User:
    return current_user


@router.put("/users/me", response_model=UserResponse)
def update_current_user(
    payload: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> User:
    return user_service.update_user_profile(db, current_user, payload)


@router.post("/users/me/avatar", response_model=UserResponse)
async def upload_avatar(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> User:
    return await user_service.upload_avatar(db, current_user, file)


@router.put("/users/me/change-password")
def change_password(
    payload: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    user_service.change_password(db, current_user, payload.old_password, payload.new_password)
    return {"message": "密码修改成功"}
