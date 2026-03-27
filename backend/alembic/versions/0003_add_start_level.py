"""add start_level to incidents

Revision ID: 0003_add_start_level
Revises: 0002_add_notification_level_sent
Create Date: 2026-03-05 14:12:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "0003_add_start_level"
down_revision: Union[str, Sequence[str], None] = "0002_add_notification_level_sent"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    level_type = postgresql.ENUM(
        "ORANGE",
        "RED",
        "GREEN",
        name="incident_level",
        create_type=False,
    )
    op.add_column(
        "incidents",
        sa.Column("start_level", level_type, nullable=False, server_default="GREEN"),
    )
    op.execute(
        """
        UPDATE incidents
        SET start_level = CASE
            WHEN max_level_reached = 'RED'::incident_level THEN 'ORANGE'::incident_level
            WHEN max_level_reached = 'ORANGE'::incident_level THEN 'ORANGE'::incident_level
            ELSE 'GREEN'::incident_level
        END
        """
    )


def downgrade() -> None:
    op.drop_column("incidents", "start_level")
