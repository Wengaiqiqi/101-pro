from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.model_settings import (
    ModelConnectionTestResponse,
    ModelSettingsResponse,
    ModelSettingsUpdate,
)
from app.services import model_settings_service

router = APIRouter(prefix="/model-settings", tags=["model-settings"])


@router.get("", response_model=ModelSettingsResponse)
def get_settings(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> ModelSettingsResponse:
    return model_settings_service.get_model_settings(db, current_user)


@router.put("", response_model=ModelSettingsResponse)
def update_settings(
    payload: ModelSettingsUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ModelSettingsResponse:
    return model_settings_service.save_model_settings(db, current_user, payload)


@router.post("/test", response_model=ModelConnectionTestResponse)
def test_settings(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict[str, object]:
    config = model_settings_service.resolve_model_config(db, current_user)
    return model_settings_service.test_model_connection(config)
