from functools import lru_cache
from typing import Literal

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_DEV_SECRET = "dev-only-insecure-secret-change-me"  # noqa: S105 - rejected in production below


class Settings(BaseSettings):
    """Read from environment variables only (no .env file inside the app)."""

    model_config = SettingsConfigDict(extra="ignore")

    environment: Literal["development", "test", "production"] = "development"
    # Dev default matches compose.yml; production must set DATABASE_URL explicitly.
    database_url: str = "postgresql+psycopg://autopoint:autopoint@localhost:5432/autopoint"
    # JSON list, e.g. ["http://localhost:3000"]. Empty in production (same origin via proxy).
    cors_origins: list[str] = []
    log_level: str = "INFO"
    # Signs booking manage links (and JWTs from Phase 4). Rotating it invalidates old links.
    secret_key: str = _DEV_SECRET

    @property
    def expose_docs(self) -> bool:
        return self.environment != "production"

    @model_validator(mode="after")
    def _production_needs_real_secret(self) -> "Settings":
        if self.environment == "production" and (
            self.secret_key == _DEV_SECRET or len(self.secret_key) < 32
        ):
            raise ValueError("SECRET_KEY must be set to a random value of 32+ characters")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
