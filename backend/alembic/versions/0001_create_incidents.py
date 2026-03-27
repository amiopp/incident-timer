"""create incidents table

Revision ID: 0001_create_incidents
Revises: 
Create Date: 2026-03-04 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "0001_create_incidents"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


incident_status = sa.Enum("ACTIVE", "RESOLVED", name="incident_status")
incident_level = sa.Enum("ORANGE", "RED", "GREEN", name="incident_level")


def upgrade() -> None:
    incident_status.create(op.get_bind(), checkfirst=True)
    incident_level.create(op.get_bind(), checkfirst=True)

    status_type = postgresql.ENUM(
        "ACTIVE",
        "RESOLVED",
        name="incident_status",
        create_type=False,
    )
    level_type = postgresql.ENUM(
        "ORANGE",
        "RED",
        "GREEN",
        name="incident_level",
        create_type=False,
    )

    op.create_table(
        "incidents",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("status", status_type, nullable=False, server_default="ACTIVE"),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("duration_seconds", sa.Integer(), nullable=True),
        sa.Column("max_level_reached", level_type, nullable=False, server_default="ORANGE"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("notification_level_sent", sa.Integer(), nullable=False, server_default="0"),
    )
    op.create_index("ix_incidents_status_started_at", "incidents", ["status", "started_at"])


def downgrade() -> None:
    op.drop_index("ix_incidents_status_started_at", table_name="incidents")
    op.drop_table("incidents")
    incident_level.drop(op.get_bind(), checkfirst=True)
    incident_status.drop(op.get_bind(), checkfirst=True)
