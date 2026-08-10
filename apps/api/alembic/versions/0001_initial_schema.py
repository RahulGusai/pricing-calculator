"""Create canonical pricing API tables.

Revision ID: 0001_initial_schema
Revises:
Create Date: 2026-08-10
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0001_initial_schema"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Create portable SQLite/PostgreSQL tables for canonical API state."""

    op.create_table(
        "users",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("workspace_name", sa.String(length=120), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.CheckConstraint("email <> ''", name=op.f("ck_users_email_not_blank")),
        sa.CheckConstraint("name <> ''", name=op.f("ck_users_name_not_blank")),
        sa.CheckConstraint(
            "workspace_name <> ''",
            name=op.f("ck_users_workspace_name_not_blank"),
        ),
        sa.CheckConstraint(
            "password_hash <> ''",
            name=op.f("ck_users_password_hash_not_blank"),
        ),
        sa.PrimaryKeyConstraint("id", name="pk_users"),
        sa.UniqueConstraint("email", name="uq_users_email"),
    )

    op.create_table(
        "sessions",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("token_hash", sa.String(length=128), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "token_hash <> ''",
            name=op.f("ck_sessions_token_hash_not_blank"),
        ),
        sa.CheckConstraint(
            "expires_at > created_at",
            name=op.f("ck_sessions_expiry_after_creation"),
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name="fk_sessions_user_id_users",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_sessions"),
        sa.UniqueConstraint("token_hash", name="uq_sessions_token_hash"),
    )
    op.create_index(
        "ix_sessions_user_id_expires_at",
        "sessions",
        ["user_id", "expires_at"],
        unique=False,
    )

    op.create_table(
        "documents",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("owner_id", sa.String(length=36), nullable=False),
        sa.Column("number", sa.String(length=64), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("customer_name", sa.String(length=255), nullable=False),
        sa.Column("document_date", sa.Date(), nullable=False),
        sa.Column("valid_until", sa.Date(), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("finalized_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "subtotal_minor",
            sa.BigInteger(),
            server_default=sa.text("0"),
            nullable=False,
        ),
        sa.Column(
            "discount_minor",
            sa.BigInteger(),
            server_default=sa.text("0"),
            nullable=False,
        ),
        sa.Column(
            "tax_minor",
            sa.BigInteger(),
            server_default=sa.text("0"),
            nullable=False,
        ),
        sa.Column(
            "grand_total_minor",
            sa.BigInteger(),
            server_default=sa.text("0"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.CheckConstraint("number <> ''", name=op.f("ck_documents_number_not_blank")),
        sa.CheckConstraint(
            "length(currency) = 3",
            name=op.f("ck_documents_currency_code_length"),
        ),
        sa.CheckConstraint(
            "status IN ('draft', 'finalized')",
            name=op.f("ck_documents_status_known"),
        ),
        sa.CheckConstraint(
            "valid_until >= document_date",
            name=op.f("ck_documents_valid_until_not_before_date"),
        ),
        sa.CheckConstraint(
            "(status = 'draft' AND finalized_at IS NULL) OR "
            "(status = 'finalized' AND finalized_at IS NOT NULL)",
            name=op.f("ck_documents_status_matches_finalized_at"),
        ),
        sa.CheckConstraint(
            "subtotal_minor >= 0 AND discount_minor >= 0 AND "
            "tax_minor >= 0 AND grand_total_minor >= 0",
            name=op.f("ck_documents_totals_nonnegative"),
        ),
        sa.CheckConstraint(
            "discount_minor <= subtotal_minor",
            name=op.f("ck_documents_discount_not_above_subtotal"),
        ),
        sa.CheckConstraint(
            "grand_total_minor = subtotal_minor - discount_minor + tax_minor",
            name=op.f("ck_documents_totals_algebra"),
        ),
        sa.ForeignKeyConstraint(
            ["owner_id"],
            ["users.id"],
            name="fk_documents_owner_id_users",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_documents"),
        sa.UniqueConstraint("owner_id", "number", name="uq_documents_owner_id_number"),
    )
    op.create_index(
        "ix_documents_owner_id_updated_at",
        "documents",
        ["owner_id", "updated_at"],
        unique=False,
    )
    op.create_index(
        "ix_documents_owner_id_document_date_status",
        "documents",
        ["owner_id", "document_date", "status"],
        unique=False,
    )

    op.create_table(
        "line_items",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("document_id", sa.String(length=36), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column(
            "description",
            sa.Text(),
            server_default=sa.text("''"),
            nullable=False,
        ),
        sa.Column("quantity_scaled", sa.BigInteger(), nullable=False),
        sa.Column("unit_price_minor", sa.BigInteger(), nullable=False),
        sa.Column("discount_type", sa.String(length=16), nullable=False),
        sa.Column("discount_value_scaled", sa.BigInteger(), nullable=False),
        sa.Column("tax_rate_scaled", sa.Integer(), nullable=False),
        sa.Column("subtotal_minor", sa.BigInteger(), nullable=False),
        sa.Column("discount_minor", sa.BigInteger(), nullable=False),
        sa.Column("tax_minor", sa.BigInteger(), nullable=False),
        sa.Column("grand_total_minor", sa.BigInteger(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.CheckConstraint("position > 0", name=op.f("ck_line_items_position_positive")),
        sa.CheckConstraint("name <> ''", name=op.f("ck_line_items_name_not_blank")),
        sa.CheckConstraint(
            "quantity_scaled >= 100",
            name=op.f("ck_line_items_quantity_at_least_one"),
        ),
        sa.CheckConstraint(
            "unit_price_minor >= 0",
            name=op.f("ck_line_items_unit_price_nonnegative"),
        ),
        sa.CheckConstraint(
            "discount_type IN ('none', 'fixed', 'percentage')",
            name=op.f("ck_line_items_discount_type_known"),
        ),
        sa.CheckConstraint(
            "discount_value_scaled >= 0",
            name=op.f("ck_line_items_discount_value_nonnegative"),
        ),
        sa.CheckConstraint(
            "tax_rate_scaled >= 0 AND tax_rate_scaled <= 10000",
            name=op.f("ck_line_items_tax_rate_in_range"),
        ),
        sa.CheckConstraint(
            "subtotal_minor >= 0 AND discount_minor >= 0 AND "
            "tax_minor >= 0 AND grand_total_minor >= 0",
            name=op.f("ck_line_items_totals_nonnegative"),
        ),
        sa.CheckConstraint(
            "discount_minor <= subtotal_minor",
            name=op.f("ck_line_items_discount_not_above_subtotal"),
        ),
        sa.CheckConstraint(
            "grand_total_minor = subtotal_minor - discount_minor + tax_minor",
            name=op.f("ck_line_items_totals_algebra"),
        ),
        sa.CheckConstraint(
            "(discount_type = 'none' AND discount_value_scaled = 0 AND discount_minor = 0) OR "
            "(discount_type = 'fixed' AND discount_value_scaled = discount_minor "
            "AND discount_value_scaled <= subtotal_minor) OR "
            "(discount_type = 'percentage' AND discount_value_scaled <= 10000)",
            name=op.f("ck_line_items_discount_representation_matches_type"),
        ),
        sa.ForeignKeyConstraint(
            ["document_id"],
            ["documents.id"],
            name="fk_line_items_document_id_documents",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_line_items"),
        sa.UniqueConstraint(
            "document_id",
            "position",
            name="uq_line_items_document_id_position",
        ),
    )

    op.create_table(
        "artifacts",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("document_id", sa.String(length=36), nullable=False),
        sa.Column("object_key", sa.String(length=1024), nullable=False),
        sa.Column("checksum", sa.String(length=128), nullable=True),
        sa.Column(
            "content_type",
            sa.String(length=255),
            server_default=sa.text("'application/pdf'"),
            nullable=False,
        ),
        sa.Column("size_bytes", sa.BigInteger(), nullable=True),
        sa.Column("state", sa.String(length=16), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "object_key <> ''",
            name=op.f("ck_artifacts_object_key_not_blank"),
        ),
        sa.CheckConstraint(
            "state IN ('pending', 'ready', 'failed', 'deleting')",
            name=op.f("ck_artifacts_state_known"),
        ),
        sa.CheckConstraint(
            "size_bytes IS NULL OR size_bytes >= 0",
            name=op.f("ck_artifacts_size_nonnegative_when_present"),
        ),
        sa.CheckConstraint(
            "state <> 'ready' OR "
            "(checksum IS NOT NULL AND checksum <> '' AND size_bytes IS NOT NULL)",
            name=op.f("ck_artifacts_ready_has_integrity_metadata"),
        ),
        sa.ForeignKeyConstraint(
            ["document_id"],
            ["documents.id"],
            name="fk_artifacts_document_id_documents",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_artifacts"),
        sa.UniqueConstraint("document_id", name="uq_artifacts_document_id"),
        sa.UniqueConstraint("object_key", name="uq_artifacts_object_key"),
    )


def downgrade() -> None:
    """Drop the initial schema in dependency-safe reverse order."""

    op.drop_table("artifacts")
    op.drop_table("line_items")
    op.drop_index("ix_documents_owner_id_document_date_status", table_name="documents")
    op.drop_index("ix_documents_owner_id_updated_at", table_name="documents")
    op.drop_table("documents")
    op.drop_index("ix_sessions_user_id_expires_at", table_name="sessions")
    op.drop_table("sessions")
    op.drop_table("users")
