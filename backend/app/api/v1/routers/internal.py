"""Routes de service, appelées par un planificateur externe — jamais par un
utilisateur, jamais par le frontend.

Pourquoi elles existent : le balayage des échéances (§8.2) est écrit pour
Celery Beat (`app/tasks/alerts.py`), qui suppose un processus permanent et un
Redis. Sur un hébergement gratuit, ni l'un ni l'autre n'est garanti — le
service s'endort après quelques minutes d'inactivité, et un planificateur
interne endormi ne déclenche rien. Un appel HTTP quotidien venu de l'extérieur
règle les deux problèmes d'un coup : il réveille le service et lance le
balayage. Le moteur étant idempotent, un appel en double le même jour ne crée
aucun doublon.

Authentification par secret partagé plutôt que par jeton utilisateur : il n'y a
pas d'utilisateur derrière un cron, et le balayage traverse **toutes** les
organisations — aucune session ne pourrait légitimement porter cette portée.
"""

import secrets

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import get_db
from app.tasks.alerts import scan_all_organizations

router = APIRouter(prefix="/internal", tags=["internal"])


def _require_cron_secret(provided: str | None) -> None:
    settings = get_settings()
    expected = settings.cron_secret
    # Secret non configuré : on refuse, on n'ouvre pas. Une route de service
    # laissée ouverte « parce qu'aucun secret n'est défini » est exactement le
    # genre de porte qu'on oublie en production.
    if not expected:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Déclencheur externe non configuré sur cet environnement (CRON_SECRET absent).",
        )
    # `compare_digest` : une comparaison naïve fuit la longueur du préfixe
    # correct par son temps d'exécution.
    if not provided or not secrets.compare_digest(provided, expected):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Secret invalide.")


@router.post("/nightly-scan")
async def trigger_nightly_scan(
    x_cron_secret: str | None = Header(default=None, alias="X-Cron-Secret"),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Rejoue le balayage des échéances pour toutes les organisations.

    Renvoie le nombre d'alertes créées par organisation — un planificateur
    externe garde ainsi une trace exploitable de ce que l'appel a réellement
    produit, plutôt qu'un simple 200 muet.
    """
    _require_cron_secret(x_cron_secret)
    created = await scan_all_organizations(db)
    return {"organizations_scanned": len(created), "alerts_created": created}
