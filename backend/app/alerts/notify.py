import uuid
from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.alerts.engine import NewAlert
from app.models.model_definition import FieldDefinition, ModelDefinition
from app.models.record import Record, RecordDeadline
from app.models.stock import ArticleVariant, Depot, StockLevel, StockLot
from app.notifications.carriers import InAppCarrier
from app.notifications.intents import NotificationIntent


def _palier_status_text(palier: str) -> str:
    if palier.startswith("overdue"):
        return "en retard"
    if palier == "j-0":
        return "échéance aujourd'hui"
    if palier.startswith("j-"):
        return f"échéance dans {palier.removeprefix('j-')} jours"
    return "à traiter"


def format_deadline_alert(
    record: Record, model: ModelDefinition, field: FieldDefinition, due_date: date, palier: str
) -> tuple[str, str]:
    title_value = record.data.get(model.title_field_key) if model.title_field_key else None
    subject = str(title_value) if title_value else "fiche sans titre"
    title = f"{field.label} — {subject}"
    body = f"{model.name_singular} {subject} : {field.label} {_palier_status_text(palier)} (le {due_date.isoformat()})."
    return title, body


def format_stock_threshold_alert(variant: ArticleVariant, depot: Depot, quantity: int, threshold: int) -> tuple[str, str]:
    label = variant.label or "Article"
    title = f"Stock sous le seuil — {label}"
    body = f"{label} — Dépôt {depot.name} : {quantity} restant(s), seuil fixé à {threshold}."
    return title, body


def format_lot_expiry_alert(
    variant: ArticleVariant, depot: Depot, lot_number: str, expiry_date: date, palier: str
) -> tuple[str, str]:
    label = variant.label or "Article"
    title = f"Lot proche de la péremption — {label}"
    body = (
        f"{label} — Dépôt {depot.name} : lot {lot_number} {_palier_status_text(palier)} "
        f"(limite le {expiry_date.isoformat()})."
    )
    return title, body


async def dispatch_deadline_notifications(db: AsyncSession, organization_id: uuid.UUID, new_alerts: list[NewAlert]) -> None:
    if not new_alerts:
        return
    deadline_ids = {a.source_id for a in new_alerts}
    stmt = (
        select(RecordDeadline, Record, ModelDefinition, FieldDefinition)
        .join(Record, Record.id == RecordDeadline.record_id)
        .join(ModelDefinition, ModelDefinition.id == Record.model_definition_id)
        .join(FieldDefinition, FieldDefinition.id == RecordDeadline.field_definition_id)
        .where(RecordDeadline.id.in_(deadline_ids))
    )
    context_by_id = {row[0].id: row for row in (await db.execute(stmt)).all()}

    carrier = InAppCarrier(db, organization_id)
    for alert in new_alerts:
        if alert.recipient_user_id is None or (ctx := context_by_id.get(alert.source_id)) is None:
            continue
        deadline, record, model, field = ctx
        title, body = format_deadline_alert(record, model, field, deadline.due_date, alert.palier)
        await carrier.send(
            NotificationIntent(recipient_user_id=alert.recipient_user_id, title=title, body=body, related_alert_id=alert.id)
        )


async def dispatch_stock_threshold_notifications(
    db: AsyncSession, organization_id: uuid.UUID, new_alerts: list[NewAlert]
) -> None:
    if not new_alerts:
        return
    level_ids = {a.source_id for a in new_alerts}
    stmt = (
        select(StockLevel, ArticleVariant, Depot)
        .join(ArticleVariant, ArticleVariant.id == StockLevel.variant_id)
        .join(Depot, Depot.id == StockLevel.depot_id)
        .where(StockLevel.id.in_(level_ids))
    )
    context_by_id = {row[0].id: row for row in (await db.execute(stmt)).all()}

    carrier = InAppCarrier(db, organization_id)
    for alert in new_alerts:
        if alert.recipient_user_id is None or (ctx := context_by_id.get(alert.source_id)) is None:
            continue
        level, variant, depot = ctx
        threshold = variant.default_threshold if variant.default_threshold is not None else 0
        title, body = format_stock_threshold_alert(variant, depot, level.quantity, threshold)
        await carrier.send(
            NotificationIntent(recipient_user_id=alert.recipient_user_id, title=title, body=body, related_alert_id=alert.id)
        )


async def dispatch_lot_expiry_notifications(db: AsyncSession, organization_id: uuid.UUID, new_alerts: list[NewAlert]) -> None:
    if not new_alerts:
        return
    lot_ids = {a.source_id for a in new_alerts}
    stmt = (
        select(StockLot, ArticleVariant, Depot)
        .join(ArticleVariant, ArticleVariant.id == StockLot.variant_id)
        .join(Depot, Depot.id == StockLot.depot_id)
        .where(StockLot.id.in_(lot_ids))
    )
    context_by_id = {row[0].id: row for row in (await db.execute(stmt)).all()}

    carrier = InAppCarrier(db, organization_id)
    for alert in new_alerts:
        if alert.recipient_user_id is None or (ctx := context_by_id.get(alert.source_id)) is None:
            continue
        lot, variant, depot = ctx
        title, body = format_lot_expiry_alert(variant, depot, lot.lot_number, lot.expiry_date, alert.palier)
        await carrier.send(
            NotificationIntent(recipient_user_id=alert.recipient_user_id, title=title, body=body, related_alert_id=alert.id)
        )
