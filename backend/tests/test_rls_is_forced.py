"""Toute table protégée par RLS doit l'être AUSSI pour son propriétaire.

En PostgreSQL, `ENABLE ROW LEVEL SECURITY` ne s'applique pas au propriétaire de
la table : il faut `FORCE`. Tant que deux rôles distincts existent (le cas en
développement), la distinction reste théorique — le compte applicatif n'est pas
propriétaire. Elle cesse de l'être dès que l'hébergeur ne fournit qu'un seul
utilisateur, ce qui est le cas de la plupart des bases managées d'entrée de
gamme : ce compte unique crée les tables ET fait tourner l'application, et
**toutes les politiques deviennent inertes**, sans erreur ni avertissement.

Ce test est le garde-fou : une table ajoutée demain avec une politique
d'isolation mais sans `FORCE` le fait échouer, plutôt que de laisser le trou se
découvrir en production.
"""

from sqlalchemy import text


async def test_every_rls_table_is_also_forced(db_session):
    rows = (
        await db_session.execute(
            text(
                """
                SELECT c.relname, c.relforcerowsecurity
                FROM pg_class c
                JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity
                ORDER BY c.relname
                """
            )
        )
    ).all()

    # Le test ne prouverait rien sur une base vide de politiques.
    assert len(rows) >= 20, f"trop peu de tables sous RLS ({len(rows)}) : la base est-elle migrée ?"

    not_forced = sorted(name for name, forced in rows if not forced)
    assert not_forced == [], (
        "Ces tables ont une politique d'isolation que leur propriétaire contourne. "
        "Ajoutez `ALTER TABLE <table> FORCE ROW LEVEL SECURITY` dans une migration : "
        f"{not_forced}"
    )
