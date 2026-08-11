"""SQLAlchemy persistence models for the pricing API.

The ORM stores every authoritative financial value as an integer.  Amounts use
the document currency's minor unit (cents, paise, or fils). Quantities are
whole integers and percentage inputs use the same scale as :mod:`pricing`
(100). Decimal-string conversion and rounding deliberately remain in the pure
pricing module.

This module contains no request/response models, database-engine setup, or
authorization logic.  Application services must scope document queries by
``owner_id`` and reject mutations after a document is finalized.
"""

from __future__ import annotations

from datetime import UTC, date, datetime
from uuid import uuid4

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    MetaData,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def new_uuid() -> str:
    """Return a portable string UUID for application-assigned primary keys."""

    return str(uuid4())


def utc_now() -> datetime:
    """Return a timezone-aware UTC timestamp for ORM-managed writes."""

    return datetime.now(UTC)


class Base(DeclarativeBase):
    """Declarative base with stable names for database constraints."""

    metadata = MetaData(
        naming_convention={
            "ix": "ix_%(table_name)s_%(column_0_name)s",
            "uq": "uq_%(table_name)s_%(column_0_name)s",
            "ck": "ck_%(table_name)s_%(constraint_name)s",
            "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
            "pk": "pk_%(table_name)s",
        }
    )


