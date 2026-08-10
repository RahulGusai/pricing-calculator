from __future__ import annotations

import pytest
from pydantic import ValidationError

from pricing_api.config import Settings


def test_currency_configuration_allows_only_the_three_supported_codes() -> None:
    with pytest.raises(ValidationError, match="Unsupported configured currency"):
        Settings(pricing_supported_currencies="USD,EUR")

    settings = Settings(pricing_supported_currencies="AED,INR", pricing_default_currency="AED")
    assert settings.supported_currencies == ("AED", "INR")
    assert settings.pricing_default_currency == "AED"
    assert Settings().cors_origins == ()


def test_production_configuration_refuses_local_dependencies() -> None:
    with pytest.raises(ValidationError, match="Production must use PostgreSQL"):
        Settings(app_environment="production")

    production = Settings(
        app_environment="production",
        database_url="postgresql://user:password@database/pricing",
        cors_allowed_origins="",
        session_cookie_secure=True,
        csrf_secret="a-unique-high-entropy-test-secret",
        artifact_storage="s3",
        s3_bucket="documents",
        aws_access_key_id="access-key",
        aws_secret_access_key="secret-key",
    )
    assert production.artifact_storage == "s3"
