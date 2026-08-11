from __future__ import annotations

import pytest
from pydantic import ValidationError

from pricing_api.config import Settings


def test_currency_configuration_allows_only_the_three_supported_codes() -> None:
    with pytest.raises(ValidationError, match="Unsupported configured currency"):
        Settings(_env_file=None, pricing_supported_currencies="USD,EUR")

    settings = Settings(
        _env_file=None,
        pricing_supported_currencies="AED,INR",
        pricing_default_currency="AED",
    )
    assert settings.supported_currencies == ("AED", "INR")
    assert settings.pricing_default_currency == "AED"
    assert Settings(_env_file=None).cors_origins == ()


def test_production_configuration_requires_postgres_and_secure_sessions() -> None:
    with pytest.raises(ValidationError, match="Production must use PostgreSQL"):
        Settings(_env_file=None, app_environment="production")

    production = Settings(
        _env_file=None,
        app_environment="production",
        database_url="postgresql://user:password@database/pricing",
        cors_allowed_origins="",
        session_cookie_secure=True,
        csrf_secret="a-unique-high-entropy-test-secret",
    )
    assert production.database_url.startswith("postgresql://")
