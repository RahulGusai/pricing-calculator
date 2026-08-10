"""FastAPI dependencies for database access, opaque sessions, and CSRF."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession
from sqlalchemy.orm import joinedload

from pricing_api.config import Settings
from pricing_api.errors import ApiError
from pricing_api.models import Session as UserSession
from pricing_api.models import User
from pricing_api.security import hash_secret, verify_csrf


def get_settings_from_request(request: Request) -> Settings:
    return request.app.state.settings


def get_db(request: Request):
    session_factory = request.app.state.session_factory
    session = session_factory()
    try:
        yield session
    finally:
        session.close()


SettingsDep = Annotated[Settings, Depends(get_settings_from_request)]
DatabaseDep = Annotated[DbSession, Depends(get_db)]


@dataclass(frozen=True, slots=True)
class AuthContext:
    user: User
    session: UserSession
    raw_token: str


def _as_utc(value: datetime) -> datetime:
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


def get_auth_context(
    request: Request,
    db: DatabaseDep,
    settings: SettingsDep,
) -> AuthContext:
    raw_token = request.cookies.get(settings.session_cookie_name)
    if not raw_token:
        raise ApiError(401, "AUTHENTICATION_REQUIRED", "A valid session is required.")

    session = db.scalar(
        select(UserSession)
        .options(joinedload(UserSession.user))
        .where(UserSession.token_hash == hash_secret(raw_token))
    )
    if (
        session is None
        or session.revoked_at is not None
        or _as_utc(session.expires_at) <= datetime.now(UTC)
    ):
        raise ApiError(401, "AUTHENTICATION_REQUIRED", "A valid session is required.")

    return AuthContext(user=session.user, session=session, raw_token=raw_token)


AuthDep = Annotated[AuthContext, Depends(get_auth_context)]


def require_csrf(
    request: Request,
    auth: AuthDep,
    settings: SettingsDep,
) -> AuthContext:
    if not verify_csrf(
        auth.raw_token,
        settings.csrf_secret,
        request.headers.get("X-CSRF-Token"),
    ):
        raise ApiError(
            403,
            "CSRF_VALIDATION_FAILED",
            "A valid X-CSRF-Token header is required.",
        )
    return auth


CsrfAuthDep = Annotated[AuthContext, Depends(require_csrf)]
