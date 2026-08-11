"""Store quantities as positive whole integers.

Revision ID: 0003_whole_integer_quantities
Revises: 0002_remove_artifacts
Create Date: 2026-08-12
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import context, op

# revision identifiers, used by Alembic.
revision: str = "0003_whole_integer_quantities"
down_revision: str | None = "0002_remove_artifacts"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_OLD_CONSTRAINT = "ck_line_items_quantity_at_least_one"


def _replace_quantity_column(*, upgrade: bool) -> None:
    """Use SQLite batch mode while retaining straightforward PostgreSQL DDL."""

    constraint_name = op.f(_OLD_CONSTRAINT)
    if context.is_offline_mode() or op.get_bind().dialect.name != "sqlite":
        op.drop_constraint(constraint_name, "line_items", type_="check")
        if upgrade:
            op.create_check_constraint(constraint_name, "line_items", "quantity >= 1")
            op.alter_column("line_items", "quantity", nullable=False)
            op.drop_column("line_items", "quantity_scaled")
        else:
            op.create_check_constraint(
                constraint_name,
                "line_items",
                "quantity_scaled >= 100",
            )
            op.alter_column("line_items", "quantity_scaled", nullable=False)
            op.drop_column("line_items", "quantity")
        return

    with op.batch_alter_table("line_items", recreate="always") as batch_op:
        batch_op.drop_constraint(constraint_name, type_="check")
        if upgrade:
            batch_op.create_check_constraint(constraint_name, "quantity >= 1")
            batch_op.alter_column("quantity", nullable=False)
            batch_op.drop_column("quantity_scaled")
        else:
            batch_op.create_check_constraint(constraint_name, "quantity_scaled >= 100")
            batch_op.alter_column("quantity_scaled", nullable=False)
            batch_op.drop_column("quantity")


def upgrade() -> None:
    """Convert scale-100 quantities only when every existing value is whole."""

    if not context.is_offline_mode():
        fractional = op.get_bind().execute(
            sa.text(
                "SELECT id FROM line_items WHERE quantity_scaled % 100 <> 0 LIMIT 1"
            )
        ).first()
        if fractional is not None:
            raise RuntimeError(
                "Cannot migrate fractional quantities to whole integers. "
                "Resolve line_items.quantity_scaled values that are not divisible by 100 first."
            )

    op.add_column("line_items", sa.Column("quantity", sa.BigInteger(), nullable=True))
    op.execute("UPDATE line_items SET quantity = quantity_scaled / 100")
    _replace_quantity_column(upgrade=True)


def downgrade() -> None:
    """Restore the former scale-100 column for rollback compatibility."""

    op.add_column(
        "line_items",
        sa.Column("quantity_scaled", sa.BigInteger(), nullable=True),
    )
    op.execute("UPDATE line_items SET quantity_scaled = quantity * 100")
    _replace_quantity_column(upgrade=False)
