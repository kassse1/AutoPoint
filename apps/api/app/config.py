from functools import lru_cache
from typing import Literal

from pydantic import field_validator, model_validator
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
    # Public address of the website, for links in staff notifications.
    public_url: str = "http://localhost:3000"
    # Telegram staff notifications. Unset = notifications wait in the outbox (shown in admin).
    telegram_bot_token: str | None = None
    telegram_chat_id: str | None = None
    # Uploaded images (served at /api/v1/media/…). A Docker volume in production.
    media_root: str = "media"

    @property
    def expose_docs(self) -> bool:
        return self.environment != "production"

    @field_validator("database_url")
    @classmethod
    def _use_psycopg(cls, url: str) -> str:
        # Hosting providers (Render, Heroku) give postgres:// or postgresql://; we use psycopg 3.
        for prefix in ("postgres://", "postgresql://"):
            if url.startswith(prefix):
                return "postgresql+psycopg://" + url.removeprefix(prefix)
        return url

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
