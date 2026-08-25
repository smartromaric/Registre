"""Le moteur qui porte la valeur du produit (cahier des charges §8). Balaie les
échéances, calcule les paliers de rappel franchis, et écrit les alertes de façon
idempotente : rejouer le balayage le même jour ne doit rien dupliquer (§8.2).
"""

import uuid
from dataclasses import dataclass
from datetime import UTC, date, datetime

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.dynamic_fields.types import DEFAULT_REMINDER_OFFSETS_DAYS, DEFAULT_REMINDER_REPEAT_DAYS_OVERDUE
from app.models.alert import Alert, AlertSourceType, AlertStatus
from app.models.membership import Membership, OrgRole
from app.models.model_definition import FieldDefinition
from app.models.record import Record, RecordDeadline


def compute_paliers_for_today(
    due_date: date, today: date, offsets_days: list[int], repeat_days_overdue: int
) -> list[str]:
    """Cahier des charges §8.1 : J-60, J-30, J-7, jour J, puis tous les X jours en
    retard. On émet TOUT palier déjà atteint (pas seulement celui du jour) : si le
    balayage a sauté une exécution, on rattrape plutôt que de rater une alerte —
    l'objectif O1 exige au moins une alerte 30 jours avant, pas exactement à J-30.
    """
    days_remaining = (due_date - today).days
    if days_remaining >= 0:
        return [f"j-{offset}" for offset in sorted(offsets_days) if days_remaining <= offset]

    days_overdue = -days_remaining
    cycle = (days_overdue - 1) // max(repeat_days_overdue, 1)
    return [f"overdue-{cycle}"]


@dataclass
class NewAlert:
    id: uuid.UUID
    organization_id: uuid.UUID
    source_id: uuid.UUID
    palier: str
    recipient_user_id: uuid.UUID | None


async def _default_recipients(db: AsyncSession, organization_id: uuid.UUID) -> list[uuid.UUID]:
    """Cahier des charges §8.1 : « Gestionnaire du modèle ». Le lot 1 ne modélise
    pas encore un gestionnaire par modèle — on notifie les administrateurs et
    gestionnaires actifs de l'organisation ; affiner par modèle est une évolution
    naturelle du lot 3 (vues/permissions avancées), pas un changement de moteur.
    """
    stmt = select(Membership.user_id).where(
        Membership.organization_id == organization_id,
        Membership.is_active.is_(True),
        Membership.role.in_([OrgRole.ADMIN, OrgRole.MANAGER]),
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def scan_organization_deadlines(db: AsyncSession, organization_id: uuid.UUID, today: date) -> list[NewAlert]:
    """Rejouable sans effet de bord (§8.2) : la contrainte d'unicité
    (organisation, source, palier) sur `alerts` fait que `ON CONFLICT DO NOTHING`
    ne réinsère jamais deux fois la même alerte, même appelé plusieurs fois le
    même jour.
    """
    stmt = (
        select(RecordDeadline, FieldDefinition)
        .join(FieldDefinition, FieldDefinition.id == RecordDeadline.field_definition_id)
        .join(Record, Record.id == RecordDeadline.record_id)
        .where(RecordDeadline.organization_id == organization_id, Record.is_archived.is_(False))
    )
    rows = (await db.execute(stmt)).all()
    if not rows:
        return []

    recipients = await _default_recipients(db, organization_id)

    to_insert: list[dict] = []
    for deadline, field in rows:
        offsets = field.reminder_offsets_days or DEFAULT_REMINDER_OFFSETS_DAYS
        repeat = field.reminder_repeat_days_overdue or DEFAULT_REMINDER_REPEAT_DAYS_OVERDUE
        paliers = compute_paliers_for_today(deadline.due_date, today, offsets, repeat)
        for palier in paliers:
            for recipient_id in recipients or [None]:
                to_insert.append(
                    {
                        "id": uuid.uuid4(),
                        "organization_id": organization_id,
                        "source_type": AlertSourceType.DEADLINE.value,
                        "source_id": deadline.id,
                        "palier": palier,
                        "status": AlertStatus.EMITTED.value,
                        "recipient_user_id": recipient_id,
                    }
                )

    if not to_insert:
        return []

    stmt = (
        pg_insert(Alert)
        .values(to_insert)
        .on_conflict_do_nothing(constraint="uq_alert_source_palier")
        .returning(Alert.id, Alert.organization_id, Alert.source_id, Alert.palier, Alert.recipient_user_id)
    )
    result = await db.execute(stmt)
    return [NewAlert(*row) for row in result.all()]


async def resolve_alerts_for_deadline(db: AsyncSession, record_deadline_id: uuid.UUID) -> None:
    """Cahier des charges §5.4 : quand l'échéance est renouvelée, toute alerte
    ouverte sur l'ancienne date se referme d'elle-même.
    """
    stmt = select(Alert).where(
        Alert.source_type == AlertSourceType.DEADLINE,
        Alert.source_id == record_deadline_id,
        Alert.status.in_([AlertStatus.EMITTED, AlertStatus.ACKNOWLEDGED, AlertStatus.POSTPONED]),
    )
    now = datetime.now(UTC)
    for alert in (await db.execute(stmt)).scalars().all():
        alert.status = AlertStatus.RESOLVED
        alert.resolved_at = now
