from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.rate_limit import check_rate_limit
from app.db.session import get_db
from app.models.user import User
from app.schemas.auth import LoginRequest, RegisterRequest, TokenResponse
from app.schemas.user import UserResponse
from app.services.auth_service import authenticate_user, register_user

router = APIRouter(prefix="/auth", tags=["auth"])


def _register_rate_limit(request: Request):
    return check_rate_limit(request, max_requests=10, window_seconds=3600)


def _login_rate_limit(request: Request):
    return check_rate_limit(request, max_requests=10, window_seconds=300)


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def register(
    payload: RegisterRequest,
    _rate_limit: None = Depends(_register_rate_limit),
    db: Session = Depends(get_db),
) -> User:
    return register_user(db, payload)


@router.post("/login", response_model=TokenResponse)
def login(
    payload: LoginRequest,
    _rate_limit: None = Depends(_login_rate_limit),
    db: Session = Depends(get_db),
) -> TokenResponse:
    return authenticate_user(db, payload)


@router.get("/me", response_model=UserResponse)
def me(current_user: User = Depends(get_current_user)) -> User:
    return current_user
