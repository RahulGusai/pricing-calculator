"""Remove generated PDF artifact persistence.

Revision ID: 0002_remove_artifacts
Revises: 0001_initial_schema
Create Date: 2026-08-11
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0002_remove_artifacts"
down_revision: str | None = "0001_initial_schema"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Drop the unused artifact metadata table."""

    op.drop_table("artifacts")


def downgrade() -> None:
    """Restore the former artifact metadata table for rollback compatibility."""

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
