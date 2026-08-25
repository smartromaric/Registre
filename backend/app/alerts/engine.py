"""Le moteur qui porte la valeur du produit (cahier des charges §8). Balaie les
échéances, les seuils de stock et les lots proches de la péremption, calcule les
paliers de rappel franchis, et écrit les alertes de façon idempotente : rejouer
le balayage le même jour ne doit rien dupliquer (§8.2).
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
from app.models.stock import ArticleVariant, DepotThreshold, StockLevel, StockLot

# Cahier des charges §8.1 : péremption de lot, J-30, J-7, jour J. Le tableau ne
# précise pas de relance en cas de retard (lot non écoulé après péremption) ;
# on applique par sécurité le même principe qu'ailleurs — relance hebdomadaire —
# plutôt que de laisser un lot périmé silencieux indéfiniment.
DEFAULT_LOT_EXPIRY_OFFSETS_DAYS = [30, 7, 0]
DEFAULT_LOT_EXPIRY_REPEAT_DAYS_OVERDUE = 7


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


def compute_weekly_palier(today: date) -> str:
    """Cahier des charges §8.1 : seuil de stock — alerte au franchissement, puis
    rappel hebdomadaire tant que la situation dure. Une clé par semaine ISO : le
    balayage ne réinsère rien de plus tant qu'on reste dans la même semaine.
    """
    iso = today.isocalendar()
    return f"week-{iso.year}-{iso.week:02d}"


@dataclass
class NewAlert:
    id: uuid.UUID
    organization_id: uuid.UUID
    source_id: uuid.UUID
    palier: str
    recipient_user_id: uuid.UUID | None


async def _default_recipients(db: AsyncSession, organization_id: uuid.UUID) -> list[uuid.UUID]:
    """Cahier des charges §8.1 : « Gestionnaire du modèle » / « Responsable du
    dépôt ». Le lot 1/2 ne modélisent pas encore ces affectations nominatives —
    on notifie les administrateurs et gestionnaires actifs de l'organisation ;
    affiner par modèle/dépôt est une évolution naturelle du lot 3, pas un
    changement de moteur.
    """
    stmt = select(Membership.user_id).where(
        Membership.organization_id == organization_id,
        Membership.is_active.is_(True),
        Membership.role.in_([OrgRole.ADMIN, OrgRole.MANAGER]),
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def _insert_alerts(
    db: AsyncSession, organization_id: uuid.UUID, source_type: AlertSourceType, candidates: list[tuple[uuid.UUID, str]]
) -> list[NewAlert]:
    """`candidates` : (source_id, palier). Recipients dupliqués pour chaque
    candidat — `ON CONFLICT DO NOTHING` sur (organisation, source, palier)
    garantit l'idempotence même si plusieurs destinataires partagent la même paire.
    """
    if not candidates:
        return []
    recipients = await _default_recipients(db, organization_id)

    to_insert = [
        {
            "id": uuid.uuid4(),
            "organization_id": organization_id,
            "source_type": source_type.value,
            "source_id": source_id,
            "palier": palier,
            "status": AlertStatus.EMITTED.value,
            "recipient_user_id": recipient_id,
        }
        for source_id, palier in candidates
        for recipient_id in (recipients or [None])
    ]
    stmt = (
        pg_insert(Alert)
        .values(to_insert)
        .on_conflict_do_nothing(constraint="uq_alert_source_palier")
        .returning(Alert.id, Alert.organization_id, Alert.source_id, Alert.palier, Alert.recipient_user_id)
    )
    result = await db.execute(stmt)
    return [NewAlert(*row) for row in result.all()]


async def _resolve_alerts_for_source(db: AsyncSession, source_type: AlertSourceType, source_id: uuid.UUID) -> None:
    stmt = select(Alert).where(
        Alert.source_type == source_type,
        Alert.source_id == source_id,
        Alert.status.in_([AlertStatus.EMITTED, AlertStatus.ACKNOWLEDGED, AlertStatus.POSTPONED]),
    )
    now = datetime.now(UTC)
    for alert in (await db.execute(stmt)).scalars().all():
        alert.status = AlertStatus.RESOLVED
        alert.resolved_at = now


# --- Échéances (§5.4, §8.1) ------------------------------------------------------


async def scan_organization_deadlines(db: AsyncSession, organization_id: uuid.UUID, today: date) -> list[NewAlert]:
    stmt = (
        select(RecordDeadline, FieldDefinition)
        .join(FieldDefinition, FieldDefinition.id == RecordDeadline.field_definition_id)
        .join(Record, Record.id == RecordDeadline.record_id)
        .where(RecordDeadline.organization_id == organization_id, Record.is_archived.is_(False))
    )
    rows = (await db.execute(stmt)).all()

    candidates: list[tuple[uuid.UUID, str]] = []
    for deadline, field in rows:
        offsets = field.reminder_offsets_days or DEFAULT_REMINDER_OFFSETS_DAYS
        repeat = field.reminder_repeat_days_overdue or DEFAULT_REMINDER_REPEAT_DAYS_OVERDUE
        for palier in compute_paliers_for_today(deadline.due_date, today, offsets, repeat):
            candidates.append((deadline.id, palier))

    return await _insert_alerts(db, organization_id, AlertSourceType.DEADLINE, candidates)


async def resolve_alerts_for_deadline(db: AsyncSession, record_deadline_id: uuid.UUID) -> None:
    """Cahier des charges §5.4 : quand l'échéance est renouvelée, toute alerte
    ouverte sur l'ancienne date se referme d'elle-même.
    """
    await _resolve_alerts_for_source(db, AlertSourceType.DEADLINE, record_deadline_id)


# --- Seuils de stock (§7.4, §8.1) -------------------------------------------------


async def scan_organization_stock_thresholds(db: AsyncSession, organization_id: uuid.UUID, today: date) -> list[NewAlert]:
    stmt = (
        select(StockLevel, ArticleVariant, DepotThreshold.threshold)
        .join(ArticleVariant, ArticleVariant.id == StockLevel.variant_id)
        .outerjoin(
            DepotThreshold,
            (DepotThreshold.variant_id == StockLevel.variant_id) & (DepotThreshold.depot_id == StockLevel.depot_id),
        )
        .where(StockLevel.organization_id == organization_id)
    )
    rows = (await db.execute(stmt)).all()

    palier = compute_weekly_palier(today)
    candidates: list[tuple[uuid.UUID, str]] = []
    for level, variant, depot_threshold in rows:
        effective_threshold = depot_threshold if depot_threshold is not None else variant.default_threshold
        if effective_threshold is None:
            continue
        if level.quantity <= effective_threshold:
            candidates.append((level.id, palier))
        else:
            await _resolve_alerts_for_source(db, AlertSourceType.STOCK_THRESHOLD, level.id)

    return await _insert_alerts(db, organization_id, AlertSourceType.STOCK_THRESHOLD, candidates)


async def resolve_stock_threshold_alerts_if_above(db: AsyncSession, stock_level_id: uuid.UUID) -> None:
    """Appelé juste après un mouvement (voir StockService) pour refermer
    l'alerte dès que le stock repasse au-dessus du seuil, sans attendre le
    prochain balayage nocturne (§8.3 : "résolue automatiquement").
    """
    await _resolve_alerts_for_source(db, AlertSourceType.STOCK_THRESHOLD, stock_level_id)


# --- Péremption de lot (§7.5, §8.1) -----------------------------------------------


async def scan_organization_lot_expiries(db: AsyncSession, organization_id: uuid.UUID, today: date) -> list[NewAlert]:
    stmt = select(StockLot).where(StockLot.organization_id == organization_id, StockLot.remaining_quantity > 0)
    lots = (await db.execute(stmt)).scalars().all()

    candidates: list[tuple[uuid.UUID, str]] = []
    for lot in lots:
        for palier in compute_paliers_for_today(
            lot.expiry_date, today, DEFAULT_LOT_EXPIRY_OFFSETS_DAYS, DEFAULT_LOT_EXPIRY_REPEAT_DAYS_OVERDUE
        ):
            candidates.append((lot.id, palier))

    return await _insert_alerts(db, organization_id, AlertSourceType.LOT_EXPIRY, candidates)


async def resolve_alerts_for_lot(db: AsyncSession, stock_lot_id: uuid.UUID) -> None:
    """Un lot épuisé (remaining_quantity == 0) n'a plus de raison d'alerter."""
    await _resolve_alerts_for_source(db, AlertSourceType.LOT_EXPIRY, stock_lot_id)
