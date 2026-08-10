"""Password hashing, opaque session credentials, and CSRF verification."""

from __future__ import annotations

import hashlib
import hmac
import secrets

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError

_password_hasher = PasswordHasher()


def hash_password(password: str) -> str:
    """Hash a password with Argon2id's memory-hard defaults."""

    return _password_hasher.hash(password)


def verify_password(password_hash: str, candidate: str) -> bool:
    """Verify a password without exposing verification-library exceptions."""

    try:
        return _password_hasher.verify(password_hash, candidate)
    except (InvalidHashError, VerificationError, VerifyMismatchError):
        return False


def new_secret() -> str:
    """Create an opaque URL-safe credential with 256 bits of entropy."""

    return secrets.token_urlsafe(32)


def hash_secret(value: str) -> str:
    """Store only a deterministic cryptographic digest of a bearer credential."""

    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def csrf_token(session_token: str, csrf_secret: str) -> str:
    """Derive a stable CSRF token without persisting another browser secret."""

    return hmac.new(
        csrf_secret.encode("utf-8"),
        session_token.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def verify_csrf(session_token: str, csrf_secret: str, candidate: str | None) -> bool:
    """Constant-time verification of the CSRF header for unsafe requests."""

    return bool(candidate) and hmac.compare_digest(
        csrf_token(session_token, csrf_secret), candidate
    )
