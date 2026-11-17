from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Read from environment variables only (no .env file inside the app)."""

    model_config = SettingsConfigDict(extra="ignore")

    environment: Literal["development", "test", "production"] = "development"
    # Dev default matches compose.yml; production must set DATABASE_URL explicitly.
    database_url: str = "postgresql+psycopg://autopoint:autopoint@localhost:5432/autopoint"
    # JSON list, e.g. ["http://localhost:3000"]. Empty in production (same origin via proxy).
    cors_origins: list[str] = []
    log_level: str = "INFO"

    @property
    def expose_docs(self) -> bool:
        return self.environment != "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()
