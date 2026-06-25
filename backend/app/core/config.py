from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Question Bank Platform"
    app_env: str = "development"
    database_url: str = "postgresql+psycopg://question_bank:question_bank@localhost:5432/question_bank"
    redis_url: str = "redis://localhost:6379/0"
    jwt_secret_key: str = "change-me-in-development"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 1440
    storage_root: str = "storage"
    model_provider: str = "openai-compatible"
    model_base_url: str = "https://api.openai.com/v1"
    model_name: str = "gpt-4.1-mini"
    model_api_key: str = ""
    api_key_encryption_secret: str = "change-me-32-byte-minimum-secret"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")


@lru_cache
def get_settings() -> Settings:
    return Settings()
