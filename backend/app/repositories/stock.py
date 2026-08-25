import uuid
from datetime import date

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.stock import (
    ArticleConfig,
    ArticleVariant,
    ConsignmentLevel,
    Depot,
    DepotThreshold,
    StockLevel,
    StockLot,
    StockMovement,
)


class StockRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    # --- dépôts ---------------------------------------------------------------

    async def list_depots(self, organization_id: uuid.UUID, *, include_inactive: bool = False) -> list[Depot]:
        stmt = select(Depot).where(Depot.organization_id == organization_id)
        if not include_inactive:
            stmt = stmt.where(Depot.is_active.is_(True))
        return list((await self.db.execute(stmt.order_by(Depot.name))).scalars().all())

    async def get_depot(self, depot_id: uuid.UUID) -> Depot | None:
        return await self.db.get(Depot, depot_id)

    # --- articles / variantes --------------------------------------------------

    async def get_article_config(self, record_id: uuid.UUID) -> ArticleConfig | None:
        stmt = select(ArticleConfig).where(ArticleConfig.record_id == record_id)
        return (await self.db.execute(stmt)).scalar_one_or_none()

    async def list_variants(self, record_id: uuid.UUID) -> list[ArticleVariant]:
        stmt = select(ArticleVariant).where(ArticleVariant.record_id == record_id).order_by(ArticleVariant.label)
        return list((await self.db.execute(stmt)).scalars().all())

    async def get_variant(self, variant_id: uuid.UUID) -> ArticleVariant | None:
        return await self.db.get(ArticleVariant, variant_id)

    # --- niveaux de stock --------------------------------------------------------

    async def get_stock_level(self, variant_id: uuid.UUID, depot_id: uuid.UUID) -> StockLevel | None:
        stmt = select(StockLevel).where(StockLevel.variant_id == variant_id, StockLevel.depot_id == depot_id)
        return (await self.db.execute(stmt)).scalar_one_or_none()

    async def get_stock_level_for_update(self, variant_id: uuid.UUID, depot_id: uuid.UUID) -> StockLevel | None:
        """Même granularité de verrou que `lock_available_lots_fifo` pour les
        articles suivis en lots — nécessaire pour qu'une vérification de
        suffisance de stock (sortie non suivie en lots) ne puisse jamais être
        contournée par deux sorties concurrentes lisant la même quantité avant
        que l'une des deux n'ait eu le temps de commiter."""
        stmt = (
            select(StockLevel)
            .where(StockLevel.variant_id == variant_id, StockLevel.depot_id == depot_id)
            .with_for_update()
        )
        return (await self.db.execute(stmt)).scalar_one_or_none()

    async def list_stock_levels(
        self, organization_id: uuid.UUID, *, variant_id: uuid.UUID | None = None, depot_id: uuid.UUID | None = None
    ) -> list[StockLevel]:
        stmt = select(StockLevel).where(StockLevel.organization_id == organization_id)
        if variant_id is not None:
            stmt = stmt.where(StockLevel.variant_id == variant_id)
        if depot_id is not None:
            stmt = stmt.where(StockLevel.depot_id == depot_id)
        return list((await self.db.execute(stmt)).scalars().all())

    # --- lots (FIFO) -------------------------------------------------------------

    async def lock_available_lots_fifo(self, variant_id: uuid.UUID, depot_id: uuid.UUID) -> list[StockLot]:
        """Verrouille (`FOR UPDATE`) les lots disponibles, du plus proche de la
        péremption au plus lointain — évite qu'une sortie concurrente ne
        consomme deux fois le même lot pendant la même transaction (§7.5).
        """
        stmt = (
            select(StockLot)
            .where(
                StockLot.variant_id == variant_id,
                StockLot.depot_id == depot_id,
                StockLot.remaining_quantity > 0,
            )
            .order_by(StockLot.expiry_date.asc())
            .with_for_update()
        )
        return list((await self.db.execute(stmt)).scalars().all())

    async def get_lot(self, variant_id: uuid.UUID, depot_id: uuid.UUID, lot_number: str) -> StockLot | None:
        stmt = select(StockLot).where(
            StockLot.variant_id == variant_id, StockLot.depot_id == depot_id, StockLot.lot_number == lot_number
        )
        return (await self.db.execute(stmt)).scalar_one_or_none()

    async def list_lots(
        self,
        organization_id: uuid.UUID,
        *,
        variant_id: uuid.UUID | None = None,
        depot_id: uuid.UUID | None = None,
        include_empty: bool = False,
        expiring_before: date | None = None,
    ) -> list[StockLot]:
        stmt = select(StockLot).where(StockLot.organization_id == organization_id)
        if not include_empty:
            stmt = stmt.where(StockLot.remaining_quantity > 0)
        if variant_id is not None:
            stmt = stmt.where(StockLot.variant_id == variant_id)
        if depot_id is not None:
            stmt = stmt.where(StockLot.depot_id == depot_id)
        if expiring_before is not None:
            stmt = stmt.where(StockLot.expiry_date <= expiring_before)
        stmt = stmt.order_by(StockLot.expiry_date.asc())
        return list((await self.db.execute(stmt)).scalars().all())

    async def list_variant_thresholds(self, variant_id: uuid.UUID) -> list[DepotThreshold]:
        stmt = select(DepotThreshold).where(DepotThreshold.variant_id == variant_id).order_by(DepotThreshold.depot_id)
        return list((await self.db.execute(stmt)).scalars().all())

    # --- mouvements (lecture) -----------------------------------------------------

    async def list_movements(
        self,
        organization_id: uuid.UUID,
        *,
        variant_id: uuid.UUID | None = None,
        depot_id: uuid.UUID | None = None,
        record_id: uuid.UUID | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[StockMovement], int]:
        stmt = select(StockMovement).where(StockMovement.organization_id == organization_id)
        if variant_id is not None:
            stmt = stmt.where(StockMovement.variant_id == variant_id)
        if depot_id is not None:
            stmt = stmt.where(StockMovement.depot_id == depot_id)
        if record_id is not None:
            # Un mouvement ne porte que `variant_id` — remonter à l'article passe
            # par la variante, seule table qui connaît son `record_id`.
            stmt = stmt.where(
                StockMovement.variant_id.in_(select(ArticleVariant.id).where(ArticleVariant.record_id == record_id))
            )
        total = (await self.db.execute(select(func.count()).select_from(stmt.subquery()))).scalar_one()
        stmt = stmt.order_by(StockMovement.created_at.desc()).limit(limit).offset(offset)
        rows = list((await self.db.execute(stmt)).scalars().all())
        return rows, total

    # --- idempotence des opérations (§11.4) -------------------------------------------

    async def list_movements_by_client_operation(
        self, organization_id: uuid.UUID, client_operation_id: uuid.UUID
    ) -> list[StockMovement]:
        stmt = select(StockMovement).where(
            StockMovement.organization_id == organization_id,
            StockMovement.client_operation_id == client_operation_id,
        )
        return list((await self.db.execute(stmt)).scalars().all())

    # --- consignation --------------------------------------------------------------

    async def get_consignment_level(self, variant_id: uuid.UUID, depot_id: uuid.UUID) -> ConsignmentLevel | None:
        stmt = select(ConsignmentLevel).where(
            ConsignmentLevel.variant_id == variant_id, ConsignmentLevel.depot_id == depot_id
        )
        return (await self.db.execute(stmt)).scalar_one_or_none()
