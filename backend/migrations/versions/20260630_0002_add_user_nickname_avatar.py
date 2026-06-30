"""add user nickname and avatar

Revision ID: 20260630_0002
Revises: 20260626_0001
Create Date: 2026-06-30 00:00:00.000000

"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "20260630_0002"
down_revision: str | None = "20260626_0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("nickname", sa.String(length=80), server_default="", nullable=False))
    op.add_column("users", sa.Column("avatar_url", sa.String(length=500), nullable=True))
    # Set nickname = username for existing users
    op.execute("UPDATE users SET nickname = username WHERE nickname = ''")


def downgrade() -> None:
    op.drop_column("users", "avatar_url")
    op.drop_column("users", "nickname")
