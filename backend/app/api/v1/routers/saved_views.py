import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user, get_org_context
from app.models.membership import Membership
from app.models.user import User
from app.schemas.saved_view import SavedViewCreate, SavedViewOut, SavedViewUpdate
from app.services.saved_view_service import SavedViewNotFoundError, SavedViewService

router = APIRouter(prefix="/organizations/{organization_id}/saved-views", tags=["saved-views"])


@router.get("", response_model=list[SavedViewOut])
async def list_saved_views(
    user: User = Depends(get_current_user),
    membership: Membership = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
    model_definition_id: uuid.UUID | None = Query(default=None),
) -> list[SavedViewOut]:
    views = await SavedViewService(db).list_for_user(membership.organization_id, user, model_definition_id)
    return [SavedViewOut.model_validate(v) for v in views]


@router.post("", response_model=SavedViewOut, status_code=status.HTTP_201_CREATED)
async def create_saved_view(
    payload: SavedViewCreate,
    user: User = Depends(get_current_user),
    membership: Membership = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
) -> SavedViewOut:
    view = await SavedViewService(db).create(membership.organization_id, user, payload)
    return SavedViewOut.model_validate(view)


@router.patch("/{view_id}", response_model=SavedViewOut)
async def update_saved_view(
    view_id: uuid.UUID,
    payload: SavedViewUpdate,
    user: User = Depends(get_current_user),
    membership: Membership = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
) -> SavedViewOut:
    try:
        view = await SavedViewService(db).update(membership.organization_id, user, view_id, payload)
    except SavedViewNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc
    return SavedViewOut.model_validate(view)


@router.delete("/{view_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_saved_view(
    view_id: uuid.UUID,
    user: User = Depends(get_current_user),
    membership: Membership = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
) -> None:
    try:
        await SavedViewService(db).delete(membership.organization_id, user, view_id)
    except SavedViewNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc
