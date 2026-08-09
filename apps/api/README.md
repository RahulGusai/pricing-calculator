# API service

This directory is reserved for the FastAPI backend. Backend implementation begins
after the frontend mock experience and contract are reviewed.

Planned boundary: FastAPI, Pydantic, SQLAlchemy 2, Alembic, PostgreSQL in production,
SQLite locally/tests, and private S3-compatible PDF storage.

Canonical business data remains relational. The API owns calculations, lifecycle,
authorization, reports, and artifact access.
