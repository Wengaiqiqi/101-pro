"""remove email add feedback

Revision ID: 20260630_0003
Revises: 20260630_0002
Create Date: 2026-06-30 12:00:00.000000

"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "20260630_0003"
down_revision: str | None = "20260630_0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Add feedback column to practice_answers
    op.add_column("practice_answers", sa.Column("feedback", sa.String(500), nullable=True))

    # Drop email index and column from users
    op.drop_index("ix_users_email", table_name="users")
    op.drop_column("users", "email")


def downgrade() -> None:
    # Re-add email column
    op.add_column("users", sa.Column("email", sa.String(255), nullable=True))
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    # Remove feedback column
    op.drop_column("practice_answers", "feedback")
