from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class UserResponse(BaseModel):
    id: int
    username: str
    nickname: str
    avatar_url: Optional[str] = None
    role: str
    is_active: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class UserUpdate(BaseModel):
    nickname: Optional[str] = Field(default=None, min_length=1, max_length=80)
    avatar_url: Optional[str] = Field(default=None, max_length=500)
