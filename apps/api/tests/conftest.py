from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from pricing_api.config import Settings
from pricing_api.database import create_database_engine
from pricing_api.main import create_app
from pricing_api.models import Base


@pytest.fixture
def app(tmp_path):
    database_path = tmp_path / "pricing-test.db"
    settings = Settings(
        app_environment="test",
        database_url=f"sqlite:///{database_path}",
        cors_allowed_origins="http://testserver",
        pricing_supported_currencies="USD,INR,AED",
        pricing_default_currency="USD",
        session_cookie_secure=False,
        artifact_storage="local",
        local_artifacts_dir=tmp_path / "artifacts",
    )
    engine = create_database_engine(settings.database_url)
    Base.metadata.create_all(engine)
    application = create_app(settings=settings, engine=engine)
    yield application
    engine.dispose()


@pytest.fixture
def client(app) -> Iterator[TestClient]:
    with TestClient(app) as test_client:
        yield test_client


def signup(client: TestClient, *, email: str = "avery@example.com") -> tuple[dict, dict[str, str]]:
    response = client.post(
        "/api/v1/auth/signup",
        json={
            "email": email,
            "password": "a-long-enough-test-password",
            "name": "Avery Northstar",
            "workspaceName": "Northstar",
        },
    )
    assert response.status_code == 201, response.text
    body = response.json()
    return body, {"X-CSRF-Token": body["csrfToken"]}
