"""SQLAlchemy engine and session helpers."""

from __future__ import annotations

from collections.abc import Generator

from sqlalchemy import Engine, create_engine, event
from sqlalchemy.orm import Session, sessionmaker


def normalize_database_url(database_url: str) -> str:
    """Select psycopg 3 for PostgreSQL while preserving SQLite URLs for tests."""

    if database_url.startswith("postgres://"):
        database_url = "postgresql://" + database_url.removeprefix("postgres://")
    if database_url.startswith("postgresql://"):
        return "postgresql+psycopg://" + database_url.removeprefix("postgresql://")
    return database_url


def create_database_engine(database_url: str) -> Engine:
    """Create a synchronous SQLAlchemy 2 engine appropriate to the configured URL."""

    normalized_url = normalize_database_url(database_url)
    connect_args: dict[str, object] = {}
    if normalized_url.startswith("sqlite"):
        connect_args["check_same_thread"] = False

    engine = create_engine(
        normalized_url,
        future=True,
        pool_pre_ping=not normalized_url.startswith("sqlite"),
        connect_args=connect_args,
    )
    if normalized_url.startswith("sqlite"):
        # SQLite requires this per connection; PostgreSQL always enforces the
        # foreign-key constraints encoded in the shared Alembic migration.
        @event.listens_for(engine, "connect")
        def enable_sqlite_foreign_keys(dbapi_connection, _connection_record) -> None:
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

    return engine


def create_session_factory(engine: Engine) -> sessionmaker[Session]:
    """Return sessions that retain values after request commits."""

    return sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def session_scope(session_factory: sessionmaker[Session]) -> Generator[Session, None, None]:
    """Yield a request session and reliably close it."""

    session = session_factory()
    try:
        yield session
    finally:
        session.close()
