from pydantic import BaseModel, Field


class ModelSettingsUpdate(BaseModel):
    provider: str = Field(min_length=1, max_length=80)
    base_url: str = Field(min_length=1, max_length=500)
    model: str = Field(min_length=1, max_length=160)
    api_key: str | None = Field(default=None, min_length=1, max_length=2000)


class ModelSettingsResponse(BaseModel):
    provider: str | None
    base_url: str | None
    model: str | None
    has_api_key: bool
    platform_available: bool


class ModelConnectionTestResponse(BaseModel):
    ok: bool
    provider: str
    model: str
    message: str | None = None
