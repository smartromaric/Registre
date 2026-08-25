"""fix rls empty guc handling

Revision ID: 5799f8fae891
Revises: 20784ba4f6c6
Create Date: 2026-08-25 10:23:18.120441

"""
from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '5799f8fae891'
down_revision: str | None = '20784ba4f6c6'
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None

# Tables où le contexte d'organisation est toujours établi AVANT la première
# requête (via get_org_context) : une politique unique suffit.
SIMPLE_ORG_SCOPED_TABLES = (
    "audit_logs",
    "model_definitions",
    "field_definitions",
    "records",
    "record_events",
    "record_deadlines",
    "documents",
    "alerts",
    "notifications",
)

CURRENT_ORG = "NULLIF(current_setting('app.current_org_id', true), '')::uuid"
CURRENT_USER = "NULLIF(current_setting('app.current_user_id', true), '')::uuid"


def upgrade() -> None:
    """Corrige deux problèmes découverts en testant le parcours complet en
    conditions réelles (pas seulement via les tests, qui partagent une seule
    transaction et masquaient le bug) :

    1. Une fois que `app.current_org_id` a été positionnée une première fois sur
       une connexion réutilisée par le pool, `current_setting(..., true)` renvoie
       une chaîne vide — pas NULL — pour les transactions suivantes qui ne la
       repositionnent pas. Caster `''::uuid` lève une erreur au lieu de filtrer
       silencieusement. `NULLIF(..., '')` neutralise ce cas (résultat : NULL,
       toujours un échec fermé).

    2. `memberships` est la table qu'on interroge justement pour ÉTABLIR le
       contexte d'organisation (cahier des charges : un utilisateur peut
       appartenir à plusieurs organisations, §4.4). Avec une politique unique
       fondée sur `current_org_id`, cette requête de bootstrap ne pouvait jamais
       rien voir — y compris ses propres appartenances. `memberships` reçoit donc
       une politique SELECT dédiée : visible si l'organisation correspond au
       contexte courant **ou** si la ligne appartient à l'utilisateur courant.
       Les écritures (création, modification, suppression) restent strictement
       cantonnées au contexte d'organisation déjà établi.
    """
    for table in SIMPLE_ORG_SCOPED_TABLES:
        op.execute(f"DROP POLICY IF EXISTS org_isolation ON {table}")
        op.execute(
            f"""
            CREATE POLICY org_isolation ON {table}
            USING (organization_id = {CURRENT_ORG})
            WITH CHECK (organization_id = {CURRENT_ORG})
            """
        )

    op.execute("DROP POLICY IF EXISTS org_isolation ON memberships")
    op.execute(
        f"""
        CREATE POLICY select_own_or_org ON memberships FOR SELECT
        USING (organization_id = {CURRENT_ORG} OR user_id = {CURRENT_USER})
        """
    )
    op.execute(
        f"""
        CREATE POLICY write_org_scoped ON memberships FOR INSERT
        WITH CHECK (organization_id = {CURRENT_ORG})
        """
    )
    op.execute(
        f"""
        CREATE POLICY update_org_scoped ON memberships FOR UPDATE
        USING (organization_id = {CURRENT_ORG}) WITH CHECK (organization_id = {CURRENT_ORG})
        """
    )
    op.execute(
        f"""
        CREATE POLICY delete_org_scoped ON memberships FOR DELETE
        USING (organization_id = {CURRENT_ORG})
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS delete_org_scoped ON memberships")
    op.execute("DROP POLICY IF EXISTS update_org_scoped ON memberships")
    op.execute("DROP POLICY IF EXISTS write_org_scoped ON memberships")
    op.execute("DROP POLICY IF EXISTS select_own_or_org ON memberships")
    op.execute(
        """
        CREATE POLICY org_isolation ON memberships
        USING (organization_id = current_setting('app.current_org_id', true)::uuid)
        WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid)
        """
    )

    for table in SIMPLE_ORG_SCOPED_TABLES:
        op.execute(f"DROP POLICY IF EXISTS org_isolation ON {table}")
        op.execute(
            f"""
            CREATE POLICY org_isolation ON {table}
            USING (organization_id = current_setting('app.current_org_id', true)::uuid)
            WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid)
            """
        )
