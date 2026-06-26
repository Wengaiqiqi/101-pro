from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.security import JWTError, decode_access_token
from app.db.session import get_db
from app.models.user import User
from app.services.auth_service import get_user_by_id

bearer_scheme = HTTPBearer(auto_error=True)


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = decode_access_token(credentials.credentials)
        subject = payload.get("sub")
        user_id = int(subject) if isinstance(subject, str) else None
    except (JWTError, TypeError, ValueError):
        raise credentials_exception from None

    if user_id is None:
        raise credentials_exception

    user = get_user_by_id(db, user_id)
    if user is None or not user.is_active:
        raise credentials_exception
    return user
