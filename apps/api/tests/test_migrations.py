from __future__ import annotations

from alembic.config import Config
from sqlalchemy import inspect

from alembic import command
from pricing_api.config import get_settings


def test_initial_migration_upgrades_and_downgrades_sqlite(tmp_path, monkeypatch) -> None:
    database_path = tmp_path / "migration-test.db"
    monkeypatch.setenv("APP_ENVIRONMENT", "test")
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{database_path}")
    monkeypatch.setenv("ARTIFACT_STORAGE", "local")
    get_settings.cache_clear()
    config = Config("alembic.ini")

    command.upgrade(config, "head")
    from pricing_api.database import create_database_engine

    engine = create_database_engine(f"sqlite:///{database_path}")
    assert {"users", "sessions", "documents", "line_items", "artifacts"} <= set(
        inspect(engine).get_table_names()
    )
    command.downgrade(config, "base")
    assert inspect(engine).get_table_names() == ["alembic_version"]
    engine.dispose()
    get_settings.cache_clear()


def test_initial_migration_compiles_for_postgresql(monkeypatch) -> None:
    """Check the committed first migration without requiring a live database."""

    monkeypatch.setenv("APP_ENVIRONMENT", "test")
    monkeypatch.setenv("DATABASE_URL", "postgresql://user:password@localhost/pricing")
    monkeypatch.setenv("ARTIFACT_STORAGE", "local")
    get_settings.cache_clear()
    config = Config("alembic.ini")

    command.upgrade(config, "head", sql=True)
    get_settings.cache_clear()
