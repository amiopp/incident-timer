"""add station and interstation to incidents

Revision ID: 0005_add_station_interstation_to_incidents
Revises: c59d747ad0b1
Create Date: 2026-04-07 10:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "0005_add_station_interstation_to_incidents"
down_revision: Union[str, Sequence[str], None] = "c59d747ad0b1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("incidents", sa.Column("station", sa.String(length=128), nullable=True))
    op.add_column("incidents", sa.Column("interstation", sa.String(length=128), nullable=True))


def downgrade() -> None:
    op.drop_column("incidents", "interstation")
    op.drop_column("incidents", "station")
