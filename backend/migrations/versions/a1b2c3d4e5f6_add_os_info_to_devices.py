"""add os_info to devices

Revision ID: a1b2c3d4e5f6
Revises: 9734f1dd6552
Create Date: 2026-05-28 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = '9734f1dd6552'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('devices', sa.Column('os_info', sa.String(255), nullable=True))


def downgrade() -> None:
    op.drop_column('devices', 'os_info')
