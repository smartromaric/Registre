import uuid
from datetime import UTC, date, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.alerts.engine import NewAlert, scan_organization_deadlines
from app.alerts.notify import dispatch_new_alert_notifications
from app.models.alert import Alert, AlertStatus


class AlertNotFoundError(Exception):
    pass


class AlertService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def run_scan(self, organization_id: uuid.UUID, today: date | None = None) -> list[NewAlert]:
        """Cahier des charges §8.2 : balaie les échéances de l'organisation et
        produit les alertes du jour, de façon rejouable sans effet de bord. Tant
        que Celery Beat n'est pas provisionné en production, cette action est
        déclenchable à la main par un administrateur (voir le routeur) ou par un
        planificateur externe (cron système, tâche planifiée) qui appelle la même
        route — le moteur est déjà prêt pour les deux.
        """
        today = today or datetime.now(UTC).date()
        new_alerts = await scan_organization_deadlines(self.db, organization_id, today)
        await dispatch_new_alert_notifications(self.db, organization_id, new_alerts)
        return new_alerts

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

    async def acknowledge(self, organization_id: uuid.UUID, alert_id: uuid.UUID) -> Alert:
        alert = await self._get(organization_id, alert_id)
        alert.status = AlertStatus.ACKNOWLEDGED
        await self.db.flush()
        return alert

    async def postpone(self, organization_id: uuid.UUID, alert_id: uuid.UUID, until: date) -> Alert:
        alert = await self._get(organization_id, alert_id)
        alert.status = AlertStatus.POSTPONED
        alert.postponed_until = until
        await self.db.flush()
        return alert

    async def _get(self, organization_id: uuid.UUID, alert_id: uuid.UUID) -> Alert:
        alert = await self.db.get(Alert, alert_id)
        if alert is None or alert.organization_id != organization_id:
            raise AlertNotFoundError("Alerte introuvable.")
        return alert
