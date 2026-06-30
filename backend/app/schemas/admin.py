from typing import Optional
from pydantic import BaseModel, Field


class AdminUserUpdate(BaseModel):
    is_active: Optional[bool] = None


class GlobalSettingsResponse(BaseModel):
    model_provider: str = ""
    model_base_url: str = ""
    model_name: str = ""
    has_api_key: bool = False


class GlobalSettingsUpdate(BaseModel):
    model_provider: Optional[str] = None
    model_base_url: Optional[str] = None
    model_name: Optional[str] = None
    model_api_key: Optional[str] = None


class ChangePasswordRequest(BaseModel):
    old_password: str = Field(min_length=1)
    new_password: str = Field(min_length=8, max_length=128)
