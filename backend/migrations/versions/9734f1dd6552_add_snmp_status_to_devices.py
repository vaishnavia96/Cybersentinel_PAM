"""add snmp_status to devices

Revision ID: 9734f1dd6552
Revises: cf0fcbabb35e
Create Date: 2026-05-27 07:06:05.264235

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '9734f1dd6552'
down_revision: Union[str, Sequence[str], None] = 'cf0fcbabb35e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('devices', sa.Column('snmp_status', sa.String(10), server_default='unknown', nullable=False))


def downgrade() -> None:
    op.drop_column('devices', 'snmp_status')
