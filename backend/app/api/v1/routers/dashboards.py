import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user, get_org_context
from app.models.dashboard import DashboardPeriod
from app.models.membership import Membership
from app.models.user import User
from app.schemas.dashboard import (
    DashboardOut,
    DeadlineHitListOut,
    ExpiringLotHitListOut,
    SavedDashboardCreate,
    SavedDashboardOut,
    SavedDashboardUpdate,
    UnderstockHitListOut,
)
from app.services.dashboard_service import DashboardService, SavedDashboardNotFoundError

router = APIRouter(prefix="/organizations/{organization_id}/dashboard", tags=["dashboards"])
saved_router = APIRouter(prefix="/organizations/{organization_id}/dashboards/saved", tags=["dashboards"])


@router.get("", response_model=DashboardOut)
async def get_dashboard(
    membership: Membership = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
    model_id: uuid.UUID | None = Query(default=None),
    depot_id: uuid.UUID | None = Query(default=None),
    site: str | None = Query(default=None),
    period: DashboardPeriod = Query(default=DashboardPeriod.DAYS_30),
) -> DashboardOut:
    return await DashboardService(db).compute(
        organization_id=membership.organization_id,
        actor_membership=membership,
        model_definition_id=model_id,
        depot_id=depot_id,
        site=site,
        period=period,
        today=date.today(),
    )


@router.get("/deadlines", response_model=DeadlineHitListOut)
async def list_deadline_hits(
    membership: Membership = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
    status_filter: str = Query(alias="status", pattern="^(overdue|upcoming)$"),
    model_id: uuid.UUID | None = Query(default=None),
    site: str | None = Query(default=None),
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0, ge=0),
) -> DeadlineHitListOut:
    items, total = await DashboardService(db).list_deadline_hits(
        membership.organization_id,
        model_id=model_id,
        site=site,
        today=date.today(),
        overdue=status_filter == "overdue",
        limit=limit,
        offset=offset,
    )
    return DeadlineHitListOut(items=items, total=total, limit=limit, offset=offset)


@router.get("/understock", response_model=UnderstockHitListOut)
async def list_understock_hits(
    membership: Membership = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
    model_id: uuid.UUID | None = Query(default=None),
    depot_id: uuid.UUID | None = Query(default=None),
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0, ge=0),
) -> UnderstockHitListOut:
    items, total = await DashboardService(db).list_understock_hits(
        membership.organization_id, model_id=model_id, depot_id=depot_id, limit=limit, offset=offset
    )
    return UnderstockHitListOut(items=items, total=total, limit=limit, offset=offset)


@router.get("/expiring-lots", response_model=ExpiringLotHitListOut)
async def list_expiring_lot_hits(
    membership: Membership = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
    model_id: uuid.UUID | None = Query(default=None),
    depot_id: uuid.UUID | None = Query(default=None),
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0, ge=0),
) -> ExpiringLotHitListOut:
    items, total = await DashboardService(db).list_expiring_lot_hits(
        membership.organization_id, model_id=model_id, depot_id=depot_id, today=date.today(), limit=limit, offset=offset
    )
    return ExpiringLotHitListOut(items=items, total=total, limit=limit, offset=offset)


# --- tableaux de bord enregistrés et épinglés (§10.4) -------------------------------


@saved_router.get("", response_model=list[SavedDashboardOut])
async def list_saved_dashboards(
    user: User = Depends(get_current_user),
    membership: Membership = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
) -> list[SavedDashboardOut]:
    dashboards = await DashboardService(db).list_saved(membership.organization_id, user)
    return [SavedDashboardOut.model_validate(d) for d in dashboards]


@saved_router.get("/pinned", response_model=SavedDashboardOut | None)
async def get_pinned_dashboard(
    user: User = Depends(get_current_user),
    membership: Membership = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
) -> SavedDashboardOut | None:
    pinned = await DashboardService(db).get_pinned(membership.organization_id, user)
    return SavedDashboardOut.model_validate(pinned) if pinned else None


@saved_router.post("", response_model=SavedDashboardOut, status_code=status.HTTP_201_CREATED)
async def create_saved_dashboard(
    payload: SavedDashboardCreate,
    user: User = Depends(get_current_user),
    membership: Membership = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
) -> SavedDashboardOut:
    dashboard = await DashboardService(db).create_saved(membership.organization_id, user, payload)
    return SavedDashboardOut.model_validate(dashboard)


@saved_router.patch("/{dashboard_id}", response_model=SavedDashboardOut)
async def update_saved_dashboard(
    dashboard_id: uuid.UUID,
    payload: SavedDashboardUpdate,
    user: User = Depends(get_current_user),
    membership: Membership = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
) -> SavedDashboardOut:
    try:
        dashboard = await DashboardService(db).update_saved(membership.organization_id, user, dashboard_id, payload)
    except SavedDashboardNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc
    return SavedDashboardOut.model_validate(dashboard)


@saved_router.delete("/{dashboard_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_saved_dashboard(
    dashboard_id: uuid.UUID,
    user: User = Depends(get_current_user),
    membership: Membership = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
) -> None:
    try:
        await DashboardService(db).delete_saved(membership.organization_id, user, dashboard_id)
    except SavedDashboardNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc
