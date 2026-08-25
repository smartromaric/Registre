import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.stock import ArticleConfig, ArticleVariant, ConsignmentLevel, Depot, StockLevel, StockLot, StockMovement


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
