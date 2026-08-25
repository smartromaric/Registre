"""authentification a deux facteurs TOTP

Revision ID: 1a5a32610501
Revises: bae51b55c40f
Create Date: 2026-08-25 15:26:44.958294

"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '1a5a32610501'
down_revision: str | None = 'bae51b55c40f'
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.add_column('users', sa.Column('totp_secret', sa.String(length=64), nullable=True))
    op.add_column('users', sa.Column('totp_enabled', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column('users', sa.Column('totp_backup_codes', postgresql.JSONB(astext_type=sa.Text()), nullable=True))
    op.alter_column('users', 'totp_enabled', server_default=None)


def downgrade() -> None:
    op.drop_column('users', 'totp_backup_codes')
    op.drop_column('users', 'totp_enabled')
    op.drop_column('users', 'totp_secret')
