import uuid
from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.alerts.engine import NewAlert
from app.models.model_definition import FieldDefinition, ModelDefinition
from app.models.record import Record, RecordDeadline
from app.notifications.carriers import InAppCarrier
from app.notifications.intents import NotificationIntent


def format_deadline_alert(
    record: Record, model: ModelDefinition, field: FieldDefinition, due_date: date, palier: str
) -> tuple[str, str]:
    title_value = record.data.get(model.title_field_key) if model.title_field_key else None
    subject = str(title_value) if title_value else "fiche sans titre"

    if palier.startswith("overdue"):
        status_txt = "en retard"
    elif palier == "j-0":
        status_txt = "échéance aujourd'hui"
    else:
        status_txt = f"échéance dans {palier.removeprefix('j-')} jours"

    title = f"{field.label} — {subject}"
    body = f"{model.name_singular} {subject} : {field.label} {status_txt} (le {due_date.isoformat()})."
    return title, body


async def dispatch_new_alert_notifications(
    db: AsyncSession, organization_id: uuid.UUID, new_alerts: list[NewAlert]
) -> None:
    """Crée une notification dans l'application pour chaque alerte nouvellement
    émise (§8.5 : le centre de notifications liste chaque échéance individuellement
    — c'est le récapitulatif e-mail quotidien qui, lui, les regroupe, §8.4).
    """
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
    context_by_deadline = {row[0].id: row for row in (await db.execute(stmt)).all()}

    carrier = InAppCarrier(db, organization_id)
    for alert in new_alerts:
        if alert.recipient_user_id is None:
            continue
        ctx = context_by_deadline.get(alert.source_id)
        if ctx is None:
            continue
        deadline, record, model, field = ctx
        title, body = format_deadline_alert(record, model, field, deadline.due_date, alert.palier)
        await carrier.send(
            NotificationIntent(
                recipient_user_id=alert.recipient_user_id,
                title=title,
                body=body,
                related_alert_id=alert.id,
            )
        )
