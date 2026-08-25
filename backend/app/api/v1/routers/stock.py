import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user, get_org_context
from app.models.membership import Membership
from app.models.user import User
from app.schemas.stock import (
    AdjustmentCreate,
    ArticleConfigCreate,
    ArticleConfigOut,
    ArticleVariantOut,
    ArticleWithVariantsOut,
    ConsignmentActionCreate,
    ConsignmentSummaryOut,
    DepotCreate,
    DepotOut,
    DepotUpdate,
    MovementCreate,
    MovementOut,
    StockLevelOut,
    ThresholdSet,
    TransferCreate,
    VariantInput,
)
from app.services.organization_service import PermissionDeniedError
from app.services.record_service import RecordService
from app.services.stock_service import InsufficientStockError, StockError, StockService

router = APIRouter(tags=["stock"])


def _error(exc: Exception) -> HTTPException:
    if isinstance(exc, PermissionDeniedError):
        return HTTPException(status.HTTP_403_FORBIDDEN, str(exc))
    if isinstance(exc, InsufficientStockError):
        return HTTPException(status.HTTP_409_CONFLICT, str(exc))
    return HTTPException(status.HTTP_400_BAD_REQUEST, str(exc))


# --- dépôts -----------------------------------------------------------------------


@router.get("/organizations/{organization_id}/depots", response_model=list[DepotOut])
async def list_depots(membership: Membership = Depends(get_org_context), db: AsyncSession = Depends(get_db)) -> list[DepotOut]:
    depots = await StockService(db).list_depots(membership.organization_id)
    return [DepotOut.model_validate(d) for d in depots]


@router.post("/organizations/{organization_id}/depots", response_model=DepotOut, status_code=status.HTTP_201_CREATED)
async def create_depot(
    payload: DepotCreate,
    user: User = Depends(get_current_user),
    membership: Membership = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
) -> DepotOut:
    service = StockService(db)
    try:
        depot = await service.create_depot(
            organization_id=membership.organization_id, actor=user, actor_membership=membership, payload=payload
        )
    except (PermissionDeniedError, StockError) as exc:
        raise _error(exc) from exc
    return DepotOut.model_validate(depot)


@router.patch("/organizations/{organization_id}/depots/{depot_id}", response_model=DepotOut)
async def update_depot(
    depot_id: uuid.UUID,
    payload: DepotUpdate,
    user: User = Depends(get_current_user),
    membership: Membership = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
) -> DepotOut:
    service = StockService(db)
    depot = await service.repo.get_depot(depot_id)
    if depot is None or depot.organization_id != membership.organization_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Dépôt introuvable.")
    try:
        depot = await service.update_depot(
            organization_id=membership.organization_id, actor=user, actor_membership=membership, depot=depot, payload=payload
        )
    except (PermissionDeniedError, StockError) as exc:
        raise _error(exc) from exc
    return DepotOut.model_validate(depot)


# --- articles / variantes -----------------------------------------------------------


@router.post(
    "/organizations/{organization_id}/records/{record_id}/article-config",
    response_model=ArticleWithVariantsOut,
    status_code=status.HTTP_201_CREATED,
)
async def configure_article(
    record_id: uuid.UUID,
    payload: ArticleConfigCreate,
    user: User = Depends(get_current_user),
    membership: Membership = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
) -> ArticleWithVariantsOut:
    record = await RecordService(db).get(membership.organization_id, record_id)
    if record is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Fiche introuvable.")
    service = StockService(db)
    try:
        config, variants = await service.configure_article(
            organization_id=membership.organization_id, actor=user, actor_membership=membership, record=record, payload=payload
        )
    except (PermissionDeniedError, StockError) as exc:
        raise _error(exc) from exc
    return ArticleWithVariantsOut(
        config=ArticleConfigOut.model_validate(config), variants=[ArticleVariantOut.model_validate(v) for v in variants]
    )


@router.post(
    "/organizations/{organization_id}/records/{record_id}/variants",
    response_model=ArticleVariantOut,
    status_code=status.HTTP_201_CREATED,
)
async def add_variant(
    record_id: uuid.UUID,
    payload: VariantInput,
    user: User = Depends(get_current_user),
    membership: Membership = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
) -> ArticleVariantOut:
    record = await RecordService(db).get(membership.organization_id, record_id)
    if record is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Fiche introuvable.")
    service = StockService(db)
    try:
        variant = await service.add_variant(
            organization_id=membership.organization_id, actor=user, actor_membership=membership, record=record, payload=payload
        )
    except (PermissionDeniedError, StockError) as exc:
        raise _error(exc) from exc
    return ArticleVariantOut.model_validate(variant)


