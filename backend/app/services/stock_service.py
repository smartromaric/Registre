import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.alerts.engine import resolve_alerts_for_lot, resolve_stock_threshold_alerts_if_above
from app.core.permissions import Action, role_can
from app.models.membership import Membership
from app.models.record import Record
from app.models.stock import (
    ArticleConfig,
    ArticleVariant,
    ConsignmentLevel,
    Depot,
    DepotThreshold,
    MovementType,
    StockMovement,
)
from app.models.user import User
from app.repositories.stock import StockRepository
from app.schemas.stock import (
    AdjustmentCreate,
    ArticleConfigCreate,
    ConsignmentActionCreate,
    ConsignmentSummaryOut,
    DepotCreate,
    DepotUpdate,
    MovementCreate,
    ThresholdSet,
    TransferCreate,
    VariantInput,
)
from app.services.audit_service import AuditService
from app.services.organization_service import PermissionDeniedError


class StockError(Exception):
    pass


class InsufficientStockError(StockError):
    pass


def _default_variant_label(attributes: dict | None) -> str | None:
    if not attributes:
        return None
    return " / ".join(str(v) for v in attributes.values())


class StockService:
    """Cahier des charges §7. Un mouvement est toujours immuable et additif
    (§7.3, §11.3, §11.4) : on n'écrit jamais une correction dessus, on ajoute un
    mouvement inverse. `StockLevel` — la quantité courante par (variante, dépôt)
    — est tenue à jour par un trigger Postgres sur l'insertion (voir la
    migration) : l'incrément est atomique même sous écritures concurrentes,
    condition posée dès le lot 0 pour que la synchronisation hors-ligne (lot 5)
    n'ait jamais à réécrire ce socle (§11.4).
    """

    def __init__(self, db: AsyncSession):
        self.db = db
        self.repo = StockRepository(db)
        self.audit = AuditService(db)

    # --- dépôts -----------------------------------------------------------------

    async def create_depot(
        self, *, organization_id: uuid.UUID, actor: User, actor_membership: Membership, payload: DepotCreate
    ) -> Depot:
        if not role_can(actor_membership.role, Action.MANAGE_MODELS):
            raise PermissionDeniedError("Seul un administrateur peut créer un dépôt.")
        depot = Depot(organization_id=organization_id, name=payload.name, address=payload.address)
        self.db.add(depot)
        await self.db.flush()
        await self.audit.record(
            organization_id=organization_id,
            actor_user_id=actor.id,
            action="depot.create",
            entity_type="depot",
            entity_id=depot.id,
            new_value={"name": depot.name},
        )
        return depot

    async def list_depots(self, organization_id: uuid.UUID) -> list[Depot]:
        return await self.repo.list_depots(organization_id)

    async def update_depot(
        self,
        *,
        organization_id: uuid.UUID,
        actor: User,
        actor_membership: Membership,
        depot: Depot,
        payload: DepotUpdate,
    ) -> Depot:
        if not role_can(actor_membership.role, Action.MANAGE_MODELS):
            raise PermissionDeniedError("Seul un administrateur peut modifier un dépôt.")
        changes = payload.model_dump(exclude_unset=True)
        old_value = {k: getattr(depot, k) for k in changes}
        for key, value in changes.items():
            setattr(depot, key, value)
        await self.db.flush()
        await self.audit.record(
            organization_id=organization_id,
            actor_user_id=actor.id,
            action="depot.update",
            entity_type="depot",
            entity_id=depot.id,
            old_value=old_value,
            new_value=changes,
        )
        return depot

    # --- articles / variantes ------------------------------------------------------

    async def configure_article(
        self,
        *,
        organization_id: uuid.UUID,
        actor: User,
        actor_membership: Membership,
        record: Record,
        payload: ArticleConfigCreate,
    ) -> tuple[ArticleConfig, list[ArticleVariant]]:
        if not role_can(actor_membership.role, Action.MANAGE_MODELS):
            raise PermissionDeniedError("Seul un administrateur peut configurer un article.")

        config = ArticleConfig(
            organization_id=organization_id,
            record_id=record.id,
            unit=payload.unit,
            purchase_price=payload.purchase_price,
            sale_price=payload.sale_price,
            variant_attribute_labels=payload.variant_attribute_labels,
            lot_tracking_enabled=payload.lot_tracking_enabled,
            is_consigned=payload.is_consigned,
            deposit_unit_amount=payload.deposit_unit_amount,
        )
        self.db.add(config)

        variant_inputs = payload.variants or [VariantInput()]
        variants: list[ArticleVariant] = []
        for variant_in in variant_inputs:
            variant = ArticleVariant(
                organization_id=organization_id,
                record_id=record.id,
                attributes=variant_in.attributes,
                label=variant_in.label or _default_variant_label(variant_in.attributes),
                is_default=not variant_in.attributes,
                default_threshold=variant_in.default_threshold,
            )
            self.db.add(variant)
            variants.append(variant)

        await self.db.flush()
        await self.audit.record(
            organization_id=organization_id,
            actor_user_id=actor.id,
            action="article.configure",
            entity_type="record",
            entity_id=record.id,
            new_value={"is_consigned": config.is_consigned, "variant_count": len(variants)},
        )
        return config, variants

    async def add_variant(
        self,
        *,
        organization_id: uuid.UUID,
        actor: User,
        actor_membership: Membership,
        record: Record,
        payload: VariantInput,
    ) -> ArticleVariant:
        if not role_can(actor_membership.role, Action.MANAGE_MODELS):
            raise PermissionDeniedError("Seul un administrateur peut ajouter une variante.")
        variant = ArticleVariant(
            organization_id=organization_id,
            record_id=record.id,
            attributes=payload.attributes,
            label=payload.label or _default_variant_label(payload.attributes),
            default_threshold=payload.default_threshold,
        )
        self.db.add(variant)
        await self.db.flush()
        return variant

    async def set_threshold(
        self,
        *,
        organization_id: uuid.UUID,
        actor: User,
        actor_membership: Membership,
        variant: ArticleVariant,
        payload: ThresholdSet,
    ) -> None:
        if not role_can(actor_membership.role, Action.CONFIGURE_ALERTS):
            raise PermissionDeniedError("Vous n'avez pas le droit de régler les seuils.")

        if payload.depot_id is None:
            variant.default_threshold = payload.threshold
            await self.db.flush()
            return

        existing = await self.db.execute(
            select(DepotThreshold).where(
                DepotThreshold.variant_id == variant.id, DepotThreshold.depot_id == payload.depot_id
            )
        )
        row = existing.scalar_one_or_none()
        if row is None:
            self.db.add(
                DepotThreshold(
                    organization_id=organization_id,
                    variant_id=variant.id,
                    depot_id=payload.depot_id,
                    threshold=payload.threshold,
                )
            )
        else:
            row.threshold = payload.threshold
        await self.db.flush()

    # --- mouvements -----------------------------------------------------------------

    async def record_entry(
        self, *, organization_id: uuid.UUID, actor: User, actor_membership: Membership, payload: MovementCreate
    ) -> list[StockMovement]:
        if not role_can(actor_membership.role, Action.STOCK_MOVEMENT):
            raise PermissionDeniedError("Vous n'avez pas le droit de saisir un mouvement de stock.")
        variant = await self._require_variant(organization_id, payload.variant_id)
        config = await self._require_config(variant)

        if config.lot_tracking_enabled:
            if not payload.lot_number or not payload.lot_expiry_date:
                raise StockError("Numéro de lot et date de péremption requis pour cet article.")
            await self._add_to_lot(
                organization_id, variant.id, payload.depot_id, payload.lot_number, payload.lot_expiry_date, payload.quantity
            )

        movement = StockMovement(
            organization_id=organization_id,
            variant_id=variant.id,
            depot_id=payload.depot_id,
            movement_type=MovementType.ENTRY,
            quantity_delta=payload.quantity,
            reason=payload.reason,
            supplier=payload.supplier,
            cost_amount=payload.cost_amount,
            lot_number=payload.lot_number,
            lot_expiry_date=payload.lot_expiry_date,
            document_id=payload.document_id,
            note=payload.note,
            created_by_user_id=actor.id,
        )
        self.db.add(movement)
        await self.db.flush()  # le trigger Postgres applique le delta à StockLevel

        await self._resolve_threshold_if_needed(variant.id, payload.depot_id)
        await self.audit.record(
            organization_id=organization_id,
            actor_user_id=actor.id,
            action="stock.entry",
            entity_type="stock_movement",
            entity_id=movement.id,
            new_value={"quantity": payload.quantity},
        )
        return [movement]

    async def record_exit(
        self, *, organization_id: uuid.UUID, actor: User, actor_membership: Membership, payload: MovementCreate
    ) -> list[StockMovement]:
        if not role_can(actor_membership.role, Action.STOCK_MOVEMENT):
            raise PermissionDeniedError("Vous n'avez pas le droit de saisir un mouvement de stock.")
        variant = await self._require_variant(organization_id, payload.variant_id)
        config = await self._require_config(variant)

        movements: list[StockMovement] = []
        if config.lot_tracking_enabled and not payload.lot_number:
            # FIFO automatique : "les sorties se font au plus ancien" (§7.5).
            for lot_number, qty in await self._consume_lots_fifo(variant.id, payload.depot_id, payload.quantity):
                movements.append(
                    self._build_exit_movement(organization_id, actor, variant.id, payload, qty, lot_number)
                )
        else:
            if config.lot_tracking_enabled:
                await self._consume_specific_lot(variant.id, payload.depot_id, payload.lot_number, payload.quantity)
            movements.append(
                self._build_exit_movement(organization_id, actor, variant.id, payload, payload.quantity, payload.lot_number)
            )

        self.db.add_all(movements)
        await self.db.flush()

        await self._resolve_threshold_if_needed(variant.id, payload.depot_id)
        for movement in movements:
            await self.audit.record(
                organization_id=organization_id,
                actor_user_id=actor.id,
                action="stock.exit",
                entity_type="stock_movement",
                entity_id=movement.id,
                new_value={"quantity": -movement.quantity_delta, "lot_number": movement.lot_number},
            )
        return movements

    @staticmethod
    def _build_exit_movement(
        organization_id: uuid.UUID,
        actor: User,
        variant_id: uuid.UUID,
        payload: MovementCreate,
        quantity: int,
        lot_number: str | None,
    ) -> StockMovement:
        return StockMovement(
            organization_id=organization_id,
            variant_id=variant_id,
            depot_id=payload.depot_id,
            movement_type=MovementType.EXIT,
            quantity_delta=-quantity,
            reason=payload.reason,
            beneficiary=payload.beneficiary,
            cost_amount=payload.cost_amount,
            lot_number=lot_number,
            document_id=payload.document_id,
            note=payload.note,
            created_by_user_id=actor.id,
        )

    async def record_adjustment(
        self, *, organization_id: uuid.UUID, actor: User, actor_membership: Membership, payload: AdjustmentCreate
    ) -> StockMovement:
        if not role_can(actor_membership.role, Action.STOCK_MOVEMENT):
            raise PermissionDeniedError("Vous n'avez pas le droit de saisir un ajustement.")
        variant = await self._require_variant(organization_id, payload.variant_id)

        level = await self.repo.get_stock_level(variant.id, payload.depot_id)
        current = level.quantity if level else 0
        delta = payload.counted_quantity - current

        movement = StockMovement(
            organization_id=organization_id,
            variant_id=variant.id,
            depot_id=payload.depot_id,
            movement_type=MovementType.ADJUSTMENT,
            quantity_delta=delta,
            adjustment_counted_quantity=payload.counted_quantity,
            note=payload.note,
            created_by_user_id=actor.id,
        )
        self.db.add(movement)
        await self.db.flush()

        await self._resolve_threshold_if_needed(variant.id, payload.depot_id)
        await self.audit.record(
            organization_id=organization_id,
            actor_user_id=actor.id,
            action="stock.adjustment",
            entity_type="stock_movement",
            entity_id=movement.id,
            old_value={"before": current},
            new_value={"after": payload.counted_quantity, "delta": delta},
        )
        return movement

    async def record_transfer(
        self, *, organization_id: uuid.UUID, actor: User, actor_membership: Membership, payload: TransferCreate
    ) -> tuple[StockMovement, StockMovement]:
        if not role_can(actor_membership.role, Action.STOCK_MOVEMENT):
            raise PermissionDeniedError("Vous n'avez pas le droit de saisir un transfert.")
        if payload.from_depot_id == payload.to_depot_id:
            raise StockError("Le dépôt d'origine et de destination doivent être différents.")
        variant = await self._require_variant(organization_id, payload.variant_id)

        group_id = uuid.uuid4()
        out_movement = StockMovement(
            organization_id=organization_id,
            variant_id=variant.id,
            depot_id=payload.from_depot_id,
            movement_type=MovementType.TRANSFER_OUT,
            quantity_delta=-payload.quantity,
            transfer_group_id=group_id,
            note=payload.note,
            created_by_user_id=actor.id,
        )
        in_movement = StockMovement(
            organization_id=organization_id,
            variant_id=variant.id,
            depot_id=payload.to_depot_id,
            movement_type=MovementType.TRANSFER_IN,
            quantity_delta=payload.quantity,
            transfer_group_id=group_id,
            note=payload.note,
            created_by_user_id=actor.id,
        )
        self.db.add_all([out_movement, in_movement])
        await self.db.flush()

        await self._resolve_threshold_if_needed(variant.id, payload.from_depot_id)
        await self._resolve_threshold_if_needed(variant.id, payload.to_depot_id)
        await self.audit.record(
            organization_id=organization_id,
            actor_user_id=actor.id,
            action="stock.transfer",
            entity_type="stock_movement",
            entity_id=group_id,
            new_value={
                "quantity": payload.quantity,
                "from_depot_id": str(payload.from_depot_id),
                "to_depot_id": str(payload.to_depot_id),
            },
        )
        return out_movement, in_movement

    # --- consignation (§7.6) ------------------------------------------------------

    async def record_consignment_action(
        self,
        *,
        organization_id: uuid.UUID,
        actor: User,
        actor_membership: Membership,
        payload: ConsignmentActionCreate,
    ) -> ConsignmentLevel:
        if not role_can(actor_membership.role, Action.STOCK_MOVEMENT):
            raise PermissionDeniedError("Vous n'avez pas le droit d'enregistrer une consignation.")
        variant = await self._require_variant(organization_id, payload.variant_id)
        config = await self._require_config(variant)
        if not config.is_consigned:
            raise StockError("Cet article n'est pas déclaré consigné.")

        level = await self.repo.get_consignment_level(variant.id, payload.depot_id)
        if level is None:
            level = ConsignmentLevel(organization_id=organization_id, variant_id=variant.id, depot_id=payload.depot_id)
            self.db.add(level)
            await self.db.flush()

        if payload.action == "deliver_full":
            movement = StockMovement(
                organization_id=organization_id,
                variant_id=variant.id,
                depot_id=payload.depot_id,
                movement_type=MovementType.EXIT,
                quantity_delta=-payload.quantity,
                reason="consignation : sortie pleine",
                created_by_user_id=actor.id,
            )
            self.db.add(movement)
            level.in_circulation_count += payload.quantity
            if payload.deposit_amount:
                level.deposit_amount_collected = float(level.deposit_amount_collected) + payload.deposit_amount
            await self.db.flush()
            await self._resolve_threshold_if_needed(variant.id, payload.depot_id)
        else:  # return_empty
            level.in_circulation_count = max(0, level.in_circulation_count - payload.quantity)
            level.empty_count += payload.quantity
            await self.db.flush()

        await self.audit.record(
            organization_id=organization_id,
            actor_user_id=actor.id,
            action=f"consignment.{payload.action}",
            entity_type="consignment_level",
            entity_id=level.id,
            new_value={"quantity": payload.quantity},
        )
        return level

    async def get_consignment_summary(
        self, organization_id: uuid.UUID, variant_id: uuid.UUID, depot_id: uuid.UUID
    ) -> ConsignmentSummaryOut:
        level = await self.repo.get_consignment_level(variant_id, depot_id)
        stock_level = await self.repo.get_stock_level(variant_id, depot_id)
        return ConsignmentSummaryOut(
            variant_id=variant_id,
            depot_id=depot_id,
            full_count=stock_level.quantity if stock_level else 0,
            empty_count=level.empty_count if level else 0,
            in_circulation_count=level.in_circulation_count if level else 0,
            deposit_amount_collected=float(level.deposit_amount_collected) if level else 0.0,
        )

    # --- lecture --------------------------------------------------------------------

    async def list_stock_levels(self, organization_id, *, variant_id=None, depot_id=None):
        return await self.repo.list_stock_levels(organization_id, variant_id=variant_id, depot_id=depot_id)

    # --- internes ---------------------------------------------------------------------

    async def _require_variant(self, organization_id: uuid.UUID, variant_id: uuid.UUID) -> ArticleVariant:
        variant = await self.repo.get_variant(variant_id)
        if variant is None or variant.organization_id != organization_id:
            raise StockError("Variante introuvable.")
        return variant

    async def _require_config(self, variant: ArticleVariant) -> ArticleConfig:
        config = await self.repo.get_article_config(variant.record_id)
        if config is None:
            raise StockError("Configuration d'article introuvable.")
        return config

    async def _add_to_lot(
        self, organization_id: uuid.UUID, variant_id: uuid.UUID, depot_id: uuid.UUID, lot_number: str, expiry_date, quantity: int
    ) -> None:
        existing = await self.repo.get_lot(variant_id, depot_id, lot_number)
        if existing is None:
            from app.models.stock import StockLot

            self.db.add(
                StockLot(
                    organization_id=organization_id,
                    variant_id=variant_id,
                    depot_id=depot_id,
                    lot_number=lot_number,
                    expiry_date=expiry_date,
                    remaining_quantity=quantity,
                )
            )
        else:
            existing.remaining_quantity += quantity
            existing.expiry_date = expiry_date
        await self.db.flush()

    async def _consume_lots_fifo(self, variant_id: uuid.UUID, depot_id: uuid.UUID, quantity: int) -> list[tuple[str, int]]:
        lots = await self.repo.lock_available_lots_fifo(variant_id, depot_id)
        remaining = quantity
        plan: list[tuple[str, int]] = []
        for lot in lots:
            if remaining <= 0:
                break
            take = min(lot.remaining_quantity, remaining)
            lot.remaining_quantity -= take
            remaining -= take
            plan.append((lot.lot_number, take))
            if lot.remaining_quantity == 0:
                await resolve_alerts_for_lot(self.db, lot.id)
        if remaining > 0:
            raise InsufficientStockError(f"Stock de lots insuffisant : {remaining} unité(s) manquante(s).")
        await self.db.flush()
        return plan

    async def _consume_specific_lot(
        self, variant_id: uuid.UUID, depot_id: uuid.UUID, lot_number: str | None, quantity: int
    ) -> None:
        if not lot_number:
            raise StockError("Numéro de lot requis pour cet article.")
        lot = await self.repo.get_lot(variant_id, depot_id, lot_number)
        if lot is None or lot.remaining_quantity < quantity:
            raise InsufficientStockError(f"Lot {lot_number} : stock insuffisant.")
        lot.remaining_quantity -= quantity
        await self.db.flush()
        if lot.remaining_quantity == 0:
            await resolve_alerts_for_lot(self.db, lot.id)

    async def _resolve_threshold_if_needed(self, variant_id: uuid.UUID, depot_id: uuid.UUID) -> None:
        level = await self.repo.get_stock_level(variant_id, depot_id)
        if level is None:
            return
        variant = await self.repo.get_variant(variant_id)
        result = await self.db.execute(
            select(DepotThreshold.threshold).where(
                DepotThreshold.variant_id == variant_id, DepotThreshold.depot_id == depot_id
            )
        )
        depot_threshold = result.scalar_one_or_none()
        effective = depot_threshold if depot_threshold is not None else (variant.default_threshold if variant else None)
        if effective is not None and level.quantity > effective:
            await resolve_stock_threshold_alerts_if_above(self.db, level.id)
