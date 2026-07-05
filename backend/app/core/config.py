from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "W&W刷题"
    app_env: str = "development"
    database_url: str = "sqlite:///./w-w-shuati.db"
    import_queue_mode: str = "local"
    jwt_secret_key: str = "change-me-in-development"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 1440
    storage_root: str = "storage"
    model_provider: str = "openai-compatible"
    model_base_url: str = "https://api.openai.com/v1"
    model_name: str = "gpt-4.1-mini"
    model_api_key: str = ""
    api_key_encryption_secret: str = "change-me-32-byte-minimum-secret"
    cors_origins: str = "*"
    admin_password: str = ""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    @property
    def cors_origins_list(self) -> list[str]:
        if self.cors_origins == "*":
            return ["*"]
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    def is_development_like(self) -> bool:
        return self.app_env.lower() in {"development", "dev", "test", "testing", "local"}

    def validate_for_runtime(self) -> None:
        if self.is_development_like():
            # In development, warn about weak secrets but don't block
            if self.jwt_secret_key == "change-me-in-development":
                import logging
                logging.getLogger(__name__).warning(
                    "⚠️  Using default JWT secret key. Set JWT_SECRET_KEY for better security."
                )
            return
        if self.jwt_secret_key == "change-me-in-development" or len(self.jwt_secret_key) < 32:
            raise RuntimeError("JWT_SECRET_KEY must be configured with a strong value outside development")
        if (
            self.api_key_encryption_secret == "change-me-32-byte-minimum-secret"
            or len(self.api_key_encryption_secret) < 32
        ):
            raise RuntimeError("API_KEY_ENCRYPTION_SECRET must be configured with a strong value outside development")
        if self.cors_origins == "*":
            raise RuntimeError("CORS_ORIGINS must be configured with specific origins outside development")
        if not self.admin_password:
            raise RuntimeError("ADMIN_PASSWORD must be configured outside development")


@lru_cache
def get_settings() -> Settings:
    return Settings()
