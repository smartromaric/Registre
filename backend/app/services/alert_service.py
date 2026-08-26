import uuid
from collections import defaultdict
from collections.abc import Sequence
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
from app.models.alert import Alert, AlertSourceType, AlertStatus
from app.models.membership import Membership
from app.models.model_definition import FieldDefinition, ModelDefinition
from app.models.record import Record, RecordDeadline
from app.models.stock import ArticleVariant, Depot, StockLevel, StockLot
from app.models.user import User
from app.schemas.alert import AlertTarget
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

    async def resolve_targets(self, alerts: Sequence[Alert]) -> dict[uuid.UUID, AlertTarget]:
        """Résout, pour un lot d'alertes, ce que chacune désigne réellement.

        Trois requêtes au plus — une par type de source — quel que soit le nombre
        d'alertes. Une résolution par alerte serait un N+1 sur un écran dont c'est
        justement le rôle d'en afficher beaucoup.

        Une alerte dont la source a disparu (fiche supprimée, lot soldé) n'apparaît
        simplement pas dans le résultat : l'appelant n'affiche alors aucun lien,
        plutôt qu'un lien fabriqué menant à une 404.
        """
        by_type: dict[AlertSourceType, set[uuid.UUID]] = defaultdict(set)
        for alert in alerts:
            by_type[alert.source_type].add(alert.source_id)

        targets: dict[uuid.UUID, AlertTarget] = {}

        if deadline_ids := by_type.get(AlertSourceType.DEADLINE):
            stmt = (
                select(RecordDeadline.id, Record.id, ModelDefinition.title_field_key, Record.data, FieldDefinition.label)
                .join(Record, Record.id == RecordDeadline.record_id)
                .join(ModelDefinition, ModelDefinition.id == Record.model_definition_id)
                .join(FieldDefinition, FieldDefinition.id == RecordDeadline.field_definition_id)
                .where(RecordDeadline.id.in_(deadline_ids))
            )
            for deadline_id, record_id, title_key, data, field_label in (await self.db.execute(stmt)).all():
                subject = (data or {}).get(title_key) if title_key else None
                subject = str(subject) if subject else "fiche sans titre"
                targets[deadline_id] = AlertTarget(label=f"{field_label} — {subject}", record_id=record_id)

        if level_ids := by_type.get(AlertSourceType.STOCK_THRESHOLD):
            stmt = (
                select(StockLevel.id, StockLevel.variant_id, StockLevel.depot_id, ArticleVariant.label, Depot.name)
                .join(ArticleVariant, ArticleVariant.id == StockLevel.variant_id)
                .join(Depot, Depot.id == StockLevel.depot_id)
                .where(StockLevel.id.in_(level_ids))
            )
            for level_id, variant_id, depot_id, variant_label, depot_name in (await self.db.execute(stmt)).all():
                label = f"Stock sous le seuil — {variant_label or 'Article'} · {depot_name}"
                targets[level_id] = AlertTarget(label=label, depot_id=depot_id, variant_id=variant_id)

        if lot_ids := by_type.get(AlertSourceType.LOT_EXPIRY):
            stmt = (
                select(
                    StockLot.id, StockLot.variant_id, StockLot.depot_id, StockLot.lot_number,
                    ArticleVariant.label, Depot.name,
                )
                .join(ArticleVariant, ArticleVariant.id == StockLot.variant_id)
                .join(Depot, Depot.id == StockLot.depot_id)
                .where(StockLot.id.in_(lot_ids))
            )
            for lot_id, variant_id, depot_id, lot_number, variant_label, depot_name in (
                await self.db.execute(stmt)
            ).all():
                label = f"Lot {lot_number} — {variant_label or 'Article'} · {depot_name}"
                targets[lot_id] = AlertTarget(label=label, depot_id=depot_id, variant_id=variant_id)

        # La clé de sortie est l'identifiant de l'ALERTE, pas celui de la source :
        # deux alertes (paliers différents) partagent la même source, et l'appelant
        # raisonne en alertes.
        return {
            alert.id: target for alert in alerts if (target := targets.get(alert.source_id)) is not None
        }

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
