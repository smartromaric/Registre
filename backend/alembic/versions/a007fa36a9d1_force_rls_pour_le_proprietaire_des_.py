"""FORCE ROW LEVEL SECURITY : le cloisonnement doit tenir même pour le propriétaire

Trouvé en préparant le déploiement (2026-08-26).

Les tables portaient `ENABLE ROW LEVEL SECURITY`, jamais `FORCE`. En PostgreSQL,
**le propriétaire d'une table contourne ses propres politiques** tant que RLS
n'est pas forcé. Le choix se tenait en développement, où deux rôles distincts
existent : `postgres` crée les tables, `registre_app` — non propriétaire — les
lit sous politiques. Le commentaire du lot 0 le disait explicitement.

Il ne tient plus dès que l'hébergeur ne fournit qu'un seul utilisateur, ce qui
est le cas de l'offre gratuite de Render, de Heroku et de la plupart des bases
managées d'entrée de gamme. Ce compte unique crée les tables (Alembic) *et* fait
tourner l'application : il en est donc propriétaire, et **toutes les politiques
d'isolation deviennent inertes**, sans erreur, sans avertissement, sans que rien
ne le signale à l'exécution.

Mesuré sur la base locale avant correction, sans contexte d'organisation posé :

    rôle applicatif (registre_app)  ->  records: 0    memberships: 0
    rôle propriétaire (postgres)    ->  records: 46   memberships: 42

`FORCE` referme cela : le propriétaire est soumis aux mêmes politiques que tout
le monde. Le cloisonnement décrit au §14.1 redevient vrai quel que soit le
nombre de rôles offerts par l'hébergeur, et l'affirmation de PRODUCT.md §6.3 —
« impossible à contourner par une route mal écrite » — redevient exacte en
production, pas seulement en développement.

CONSÉQUENCE POUR LES MIGRATIONS FUTURES. Alembic tourne sous le propriétaire :
une migration qui modifie des DONNÉES sur l'une de ces tables devra désormais
poser `app.current_org_id`, ou retirer temporairement `FORCE`, sous peine de ne
toucher aucune ligne — silencieusement. Aucune migration existante n'est
concernée : toutes sont purement structurelles.

Revision ID: a007fa36a9d1
Revises: 73d1437e41a1
Create Date: 2026-08-26 12:26:43.350345

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a007fa36a9d1"
down_revision: str | None = "73d1437e41a1"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


#: Les 25 tables portant une politique d'isolation, relevées dans `pg_class`
#: (`relrowsecurity = true`) plutôt que recopiées des migrations : c'est l'état
#: réel de la base qui fait foi, et une table ajoutée sans RLS se verrait ici.
RLS_TABLES = (
    "alerts",
    "article_configs",
    "article_variants",
    "audit_logs",
    "consignment_levels",
    "depot_thresholds",
    "depots",
    "documents",
    "field_definitions",
    "invoices",
    "memberships",
    "model_definitions",
    "notifications",
    "payments",
    "record_deadlines",
    "record_events",
    "record_field_conflicts",
    "records",
    "saved_dashboards",
    "saved_views",
    "stock_levels",
    "stock_lots",
    "stock_movements",
    "subscriptions",
    "upload_sessions",
)


def upgrade() -> None:
    for table in RLS_TABLES:
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")


def downgrade() -> None:
    for table in RLS_TABLES:
        op.execute(f"ALTER TABLE {table} NO FORCE ROW LEVEL SECURITY")
