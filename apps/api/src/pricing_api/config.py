"""Runtime configuration for the API service.

Only currency enablement is configurable.  The two-decimal scale is a versioned
business invariant in :mod:`pricing_api.pricing`, so a deployment cannot silently
reinterpret persisted money.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

ALLOWED_CURRENCIES = frozenset({"USD", "INR", "AED"})


class Settings(BaseSettings):
    """Validated service configuration sourced from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_environment: Literal["development", "test", "production"] = "development"
    port: int = Field(default=8000, ge=1, le=65535)
    database_url: str = "sqlite:///./pricing-calculator.db"
    # `.env.example` opts local Vite into CORS. Production's same-origin Caddy
    # topology should leave this empty rather than accidentally retain a dev origin.
    cors_allowed_origins: str = ""

    pricing_supported_currencies: str = "USD,INR,AED"
    pricing_default_currency: str = "USD"

    session_cookie_name: str = "pricing_session"
    session_cookie_secure: bool = False
    session_ttl_hours: int = Field(default=8, ge=1, le=24 * 30)
    csrf_secret: str = "local-development-only-change-me"

    @property
    def supported_currencies(self) -> tuple[str, ...]:
        values = tuple(
            currency.strip().upper()
            for currency in self.pricing_supported_currencies.split(",")
            if currency.strip()
        )
        return values

    @property
    def cors_origins(self) -> tuple[str, ...]:
        return tuple(
            origin.strip().rstrip("/")
            for origin in self.cors_allowed_origins.split(",")
            if origin.strip()
        )

    @model_validator(mode="after")
    def validate_business_configuration(self) -> Settings:
        supported = self.supported_currencies
        if not supported:
            raise ValueError("PRICING_SUPPORTED_CURRENCIES must enable at least one currency.")
        if len(set(supported)) != len(supported):
            raise ValueError("PRICING_SUPPORTED_CURRENCIES cannot contain duplicates.")
        unknown = sorted(set(supported) - ALLOWED_CURRENCIES)
        if unknown:
            raise ValueError(
                "Unsupported configured currency code(s): " + ", ".join(unknown) + "."
            )
        if self.pricing_default_currency.upper() not in supported:
            raise ValueError("PRICING_DEFAULT_CURRENCY must be one of the enabled currencies.")

        if self.app_environment == "production":
            if self.database_url.lower().startswith("sqlite"):
                raise ValueError("Production must use PostgreSQL, not SQLite.")
            if not self.session_cookie_secure:
                raise ValueError("Production session cookies must be Secure.")
            if self.csrf_secret == "local-development-only-change-me":
                raise ValueError("Production requires a unique CSRF_SECRET.")
        return self


@lru_cache
def get_settings() -> Settings:
    """Return one immutable settings object per process."""

    return Settings()
