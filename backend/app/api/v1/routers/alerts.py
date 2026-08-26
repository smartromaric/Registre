import uuid
from collections.abc import Sequence
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user, get_org_context, require_role
from app.models.alert import Alert, AlertStatus
from app.models.membership import Membership, OrgRole
from app.models.notification import Notification
from app.models.user import User
from app.schemas.alert import AlertOut, AlertPostpone, AlertTarget, NotificationOut
from app.services.alert_service import AlertNotFoundError, AlertService
from app.services.organization_service import PermissionDeniedError

router = APIRouter(tags=["alerts"])


async def _serialize(service: AlertService, alerts: Sequence[Alert]) -> list[AlertOut]:
    """Sérialise des alertes en y joignant leur cible résolue.

    Passe par le service plutôt que par `AlertOut.model_validate` directement :
    `Alert` ne sait pas ce qu'il désigne (voir `AlertTarget`), et c'est une
    résolution groupée — la faire ici, une fois, évite le N+1 qu'une résolution
    par ligne introduirait sur l'écran Alertes.
    """
    if not alerts:
        return []
    targets = await service.resolve_targets(alerts)
    out: list[AlertOut] = []
    for alert in alerts:
        item = AlertOut.model_validate(alert)
        item.target = targets.get(alert.id)
        out.append(item)
    return out


@router.post("/organizations/{organization_id}/alerts/run-scan", response_model=list[AlertOut])
async def run_scan(
    membership: Membership = Depends(require_role(OrgRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
    for_date: date | None = Query(default=None),
) -> list[AlertOut]:
    """Déclenchement manuel du balayage des échéances (§8.2). Tant que Celery
    Beat n'est pas provisionné, un administrateur — ou un planificateur externe —
    appelle cette route une fois par jour ; le moteur est idempotent, donc un appel
    en double le même jour ne crée jamais de doublon.
    """
    service = AlertService(db)
    new_alerts = await service.run_scan(membership.organization_id, for_date)
    if not new_alerts:
        return []
    ids = [a.id for a in new_alerts]
    result = await db.execute(select(Alert).where(Alert.id.in_(ids)))
    return await _serialize(service, list(result.scalars().all()))


@router.get("/organizations/{organization_id}/alerts", response_model=list[AlertOut])
async def list_alerts(
    user: User = Depends(get_current_user),
    membership: Membership = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
    status_filter: AlertStatus | None = Query(default=None, alias="status"),
    mine_only: bool = Query(default=True),
) -> list[AlertOut]:
    service = AlertService(db)
    recipient = user.id if mine_only else None
    alerts = await service.list_for_recipient(membership.organization_id, recipient, status_filter)
    return await _serialize(service, alerts)


@router.post("/organizations/{organization_id}/alerts/{alert_id}/acknowledge", response_model=AlertOut)
async def acknowledge_alert(
    alert_id: uuid.UUID,
    user: User = Depends(get_current_user),
    membership: Membership = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
) -> AlertOut:
    service = AlertService(db)
    try:
        alert = await service.acknowledge(membership.organization_id, alert_id, user, membership)
    except AlertNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc
    except PermissionDeniedError as exc:
        raise HTTPException(status.HTTP_403_FORBIDDEN, str(exc)) from exc
    return (await _serialize(service, [alert]))[0]


@router.post("/organizations/{organization_id}/alerts/{alert_id}/postpone", response_model=AlertOut)
async def postpone_alert(
    alert_id: uuid.UUID,
    payload: AlertPostpone,
    user: User = Depends(get_current_user),
    membership: Membership = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
) -> AlertOut:
    service = AlertService(db)
    try:
        alert = await service.postpone(membership.organization_id, alert_id, payload.postponed_until, user, membership)
    except AlertNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc
    except PermissionDeniedError as exc:
        raise HTTPException(status.HTTP_403_FORBIDDEN, str(exc)) from exc
    return (await _serialize(service, [alert]))[0]


@router.get("/organizations/{organization_id}/notifications", response_model=list[NotificationOut])
async def list_notifications(
    user: User = Depends(get_current_user),
    membership: Membership = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
    unread_only: bool = Query(default=False),
    limit: int = Query(default=50, ge=1, le=200),
) -> list[NotificationOut]:
    """Historique des notifications du destinataire, le plus récent d'abord.

    La borne n'est pas cosmétique : la cloche interroge cette route toutes les
    60 secondes, et elle n'était pas bornée du tout. Au bout de quelques mois de
    balayages quotidiens, chaque tour de cloche rapatriait l'historique complet
    de l'utilisateur pour n'en afficher que les premières lignes.
    """
    stmt = select(Notification).where(
        Notification.organization_id == membership.organization_id, Notification.recipient_user_id == user.id
    )
    if unread_only:
        stmt = stmt.where(Notification.is_read.is_(False))
    stmt = stmt.order_by(Notification.created_at.desc()).limit(limit)
    notifications = list((await db.execute(stmt)).scalars().all())

    # La cible est résolue ici plutôt que laissée à la cloche : sans elle, elle
    # devrait interroger la route des alertes en parallèle, uniquement pour
    # savoir où mène chaque ligne. Une requête groupée de plus, ici, suffit.
    alert_ids = {n.related_alert_id for n in notifications if n.related_alert_id is not None}
    targets: dict[uuid.UUID, AlertTarget] = {}
    if alert_ids:
        related = (
            await db.execute(
                select(Alert).where(
                    Alert.id.in_(alert_ids), Alert.organization_id == membership.organization_id
                )
            )
        ).scalars().all()
        targets = await AlertService(db).resolve_targets(list(related))

    out: list[NotificationOut] = []
    for notification in notifications:
        item = NotificationOut.model_validate(notification)
        if notification.related_alert_id is not None:
            item.target = targets.get(notification.related_alert_id)
        out.append(item)
    return out


@router.post(
    "/organizations/{organization_id}/notifications/{notification_id}/read", response_model=NotificationOut
)
async def mark_notification_read(
    notification_id: uuid.UUID,
    user: User = Depends(get_current_user),
    membership: Membership = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
) -> NotificationOut:
    notification = await db.get(Notification, notification_id)
    if (
        notification is None
        or notification.organization_id != membership.organization_id
        or notification.recipient_user_id != user.id
    ):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Notification introuvable.")
    notification.is_read = True
    await db.flush()
    return NotificationOut.model_validate(notification)