@router.put("/organizations/{organization_id}/variants/{variant_id}/threshold", status_code=status.HTTP_204_NO_CONTENT)
async def set_threshold(
    variant_id: uuid.UUID,
    payload: ThresholdSet,
    user: User = Depends(get_current_user),
    membership: Membership = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
) -> None:
    service = StockService(db)
    variant = await service.repo.get_variant(variant_id)
    if variant is None or variant.organization_id != membership.organization_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Variante introuvable.")
    try:
        await service.set_threshold(
            organization_id=membership.organization_id, actor=user, actor_membership=membership, variant=variant, payload=payload
        )
    except (PermissionDeniedError, StockError) as exc:
        raise _error(exc) from exc


# --- mouvements --------------------------------------------------------------------


@router.post(
    "/organizations/{organization_id}/stock/movements/entry",
    response_model=list[MovementOut],
    status_code=status.HTTP_201_CREATED,
)
async def create_entry(
    payload: MovementCreate,
    user: User = Depends(get_current_user),
    membership: Membership = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
) -> list[MovementOut]:
    service = StockService(db)
    try:
        movements = await service.record_entry(
            organization_id=membership.organization_id, actor=user, actor_membership=membership, payload=payload
        )
    except (PermissionDeniedError, StockError) as exc:
        raise _error(exc) from exc
    return [MovementOut.model_validate(m) for m in movements]


@router.post(
    "/organizations/{organization_id}/stock/movements/exit", response_model=list[MovementOut], status_code=status.HTTP_201_CREATED
)
async def create_exit(
    payload: MovementCreate,
    user: User = Depends(get_current_user),
    membership: Membership = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
) -> list[MovementOut]:
    service = StockService(db)
    try:
        movements = await service.record_exit(
            organization_id=membership.organization_id, actor=user, actor_membership=membership, payload=payload
        )
    except (PermissionDeniedError, StockError) as exc:
        raise _error(exc) from exc
    return [MovementOut.model_validate(m) for m in movements]


@router.post(
    "/organizations/{organization_id}/stock/movements/adjustment", response_model=MovementOut, status_code=status.HTTP_201_CREATED
)
async def create_adjustment(
    payload: AdjustmentCreate,
    user: User = Depends(get_current_user),
    membership: Membership = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
) -> MovementOut:
    service = StockService(db)
    try:
        movement = await service.record_adjustment(
            organization_id=membership.organization_id, actor=user, actor_membership=membership, payload=payload
        )
    except (PermissionDeniedError, StockError) as exc:
        raise _error(exc) from exc
    return MovementOut.model_validate(movement)


@router.post(
    "/organizations/{organization_id}/stock/movements/transfer",
    response_model=list[MovementOut],
    status_code=status.HTTP_201_CREATED,
)
async def create_transfer(
    payload: TransferCreate,
    user: User = Depends(get_current_user),
    membership: Membership = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
) -> list[MovementOut]:
    service = StockService(db)
    try:
        out_movement, in_movement = await service.record_transfer(
            organization_id=membership.organization_id, actor=user, actor_membership=membership, payload=payload
        )
    except (PermissionDeniedError, StockError) as exc:
        raise _error(exc) from exc
    return [MovementOut.model_validate(out_movement), MovementOut.model_validate(in_movement)]


# --- consignation --------------------------------------------------------------------


@router.post("/organizations/{organization_id}/stock/consignment-actions", status_code=status.HTTP_201_CREATED)
async def record_consignment_action(
    payload: ConsignmentActionCreate,
    user: User = Depends(get_current_user),
    membership: Membership = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
) -> ConsignmentSummaryOut:
    service = StockService(db)
    try:
        await service.record_consignment_action(
            organization_id=membership.organization_id, actor=user, actor_membership=membership, payload=payload
        )
    except (PermissionDeniedError, StockError) as exc:
        raise _error(exc) from exc
    return await service.get_consignment_summary(membership.organization_id, payload.variant_id, payload.depot_id)


# --- lecture ---------------------------------------------------------------------------


@router.get("/organizations/{organization_id}/stock/levels", response_model=list[StockLevelOut])
async def list_stock_levels(
    membership: Membership = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
    variant_id: uuid.UUID | None = None,
    depot_id: uuid.UUID | None = None,
) -> list[StockLevelOut]:
    levels = await StockService(db).list_stock_levels(membership.organization_id, variant_id=variant_id, depot_id=depot_id)
    return [StockLevelOut.model_validate(level) for level in levels]


@router.get(
    "/organizations/{organization_id}/stock/consignment-summary",
    response_model=ConsignmentSummaryOut,
)
async def consignment_summary(
    variant_id: uuid.UUID,
    depot_id: uuid.UUID,
    membership: Membership = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
) -> ConsignmentSummaryOut:
    return await StockService(db).get_consignment_summary(membership.organization_id, variant_id, depot_id)
