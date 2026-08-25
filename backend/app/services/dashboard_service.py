import uuid
from datetime import UTC, date, datetime, time, timedelta

from sqlalchemy import Select, and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import Action, role_can
from app.models.dashboard import DashboardPeriod, SavedDashboard
from app.models.membership import Membership
from app.models.model_definition import FieldDefinition, ModelDefinition, RecordNature
from app.models.record import Record, RecordDeadline, RecordEvent
from app.models.stock import (
    ArticleConfig,
    ArticleVariant,
    Depot,
    DepotThreshold,
    MovementType,
    StockLevel,
    StockLot,
    StockMovement,
)
from app.models.user import User
from app.schemas.dashboard import (
    AssetIndicators,
    AttentionCounters,
    DashboardOut,
    DashboardScope,
    DayMovements,
    DeadlineHitOut,
    DepotQuantity,
    ExpiringLotHitOut,
    MonthAmount,
    MonthCount,
    SavedDashboardCreate,
    SavedDashboardUpdate,
    StatusCount,
    StockIndicators,
    SummaryCounters,
    UnderstockHitOut,
    VariantQuantity,
)

# §10.1/§10.3 : fenêtre "à venir" pour les échéances et les lots proches de la
# péremption — alignée sur le palier le plus lointain du moteur d'alertes
# (DEFAULT_REMINDER_OFFSETS_DAYS / DEFAULT_LOT_EXPIRY_OFFSETS_DAYS = 30 jours).
NEAR_TERM_DAYS = 30


class SavedDashboardNotFoundError(Exception):
    pass


def _period_bounds(period: DashboardPeriod, today: date) -> tuple[date, date]:
    if period == DashboardPeriod.DAYS_7:
        return today - timedelta(days=7), today
    if period == DashboardPeriod.DAYS_90:
        return today - timedelta(days=90), today
    if period == DashboardPeriod.CURRENT_YEAR:
        return date(today.year, 1, 1), today
    return today - timedelta(days=30), today  # DAYS_30, défaut


def _as_utc_range(period_start: date, period_end: date) -> tuple[datetime, datetime]:
    """`StockMovement.created_at` est un timestamp, pas une date : borne de fin
    exclusive au lendemain minuit pour inclure toute la journée `period_end`."""
    start = datetime.combine(period_start, time.min, tzinfo=UTC)
    end = datetime.combine(period_end + timedelta(days=1), time.min, tzinfo=UTC)
    return start, end


def _record_title(record: Record, model: ModelDefinition) -> str:
    value = record.data.get(model.title_field_key) if model.title_field_key else None
    return str(value) if value else "Fiche sans titre"


def _effective_threshold_column():
    return func.coalesce(DepotThreshold.threshold, ArticleVariant.default_threshold)


