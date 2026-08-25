"""lot3 tableaux de bord - table saved dashboards

Revision ID: bae51b55c40f
Revises: 0fdf30005a2b
Create Date: 2026-08-25 12:49:40.081037

"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'bae51b55c40f'
down_revision: str | None = '0fdf30005a2b'
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    dashboard_period = sa.Enum('7d', '30d', '90d', 'current_year', name='dashboard_period')

    op.create_table(
        'saved_dashboards',
        sa.Column('owner_user_id', sa.Uuid(), nullable=False),
        sa.Column('name', sa.String(length=120), nullable=False),
        sa.Column('model_definition_id', sa.Uuid(), nullable=True),
        sa.Column('depot_id', sa.Uuid(), nullable=True),
        sa.Column('site', sa.String(length=120), nullable=True),
        sa.Column('period', dashboard_period, nullable=False),
        sa.Column('is_pinned', sa.Boolean(), nullable=False),
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('organization_id', sa.Uuid(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['model_definition_id'], ['model_definitions.id']),
        sa.ForeignKeyConstraint(['depot_id'], ['depots.id']),
        sa.ForeignKeyConstraint(['owner_user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_saved_dashboards_organization_id'), 'saved_dashboards', ['organization_id'], unique=False)
    op.create_index(op.f('ix_saved_dashboards_owner_user_id'), 'saved_dashboards', ['owner_user_id'], unique=False)

    # Cloisonnement multi-organisation (§14.1, §15) — même politique que saved_views :
    # ces routes passent toujours par get_org_context, le contexte est déjà établi.
    op.execute("ALTER TABLE saved_dashboards ENABLE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY org_isolation ON saved_dashboards
        USING (organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
        WITH CHECK (organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS org_isolation ON saved_dashboards")

    op.drop_index(op.f('ix_saved_dashboards_owner_user_id'), table_name='saved_dashboards')
    op.drop_index(op.f('ix_saved_dashboards_organization_id'), table_name='saved_dashboards')
    op.drop_table('saved_dashboards')

    sa.Enum(name='dashboard_period').drop(op.get_bind(), checkfirst=True)
