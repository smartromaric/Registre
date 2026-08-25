import asyncio
from datetime import UTC, date, datetime

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.celery_app import celery_app
from app.core.database import get_sessionmaker
from app.models.organization import Organization
from app.services.alert_service import AlertService


async def scan_all_organizations(db: AsyncSession, today: date | None = None) -> dict[str, int]:
    """Balaie CHAQUE organisation dans sa propre transaction, avec son propre
    `SET LOCAL app.current_org_id` — les tables scannées (`record_deadlines`,
    `stock_levels`, `stock_lots`, `alerts`, `notifications`) n'ont aucune
    politique de contournement pour l'éditeur (contrairement à
    `subscriptions`/`payments`/`invoices`, §4.3) : hors d'une requête HTTP
    passée par `get_org_context`, rien n'est visible sans positionner ce
    contexte à la main, organisation par organisation.

    Fonction séparée de la tâche Celery elle-même pour rester testable sans
    worker ni broker : `db.begin_nested()` fonctionne aussi bien à l'intérieur
    d'une transaction de test déjà ouverte (savepoint) qu'à partir d'une
    session fraîche sans transaction active (SQLAlchemy en ouvre une).

    Piège vérifié en écrivant le test : `SET LOCAL` à l'intérieur d'un
    `begin_nested()` (SAVEPOINT) qui se termine normalement (RELEASE, pas
    ROLLBACK) **survit** au-delà de ce savepoint — seul un ROLLBACK l'annule.
    Sans restauration explicite en fin de bloc, le contexte d'une organisation
    fuit vers l'itération suivante puis, en sortie de boucle, vers l'appelant
    (fâcheux pour un appelant qui, comme les tests, réutilise la même session
    après l'appel). Chaque itération restaure donc, avant de relâcher son
    savepoint, la valeur qui existait avant l'appel — jamais une chaîne vide :
    une valeur vide correspond à NULL sous RLS (`NULLIF(..., '')`), qui ne
    filtre plus rien du tout plutôt que de rendre le contexte précédent.
    """
    today = today or datetime.now(UTC).date()
    previous_org_id = (
        await db.execute(text("SELECT current_setting('app.current_org_id', true)"))
    ).scalar() or ""
    org_ids = [row[0] for row in (await db.execute(select(Organization.id))).all()]

    results: dict[str, int] = {}
    for org_id in org_ids:
        async with db.begin_nested():
            await db.execute(text(f"SET LOCAL app.current_org_id = '{org_id}'"))
            new_alerts = await AlertService(db).run_scan(org_id, today)
            results[str(org_id)] = len(new_alerts)
            await db.execute(text(f"SET LOCAL app.current_org_id = '{previous_org_id}'"))
    return results


def _run_scan_all_organizations_sync() -> dict[str, int]:
    async def _inner() -> dict[str, int]:
        sessionmaker = get_sessionmaker()
        async with sessionmaker() as db:
            async with db.begin():
                result = await scan_all_organizations(db)
            return result

    return asyncio.run(_inner())


@celery_app.task(name="app.tasks.alerts.run_nightly_alert_scan")
def run_nightly_alert_scan() -> dict[str, int]:
    """§8.2 : équivalent automatique, une fois Celery Beat + Redis provisionnés,
    de `POST .../alerts/run-scan` appelé chaque nuit pour chaque organisation.
    Idempotent par construction (même moteur, mêmes contraintes d'unicité) :
    un redémarrage du worker en cours de balayage ne crée jamais de doublon,
    il rattrape simplement ce qui n'a pas encore été traité ce jour-là.
    """
    return _run_scan_all_organizations_sync()