class DashboardService:
    """Cahier des charges §10. Chaque compteur "cliquable" (§10.5) a une requête
    de comptage et une requête de liste qui partagent le même filtrage — pour ne
    jamais afficher un nombre que la liste ouverte en cliquant dessus ne
    justifierait pas.
    """

    def __init__(self, db: AsyncSession):
        self.db = db

    # --- tableau de bord calculé ------------------------------------------------

    async def compute(
        self,
        *,
        organization_id: uuid.UUID,
        actor_membership: Membership,
        model_definition_id: uuid.UUID | None,
        depot_id: uuid.UUID | None,
        site: str | None,
        period: DashboardPeriod,
        today: date,
    ) -> DashboardOut:
        period_start, period_end = _period_bounds(period, today)
        model = None
        if model_definition_id is not None:
            model = await self.db.get(ModelDefinition, model_definition_id)
            if model is None or model.organization_id != organization_id:
                model = None
        depot = None
        if depot_id is not None:
            depot = await self.db.get(Depot, depot_id)
            if depot is None or depot.organization_id != organization_id:
                depot = None

        scope = DashboardScope(
            model_definition_id=model.id if model else None,
            model_name=model.name_plural if model else None,
            nature=model.nature if model else None,
            depot_id=depot.id if depot else None,
            depot_name=depot.name if depot else None,
            site=site,
            period=period,
            period_start=period_start,
            period_end=period_end,
        )

        can_view_amounts = role_can(actor_membership.role, Action.VIEW_AMOUNTS) and actor_membership.can_view_amounts

        if model is None:
            attention = await self._attention_counters(organization_id, depot_id=depot_id, site=site, today=today)
            summary = await self._summary_counters(organization_id, can_view_amounts=can_view_amounts)
            return DashboardOut(scope=scope, attention=attention, summary=summary, asset=None, stock=None)

        if model.nature == RecordNature.ASSET:
            asset = await self._asset_indicators(
                organization_id, model, depot_id=depot_id, site=site, today=today,
                period_start=period_start, period_end=period_end, can_view_amounts=can_view_amounts,
            )
            return DashboardOut(scope=scope, attention=None, summary=None, asset=asset, stock=None)

        stock = await self._stock_indicators(
            organization_id, model, depot_id=depot_id, today=today,
            period_start=period_start, period_end=period_end, can_view_amounts=can_view_amounts,
        )
        return DashboardOut(scope=scope, attention=None, summary=None, asset=None, stock=stock)

    # --- global (§10.1) ----------------------------------------------------------

    async def _attention_counters(
        self, organization_id: uuid.UUID, *, depot_id: uuid.UUID | None, site: str | None, today: date
    ) -> AttentionCounters:
        overdue = await self._count(self._deadlines_query(organization_id, model_id=None, site=site, today=today, overdue=True))
        upcoming = await self._count(self._deadlines_query(organization_id, model_id=None, site=site, today=today, overdue=False))
        understock = await self._count(self._understock_query(organization_id, model_id=None, depot_id=depot_id))
        expiring = await self._count(self._expiring_lots_query(organization_id, model_id=None, depot_id=depot_id, today=today))
        return AttentionCounters(
            overdue_deadlines_count=overdue,
            upcoming_deadlines_count=upcoming,
            understock_articles_count=understock,
            expiring_lots_count=expiring,
        )

    async def _summary_counters(self, organization_id: uuid.UUID, *, can_view_amounts: bool) -> SummaryCounters:
        total_records = await self._count(
            select(Record.id).where(Record.organization_id == organization_id, Record.is_archived.is_(False))
        )
        total_stock_value = None
        if can_view_amounts:
            stmt = (
                select(func.coalesce(func.sum(StockLevel.quantity * ArticleConfig.purchase_price), 0))
                .select_from(StockLevel)
                .join(ArticleVariant, StockLevel.variant_id == ArticleVariant.id)
                .join(ArticleConfig, ArticleConfig.record_id == ArticleVariant.record_id)
                .where(StockLevel.organization_id == organization_id, ArticleConfig.purchase_price.isnot(None))
            )
            total_stock_value = float((await self.db.execute(stmt)).scalar_one())
        return SummaryCounters(total_records=total_records, total_stock_value=total_stock_value)

    # --- actif suivi (§10.3) ------------------------------------------------------

    async def _asset_indicators(
        self,
        organization_id: uuid.UUID,
        model: ModelDefinition,
        *,
        depot_id: uuid.UUID | None,
        site: str | None,
        today: date,
        period_start: date,
        period_end: date,
        can_view_amounts: bool,
    ) -> AssetIndicators:
        base = select(Record).where(
            Record.organization_id == organization_id,
            Record.model_definition_id == model.id,
            Record.is_archived.is_(False),
        )
        if site:
            base = base.where(Record.site == site)

        fiche_count = await self._count(base.with_only_columns(Record.id))

        status_rows = (
            await self.db.execute(
                base.with_only_columns(Record.status, func.count()).group_by(Record.status)
            )
        ).all()
        status_breakdown = [
            StatusCount(status=status or "(sans statut)", count=count) for status, count in status_rows
        ]

        overdue = await self._count(
            self._deadlines_query(organization_id, model_id=model.id, site=site, today=today, overdue=True)
        )
        upcoming = await self._count(
            self._deadlines_query(organization_id, model_id=model.id, site=site, today=today, overdue=False)
        )

        event_cost_total = None
        event_cost_by_month = None
        if can_view_amounts:
            record_ids_subq = base.with_only_columns(Record.id).subquery()
            cost_stmt = (
                select(func.coalesce(func.sum(RecordEvent.cost_amount), 0))
                .where(
                    RecordEvent.organization_id == organization_id,
                    RecordEvent.record_id.in_(select(record_ids_subq.c.id)),
                    RecordEvent.occurred_at >= period_start,
                    RecordEvent.occurred_at <= period_end,
                )
            )
            event_cost_total = float((await self.db.execute(cost_stmt)).scalar_one())

            # Le même objet expression `month_expr` doit être réutilisé dans SELECT,
            # GROUP BY et ORDER BY — appeler `func.to_char(...)` séparément à chaque
            # fois produit trois paramètres liés ($1, $2, $3) distincts pour la même
            # chaîne "YYYY-MM" ; Postgres ne peut alors plus prouver au moment de la
            # préparation de la requête que l'expression du SELECT est bien celle du
            # GROUP BY, et rejette la requête ("must appear in the GROUP BY clause").
            month_expr = func.to_char(RecordEvent.occurred_at, "YYYY-MM")
            month_stmt = (
                select(month_expr, func.sum(RecordEvent.cost_amount))
                .where(
                    RecordEvent.organization_id == organization_id,
                    RecordEvent.record_id.in_(select(record_ids_subq.c.id)),
                    RecordEvent.occurred_at >= period_start,
                    RecordEvent.occurred_at <= period_end,
                    RecordEvent.cost_amount.isnot(None),
                )
                .group_by(month_expr)
                .order_by(month_expr)
            )
            event_cost_by_month = [
                MonthAmount(month=month, amount=float(amount)) for month, amount in (await self.db.execute(month_stmt)).all()
            ]

        deadline_month_expr = func.to_char(RecordDeadline.due_date, "YYYY-MM")
        upcoming_by_month_stmt = (
            select(deadline_month_expr, func.count())
            .select_from(RecordDeadline)
            .join(Record, RecordDeadline.record_id == Record.id)
            .where(
                RecordDeadline.organization_id == organization_id,
                Record.model_definition_id == model.id,
                Record.is_archived.is_(False),
                RecordDeadline.due_date >= today,
            )
        )
        if site:
            upcoming_by_month_stmt = upcoming_by_month_stmt.where(Record.site == site)
        upcoming_by_month_stmt = upcoming_by_month_stmt.group_by(deadline_month_expr).order_by(deadline_month_expr)
        upcoming_deadlines_by_month = [
            MonthCount(month=month, count=count) for month, count in (await self.db.execute(upcoming_by_month_stmt)).all()
        ]

        return AssetIndicators(
            fiche_count=fiche_count,
            status_breakdown=status_breakdown,
            overdue_deadlines_count=overdue,
            upcoming_deadlines_count=upcoming,
            event_cost_total=event_cost_total,
            upcoming_deadlines_by_month=upcoming_deadlines_by_month,
            event_cost_by_month=event_cost_by_month,
        )

    # --- article de stock (§10.3) -------------------------------------------------

    async def _stock_indicators(
        self,
        organization_id: uuid.UUID,
        model: ModelDefinition,
        *,
        depot_id: uuid.UUID | None,
        today: date,
        period_start: date,
        period_end: date,
        can_view_amounts: bool,
    ) -> StockIndicators:
        levels_stmt = (
            select(StockLevel, ArticleVariant)
            .select_from(StockLevel)
            .join(ArticleVariant, StockLevel.variant_id == ArticleVariant.id)
            .where(StockLevel.organization_id == organization_id, ArticleVariant.record_id.in_(
                select(Record.id).where(Record.organization_id == organization_id, Record.model_definition_id == model.id)
            ))
        )
        if depot_id is not None:
            levels_stmt = levels_stmt.where(StockLevel.depot_id == depot_id)
        levels = (await self.db.execute(levels_stmt)).all()

        total_quantity = sum(level.quantity for level, _ in levels)

        by_variant: dict[uuid.UUID, VariantQuantity] = {}
        for level, variant in levels:
            entry = by_variant.setdefault(
                variant.id, VariantQuantity(variant_id=variant.id, label=variant.label or "Sans variante", quantity=0)
            )
            entry.quantity += level.quantity

        depot_stmt = (
            select(StockLevel.depot_id, Depot.name, func.sum(StockLevel.quantity))
            .select_from(StockLevel)
            .join(Depot, StockLevel.depot_id == Depot.id)
            .join(ArticleVariant, StockLevel.variant_id == ArticleVariant.id)
            .where(StockLevel.organization_id == organization_id, ArticleVariant.record_id.in_(
                select(Record.id).where(Record.organization_id == organization_id, Record.model_definition_id == model.id)
            ))
        )
        if depot_id is not None:
            depot_stmt = depot_stmt.where(StockLevel.depot_id == depot_id)
        depot_stmt = depot_stmt.group_by(StockLevel.depot_id, Depot.name).order_by(Depot.name)
        stock_by_depot = [
            DepotQuantity(depot_id=d_id, depot_name=name, quantity=int(qty))
            for d_id, name, qty in (await self.db.execute(depot_stmt)).all()
        ]

        understock = await self._count(self._understock_query(organization_id, model_id=model.id, depot_id=depot_id))
        expiring = await self._count(
            self._expiring_lots_query(organization_id, model_id=model.id, depot_id=depot_id, today=today)
        )

        stock_value = None
        if can_view_amounts:
            value_stmt = (
                select(func.coalesce(func.sum(StockLevel.quantity * ArticleConfig.purchase_price), 0))
                .select_from(StockLevel)
                .join(ArticleVariant, StockLevel.variant_id == ArticleVariant.id)
                .join(ArticleConfig, ArticleConfig.record_id == ArticleVariant.record_id)
                .where(
                    StockLevel.organization_id == organization_id,
                    ArticleVariant.record_id.in_(
                        select(Record.id).where(Record.organization_id == organization_id, Record.model_definition_id == model.id)
                    ),
                    ArticleConfig.purchase_price.isnot(None),
                )
            )
            if depot_id is not None:
                value_stmt = value_stmt.where(StockLevel.depot_id == depot_id)
            stock_value = float((await self.db.execute(value_stmt)).scalar_one())

        period_start_utc, period_end_utc = _as_utc_range(period_start, period_end)
        movement_base = (
            select(StockMovement)
            .join(ArticleVariant, StockMovement.variant_id == ArticleVariant.id)
            .where(
                StockMovement.organization_id == organization_id,
                ArticleVariant.record_id.in_(
                    select(Record.id).where(Record.organization_id == organization_id, Record.model_definition_id == model.id)
                ),
                StockMovement.created_at >= period_start_utc,
                StockMovement.created_at < period_end_utc,
            )
        )
        if depot_id is not None:
            movement_base = movement_base.where(StockMovement.depot_id == depot_id)

        entries_stmt = movement_base.with_only_columns(
            func.coalesce(func.sum(StockMovement.quantity_delta), 0)
        ).where(StockMovement.movement_type.in_([MovementType.ENTRY, MovementType.TRANSFER_IN]))
        exits_stmt = movement_base.with_only_columns(
            func.coalesce(func.sum(-StockMovement.quantity_delta), 0)
        ).where(StockMovement.movement_type.in_([MovementType.EXIT, MovementType.TRANSFER_OUT]))
        entries_quantity_period = int((await self.db.execute(entries_stmt)).scalar_one())
        exits_quantity_period = int((await self.db.execute(exits_stmt)).scalar_one())

        by_day_stmt = movement_base.with_only_columns(
            func.date_trunc("day", StockMovement.created_at).label("day"),
            StockMovement.movement_type,
            func.sum(StockMovement.quantity_delta),
        ).group_by("day", StockMovement.movement_type).order_by("day")
        movements_by_day: dict[date, DayMovements] = {}
        for day, movement_type, delta in (await self.db.execute(by_day_stmt)).all():
            day_date = day.date()
            entry = movements_by_day.setdefault(day_date, DayMovements(day=day_date, entries_quantity=0, exits_quantity=0))
            if movement_type in (MovementType.ENTRY, MovementType.TRANSFER_IN):
                entry.entries_quantity += int(delta)
            elif movement_type in (MovementType.EXIT, MovementType.TRANSFER_OUT):
                entry.exits_quantity += -int(delta)

        return StockIndicators(
            total_quantity=int(total_quantity),
            understock_articles_count=understock,
            stock_value=stock_value,
            entries_quantity_period=entries_quantity_period,
            exits_quantity_period=exits_quantity_period,
            expiring_lots_count=expiring,
            stock_by_variant=sorted(by_variant.values(), key=lambda v: v.label),
            stock_by_depot=stock_by_depot,
            movements_by_day=sorted(movements_by_day.values(), key=lambda d: d.day),
        )

    # --- requêtes partagées comptage / liste (§10.5) ------------------------------

    def _deadlines_query(
        self, organization_id: uuid.UUID, *, model_id: uuid.UUID | None, site: str | None, today: date, overdue: bool
    ) -> Select:
        stmt = (
            select(RecordDeadline, Record, ModelDefinition)
            .select_from(RecordDeadline)
            .join(Record, RecordDeadline.record_id == Record.id)
            .join(ModelDefinition, Record.model_definition_id == ModelDefinition.id)
            .where(
                RecordDeadline.organization_id == organization_id,
                Record.is_archived.is_(False),
            )
        )
        if overdue:
            stmt = stmt.where(RecordDeadline.due_date < today)
        else:
            stmt = stmt.where(RecordDeadline.due_date >= today, RecordDeadline.due_date <= today + timedelta(days=NEAR_TERM_DAYS))
        if model_id is not None:
            stmt = stmt.where(Record.model_definition_id == model_id)
        if site:
            stmt = stmt.where(Record.site == site)
        return stmt

    def _understock_query(self, organization_id: uuid.UUID, *, model_id: uuid.UUID | None, depot_id: uuid.UUID | None) -> Select:
        stmt = (
            select(StockLevel, ArticleVariant, Record, Depot, _effective_threshold_column().label("threshold"))
            .select_from(StockLevel)
            .join(ArticleVariant, StockLevel.variant_id == ArticleVariant.id)
            .join(Record, ArticleVariant.record_id == Record.id)
            .join(Depot, StockLevel.depot_id == Depot.id)
            .outerjoin(
                DepotThreshold,
                and_(DepotThreshold.variant_id == StockLevel.variant_id, DepotThreshold.depot_id == StockLevel.depot_id),
            )
            .where(
                StockLevel.organization_id == organization_id,
                or_(DepotThreshold.threshold.isnot(None), ArticleVariant.default_threshold.isnot(None)),
                StockLevel.quantity <= _effective_threshold_column(),
            )
        )
        if model_id is not None:
            stmt = stmt.where(Record.model_definition_id == model_id)
        if depot_id is not None:
            stmt = stmt.where(StockLevel.depot_id == depot_id)
        return stmt

    def _expiring_lots_query(
        self, organization_id: uuid.UUID, *, model_id: uuid.UUID | None, depot_id: uuid.UUID | None, today: date
    ) -> Select:
        stmt = (
            select(StockLot, ArticleVariant, Record, Depot)
            .select_from(StockLot)
            .join(ArticleVariant, StockLot.variant_id == ArticleVariant.id)
            .join(Record, ArticleVariant.record_id == Record.id)
            .join(Depot, StockLot.depot_id == Depot.id)
            .where(
                StockLot.organization_id == organization_id,
                StockLot.remaining_quantity > 0,
                StockLot.expiry_date <= today + timedelta(days=NEAR_TERM_DAYS),
            )
        )
        if model_id is not None:
            stmt = stmt.where(Record.model_definition_id == model_id)
        if depot_id is not None:
            stmt = stmt.where(StockLot.depot_id == depot_id)
        return stmt

    async def _count(self, stmt: Select) -> int:
        return (await self.db.execute(select(func.count()).select_from(stmt.subquery()))).scalar_one()

    # --- listes "cliquables" (§10.5) ----------------------------------------------

    async def list_deadline_hits(
        self, organization_id: uuid.UUID, *, model_id, site, today: date, overdue: bool, limit: int, offset: int
    ) -> tuple[list[DeadlineHitOut], int]:
        base = self._deadlines_query(organization_id, model_id=model_id, site=site, today=today, overdue=overdue)
        total = await self._count(base)
        stmt = base.order_by(RecordDeadline.due_date.asc()).limit(limit).offset(offset)
        rows = (await self.db.execute(stmt)).all()
        field_defs = await self._field_labels(organization_id, {r.field_definition_id for r, _, _ in rows})
        items = [
            DeadlineHitOut(
                record_id=record.id,
                model_definition_id=model.id,
                model_name=model.name_singular,
                record_title=_record_title(record, model),
                field_key=field_defs[deadline.field_definition_id][0],
                field_label=field_defs[deadline.field_definition_id][1],
                due_date=deadline.due_date,
                days_overdue=(today - deadline.due_date).days,
            )
            for deadline, record, model in rows
        ]
        return items, total

    async def list_understock_hits(
        self, organization_id: uuid.UUID, *, model_id, depot_id, limit: int, offset: int
    ) -> tuple[list[UnderstockHitOut], int]:
        base = self._understock_query(organization_id, model_id=model_id, depot_id=depot_id)
        total = await self._count(base)
        stmt = base.order_by(StockLevel.quantity.asc()).limit(limit).offset(offset)
        rows = (await self.db.execute(stmt)).all()
        models = await self._models_by_id(organization_id, {record.model_definition_id for _, _, record, _, _ in rows})
        items = [
            UnderstockHitOut(
                record_id=record.id,
                model_name=models[record.model_definition_id].name_singular,
                record_title=_record_title(record, models[record.model_definition_id]),
                variant_id=variant.id,
                variant_label=variant.label or "Sans variante",
                depot_id=depot.id,
                depot_name=depot.name,
                quantity=level.quantity,
                threshold=threshold,
            )
            for level, variant, record, depot, threshold in rows
        ]
        return items, total

    async def list_expiring_lot_hits(
        self, organization_id: uuid.UUID, *, model_id, depot_id, today: date, limit: int, offset: int
    ) -> tuple[list[ExpiringLotHitOut], int]:
        base = self._expiring_lots_query(organization_id, model_id=model_id, depot_id=depot_id, today=today)
        total = await self._count(base)
        stmt = base.order_by(StockLot.expiry_date.asc()).limit(limit).offset(offset)
        rows = (await self.db.execute(stmt)).all()
        models = await self._models_by_id(organization_id, {record.model_definition_id for _, _, record, _ in rows})
        items = [
            ExpiringLotHitOut(
                record_id=record.id,
                model_name=models[record.model_definition_id].name_singular,
                record_title=_record_title(record, models[record.model_definition_id]),
                variant_id=variant.id,
                variant_label=variant.label or "Sans variante",
                depot_id=depot.id,
                depot_name=depot.name,
                lot_number=lot.lot_number,
                expiry_date=lot.expiry_date,
                remaining_quantity=lot.remaining_quantity,
            )
            for lot, variant, record, depot in rows
        ]
        return items, total

    async def _field_labels(self, organization_id: uuid.UUID, field_ids: set[uuid.UUID]) -> dict[uuid.UUID, tuple[str, str]]:
        if not field_ids:
            return {}
        stmt = select(FieldDefinition).where(
            FieldDefinition.organization_id == organization_id, FieldDefinition.id.in_(field_ids)
        )
        rows = (await self.db.execute(stmt)).scalars().all()
        return {f.id: (f.key, f.label) for f in rows}

    async def _models_by_id(self, organization_id: uuid.UUID, model_ids: set[uuid.UUID]) -> dict[uuid.UUID, ModelDefinition]:
        if not model_ids:
            return {}
        stmt = select(ModelDefinition).where(
            ModelDefinition.organization_id == organization_id, ModelDefinition.id.in_(model_ids)
        )
        rows = (await self.db.execute(stmt)).scalars().all()
        return {m.id: m for m in rows}

    # --- tableaux de bord enregistrés (§10.4) -------------------------------------

    async def list_saved(self, organization_id: uuid.UUID, owner: User) -> list[SavedDashboard]:
        stmt = select(SavedDashboard).where(
            SavedDashboard.organization_id == organization_id, SavedDashboard.owner_user_id == owner.id
        ).order_by(SavedDashboard.name)
        return list((await self.db.execute(stmt)).scalars().all())

    async def get_pinned(self, organization_id: uuid.UUID, owner: User) -> SavedDashboard | None:
        stmt = select(SavedDashboard).where(
            SavedDashboard.organization_id == organization_id,
            SavedDashboard.owner_user_id == owner.id,
            SavedDashboard.is_pinned.is_(True),
        )
        return (await self.db.execute(stmt)).scalar_one_or_none()

    async def create_saved(self, organization_id: uuid.UUID, owner: User, payload: SavedDashboardCreate) -> SavedDashboard:
        dashboard = SavedDashboard(
            organization_id=organization_id,
            owner_user_id=owner.id,
            name=payload.name,
            model_definition_id=payload.model_definition_id,
            depot_id=payload.depot_id,
            site=payload.site,
            period=payload.period,
        )
        self.db.add(dashboard)
        await self.db.flush()
        return dashboard

    async def update_saved(
        self, organization_id: uuid.UUID, owner: User, dashboard_id: uuid.UUID, payload: SavedDashboardUpdate
    ) -> SavedDashboard:
        dashboard = await self._get_owned(organization_id, owner, dashboard_id)
        changes = payload.model_dump(exclude_unset=True)
        pin_requested = changes.pop("is_pinned", None)
        for key, value in changes.items():
            setattr(dashboard, key, value)
        if pin_requested:
            await self._unpin_others(organization_id, owner, keep=dashboard.id)
            dashboard.is_pinned = True
        elif pin_requested is False:
            dashboard.is_pinned = False
        await self.db.flush()
        return dashboard

    async def delete_saved(self, organization_id: uuid.UUID, owner: User, dashboard_id: uuid.UUID) -> None:
        dashboard = await self._get_owned(organization_id, owner, dashboard_id)
        await self.db.delete(dashboard)
        await self.db.flush()

    async def _unpin_others(self, organization_id: uuid.UUID, owner: User, *, keep: uuid.UUID) -> None:
        others = await self.list_saved(organization_id, owner)
        for other in others:
            if other.id != keep and other.is_pinned:
                other.is_pinned = False
        await self.db.flush()

    async def _get_owned(self, organization_id: uuid.UUID, owner: User, dashboard_id: uuid.UUID) -> SavedDashboard:
        dashboard = await self.db.get(SavedDashboard, dashboard_id)
        if dashboard is None or dashboard.organization_id != organization_id or dashboard.owner_user_id != owner.id:
            raise SavedDashboardNotFoundError("Tableau de bord introuvable.")
        return dashboard
