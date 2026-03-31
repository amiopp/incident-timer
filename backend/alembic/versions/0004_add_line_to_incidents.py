"""add line to incidents

Revision ID: 0004_add_line_to_incidents
Revises: 0003_add_start_level
Create Date: 2026-03-30 12:10:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "0004_add_line_to_incidents"
down_revision: Union[str, Sequence[str], None] = "0003_add_start_level"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("incidents", sa.Column("line", sa.String(length=8), nullable=True))



def downgrade() -> None:
    op.drop_column("incidents", "line")