class User(Base):
    """An account that owns sessions and pricing documents."""

    __tablename__ = "users"
    __table_args__ = (
        UniqueConstraint("email", name="uq_users_email"),
        CheckConstraint("email <> ''", name="email_not_blank"),
        CheckConstraint("name <> ''", name="name_not_blank"),
        CheckConstraint("workspace_name <> ''", name="workspace_name_not_blank"),
        CheckConstraint("password_hash <> ''", name="password_hash_not_blank"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    # Application services store the normalized, lower-case value here before insert.
    email: Mapped[str] = mapped_column(String(320), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    workspace_name: Mapped[str] = mapped_column(String(120), nullable=False)
    # Argon2id PHC string.  Never expose this field in an API response.
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
        server_default=text("CURRENT_TIMESTAMP"),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
        onupdate=utc_now,
        server_default=text("CURRENT_TIMESTAMP"),
    )

    sessions: Mapped[list[Session]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    documents: Mapped[list[Document]] = relationship(
        back_populates="owner",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class Session(Base):
    """A revocable opaque session; the raw browser credential is never stored."""

    __tablename__ = "sessions"
    __table_args__ = (
        UniqueConstraint("token_hash", name="uq_sessions_token_hash"),
        CheckConstraint("token_hash <> ''", name="token_hash_not_blank"),
        CheckConstraint("expires_at > created_at", name="expiry_after_creation"),
        Index("ix_sessions_user_id_expires_at", "user_id", "expires_at"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    # A SHA-256/HMAC digest fits comfortably while leaving room for a version prefix.
    token_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
        server_default=text("CURRENT_TIMESTAMP"),
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    user: Mapped[User] = relationship(back_populates="sessions")


class Document(Base):
    """An owner-scoped pricing document with materialized integer totals."""

    __tablename__ = "documents"
    __table_args__ = (
        UniqueConstraint("owner_id", "number", name="uq_documents_owner_id_number"),
        CheckConstraint("number <> ''", name="number_not_blank"),
        CheckConstraint("length(currency) = 3", name="currency_code_length"),
        CheckConstraint("status IN ('draft', 'finalized')", name="status_known"),
        CheckConstraint("valid_until >= document_date", name="valid_until_not_before_date"),
        CheckConstraint(
            "(status = 'draft' AND finalized_at IS NULL) OR "
            "(status = 'finalized' AND finalized_at IS NOT NULL)",
            name="status_matches_finalized_at",
        ),
        CheckConstraint(
            "subtotal_minor >= 0 AND discount_minor >= 0 AND "
            "tax_minor >= 0 AND grand_total_minor >= 0",
            name="totals_nonnegative",
        ),
        CheckConstraint(
            "discount_minor <= subtotal_minor",
            name="discount_not_above_subtotal",
        ),
        CheckConstraint(
            "grand_total_minor = subtotal_minor - discount_minor + tax_minor",
            name="totals_algebra",
        ),
        Index("ix_documents_owner_id_updated_at", "owner_id", "updated_at"),
        Index(
            "ix_documents_owner_id_document_date_status",
            "owner_id",
            "document_date",
            "status",
        ),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    owner_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    # Human-readable identifier, unique only within its owning account.
    number: Mapped[str] = mapped_column(String(64), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    customer_name: Mapped[str] = mapped_column(String(255), nullable=False)
    document_date: Mapped[date] = mapped_column(Date, nullable=False)
    valid_until: Mapped[date] = mapped_column(Date, nullable=False)
    # The enabled values are configuration-driven and validated by application services.
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="draft")
    finalized_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    subtotal_minor: Mapped[int] = mapped_column(
        BigInteger,
        nullable=False,
        default=0,
        server_default=text("0"),
    )
    discount_minor: Mapped[int] = mapped_column(
        BigInteger,
        nullable=False,
        default=0,
        server_default=text("0"),
    )
    tax_minor: Mapped[int] = mapped_column(
        BigInteger,
        nullable=False,
        default=0,
        server_default=text("0"),
    )
    grand_total_minor: Mapped[int] = mapped_column(
        BigInteger,
        nullable=False,
        default=0,
        server_default=text("0"),
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
        server_default=text("CURRENT_TIMESTAMP"),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
        onupdate=utc_now,
        server_default=text("CURRENT_TIMESTAMP"),
    )

    owner: Mapped[User] = relationship(back_populates="documents")
    line_items: Mapped[list[LineItem]] = relationship(
        back_populates="document",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="LineItem.position",
    )


class LineItem(Base):
    """An ordered line whose normalized inputs and calculated totals are persisted."""

    __tablename__ = "line_items"
    __table_args__ = (
        UniqueConstraint(
            "document_id",
            "position",
            name="uq_line_items_document_id_position",
        ),
        CheckConstraint("position > 0", name="position_positive"),
        CheckConstraint("name <> ''", name="name_not_blank"),
        CheckConstraint("quantity >= 1", name="quantity_at_least_one"),
        CheckConstraint("unit_price_minor >= 0", name="unit_price_nonnegative"),
        CheckConstraint(
            "discount_type IN ('none', 'fixed', 'percentage')",
            name="discount_type_known",
        ),
        CheckConstraint("discount_value_scaled >= 0", name="discount_value_nonnegative"),
        CheckConstraint(
            "tax_rate_scaled >= 0 AND tax_rate_scaled <= 10000",
            name="tax_rate_in_range",
        ),
        CheckConstraint(
            "subtotal_minor >= 0 AND discount_minor >= 0 AND "
            "tax_minor >= 0 AND grand_total_minor >= 0",
            name="totals_nonnegative",
        ),
        CheckConstraint(
            "discount_minor <= subtotal_minor",
            name="discount_not_above_subtotal",
        ),
        CheckConstraint(
            "grand_total_minor = subtotal_minor - discount_minor + tax_minor",
            name="totals_algebra",
        ),
        CheckConstraint(
            "(discount_type = 'none' AND discount_value_scaled = 0 AND discount_minor = 0) OR "
            "(discount_type = 'fixed' AND discount_value_scaled = discount_minor "
            "AND discount_value_scaled <= subtotal_minor) OR "
            "(discount_type = 'percentage' AND discount_value_scaled <= 10000)",
            name="discount_representation_matches_type",
        ),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    document_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("documents.id", ondelete="CASCADE"),
        nullable=False,
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        default="",
        server_default=text("''"),
    )
    # Quantity is a positive whole count, e.g. 3 is stored as 3.
    quantity: Mapped[int] = mapped_column(BigInteger, nullable=False)
    # USD cents, INR paise, or AED fils (depending on document.currency).
    unit_price_minor: Mapped[int] = mapped_column(BigInteger, nullable=False)
    discount_type: Mapped[str] = mapped_column(String(16), nullable=False)
    # Fixed: currency minor units. Percentage: percentage points scaled by 100.
    discount_value_scaled: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    # Percentage points scaled by 100, e.g. 8.25% is stored as 825.
    tax_rate_scaled: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    subtotal_minor: Mapped[int] = mapped_column(BigInteger, nullable=False)
    discount_minor: Mapped[int] = mapped_column(BigInteger, nullable=False)
    tax_minor: Mapped[int] = mapped_column(BigInteger, nullable=False)
    grand_total_minor: Mapped[int] = mapped_column(BigInteger, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
        server_default=text("CURRENT_TIMESTAMP"),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
        onupdate=utc_now,
        server_default=text("CURRENT_TIMESTAMP"),
    )

    document: Mapped[Document] = relationship(back_populates="line_items")
