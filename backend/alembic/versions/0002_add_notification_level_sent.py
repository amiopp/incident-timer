"""add notification_level_sent to incidents

Revision ID: 0002_add_notification_level_sent
Revises: 0001_create_incidents
Create Date: 2026-03-05 14:10:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "0002_add_notification_level_sent"
down_revision: Union[str, Sequence[str], None] = "0001_create_incidents"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE incidents
        ADD COLUMN IF NOT EXISTS notification_level_sent INTEGER NOT NULL DEFAULT 0
        """
    )


def downgrade() -> None:
    op.execute(
        """
        ALTER TABLE incidents
        DROP COLUMN IF EXISTS notification_level_sent
        """
    )
