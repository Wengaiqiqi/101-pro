"""add password_version to users

Revision ID: 20260630_0005
Revises: 20260630_0004
Create Date: 2026-06-30 14:00:00.000000

"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "20260630_0005"
down_revision: str | None = "20260630_0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("password_version", sa.Integer(), server_default="1", nullable=False))


def downgrade() -> None:
    op.drop_column("users", "password_version")
