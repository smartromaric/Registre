import uuid
from datetime import UTC, date, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.alerts.engine import (
    NewAlert,
    scan_organization_deadlines,
    scan_organization_lot_expiries,
    scan_organization_stock_thresholds,
)
from app.alerts.notify import (
    dispatch_deadline_notifications,
    dispatch_lot_expiry_notifications,
    dispatch_stock_threshold_notifications,
)
from app.core.permissions import Action, role_can
from app.models.alert import Alert, AlertStatus
from app.models.membership import Membership
from app.models.user import User
from app.services.organization_service import PermissionDeniedError


class AlertNotFoundError(Exception):
    pass


class AlertService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def run_scan(self, organization_id: uuid.UUID, today: date | None = None) -> list[NewAlert]:
        """Cahier des charges §8.2 : balaie échéances, seuils de stock et lots
        proches de la péremption, et produit les alertes du jour, de façon
        rejouable sans effet de bord. Tant que Celery Beat n'est pas provisionné
        en production, cette action est déclenchable à la main par un
        administrateur (voir le routeur) ou par un planificateur externe (cron
        système, tâche planifiée) qui appelle la même route — le moteur est déjà
        prêt pour les deux.
        """
        today = today or datetime.now(UTC).date()

        deadline_alerts = await scan_organization_deadlines(self.db, organization_id, today)
        await dispatch_deadline_notifications(self.db, organization_id, deadline_alerts)

        threshold_alerts = await scan_organization_stock_thresholds(self.db, organization_id, today)
        await dispatch_stock_threshold_notifications(self.db, organization_id, threshold_alerts)

        lot_alerts = await scan_organization_lot_expiries(self.db, organization_id, today)
        await dispatch_lot_expiry_notifications(self.db, organization_id, lot_alerts)

        return [*deadline_alerts, *threshold_alerts, *lot_alerts]

    async def list_for_recipient(
        self, organization_id: uuid.UUID, recipient_user_id: uuid.UUID | None, status: AlertStatus | None = None
    ) -> list[Alert]:
        stmt = select(Alert).where(Alert.organization_id == organization_id)
        if recipient_user_id is not None:
            stmt = stmt.where(Alert.recipient_user_id == recipient_user_id)
        if status is not None:
            stmt = stmt.where(Alert.status == status)
        stmt = stmt.order_by(Alert.created_at.desc())
        return list((await self.db.execute(stmt)).scalars().all())

    async def acknowledge(
        self, organization_id: uuid.UUID, alert_id: uuid.UUID, actor: User, actor_membership: Membership
    ) -> Alert:
        alert = await self._get(organization_id, alert_id)
        self._check_can_touch(alert, actor, actor_membership)
        alert.status = AlertStatus.ACKNOWLEDGED
        await self.db.flush()
        return alert

    async def postpone(
        self,
        organization_id: uuid.UUID,
        alert_id: uuid.UUID,
        until: date,
        actor: User,
        actor_membership: Membership,
    ) -> Alert:
        alert = await self._get(organization_id, alert_id)
        self._check_can_touch(alert, actor, actor_membership)
        alert.status = AlertStatus.POSTPONED
        alert.postponed_until = until
        await self.db.flush()
        return alert

    async def _get(self, organization_id: uuid.UUID, alert_id: uuid.UUID) -> Alert:
        alert = await self.db.get(Alert, alert_id)
        if alert is None or alert.organization_id != organization_id:
            raise AlertNotFoundError("Alerte introuvable.")
        return alert

    @staticmethod
    def _check_can_touch(alert: Alert, actor: User, actor_membership: Membership) -> None:
        """Correctif sécurité (2026-08-25) : n'importe quel membre actif de
        l'organisation, y compris un READER, pouvait jusqu'ici acquitter ou
        reporter l'alerte de n'importe qui — aucune vérification n'existait,
        contrairement à toute autre action mutante du produit. Une alerte
        adressée personnellement (`recipient_user_id`) reste acquittable par
        son destinataire quel que soit son rôle (c'est tout le sens d'une
        alerte personnelle) ; toute autre alerte (sans destinataire, ou
        adressée à quelqu'un d'autre) exige `CONFIGURE_ALERTS` (ADMIN/MANAGER).
        """
        if alert.recipient_user_id == actor.id:
            return
        if role_can(actor_membership.role, Action.CONFIGURE_ALERTS):
            return
        raise PermissionDeniedError("Vous n'avez pas le droit de modifier cette alerte.")
