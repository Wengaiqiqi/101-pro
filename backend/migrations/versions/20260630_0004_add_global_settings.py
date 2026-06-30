"""add global_settings table

Revision ID: 20260630_0004
Revises: 20260630_0003
Create Date: 2026-06-30 13:00:00.000000

"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "20260630_0004"
down_revision: str | None = "20260630_0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "global_settings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("key", sa.String(length=100), nullable=False),
        sa.Column("value", sa.String(length=2000), server_default="", nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_global_settings_key"), "global_settings", ["key"], unique=True)


def downgrade() -> None:
    op.drop_index(op.f("ix_global_settings_key"), table_name="global_settings")
    op.drop_table("global_settings")
