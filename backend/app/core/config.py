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

    def is_development_like(self) -> bool:
        return self.app_env.lower() in {"development", "dev", "test", "testing", "local"}

    def validate_for_runtime(self) -> None:
        if self.is_development_like():
            return
        if self.jwt_secret_key == "change-me-in-development" or len(self.jwt_secret_key) < 32:
            raise RuntimeError("JWT_SECRET_KEY must be configured with a strong value outside development")
        if (
            self.api_key_encryption_secret == "change-me-32-byte-minimum-secret"
            or len(self.api_key_encryption_secret) < 32
        ):
            raise RuntimeError("API_KEY_ENCRYPTION_SECRET must be configured with a strong value outside development")


@lru_cache
def get_settings() -> Settings:
    return Settings()
