"""extend metrics pk with label_hash

Revision ID: cf0fcbabb35e
Revises: 45c22b7ac233
Create Date: 2026-05-26 06:59:38.189688

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'cf0fcbabb35e'
down_revision: Union[str, Sequence[str], None] = '45c22b7ac233'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add a label_hash column to make labeled metrics unique
    op.add_column('metrics', sa.Column('label_hash', sa.String(16), server_default='', nullable=False))
    # Drop old PK and create new one including label_hash
    op.drop_constraint('metrics_pkey', 'metrics', type_='primary')
    op.create_primary_key('metrics_pkey', 'metrics', ['timestamp', 'device_id', 'metric_name', 'label_hash'])


def downgrade() -> None:
    op.drop_constraint('metrics_pkey', 'metrics', type_='primary')
    op.create_primary_key('metrics_pkey', 'metrics', ['timestamp', 'device_id', 'metric_name'])
    op.drop_column('metrics', 'label_hash')
