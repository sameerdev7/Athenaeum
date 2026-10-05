"""group cascades + one active audio session per group

Revision ID: e5f2a7c91d34
Revises: d4e8b1a09c52
Create Date: 2026-10-05 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e5f2a7c91d34'
down_revision: Union[str, Sequence[str], None] = 'd4e8b1a09c52'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

GROUP_CHILDREN = ("group_members", "posts", "messages", "audio_sessions")


def upgrade() -> None:
    """Upgrade schema."""
    # Postgres: swap each group FK for one with ON DELETE CASCADE. (SQLite can't
    # alter a foreign key in place; there the delete handler removes children
    # explicitly and the model carries the cascade for fresh databases.)
    if op.get_bind().dialect.name == "postgresql":
        for table in GROUP_CHILDREN:
            name = f"{table}_group_id_fkey"
            op.drop_constraint(name, table, type_="foreignkey")
            op.create_foreign_key(name, table, "groups", ["group_id"], ["id"], ondelete="CASCADE")

    # Only one live (ended_at IS NULL) audio session per group, enforced by the DB.
    op.create_index(
        "uq_audio_one_active_per_group",
        "audio_sessions",
        ["group_id"],
        unique=True,
        sqlite_where=sa.text("ended_at IS NULL"),
        postgresql_where=sa.text("ended_at IS NULL"),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("uq_audio_one_active_per_group", table_name="audio_sessions")
    if op.get_bind().dialect.name == "postgresql":
        for table in GROUP_CHILDREN:
            name = f"{table}_group_id_fkey"
            op.drop_constraint(name, table, type_="foreignkey")
            op.create_foreign_key(name, table, "groups", ["group_id"], ["id"])
