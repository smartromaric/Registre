import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user, require_role
from app.models.membership import Membership, OrgRole
from app.models.user import User
from app.schemas.sync import RecordFieldConflictListOut, RecordFieldConflictOut
from app.services.sync_service import SyncConflictService

router = APIRouter(prefix="/organizations/{organization_id}/sync/conflicts", tags=["sync"])


@router.get("", response_model=RecordFieldConflictListOut)
async def list_conflicts(
    membership: Membership = Depends(require_role(OrgRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
    only_unreviewed: bool = Query(default=False),
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0, ge=0),
) -> RecordFieldConflictListOut:
    items, total = await SyncConflictService(db).list_for_organization(
        membership.organization_id, only_unreviewed=only_unreviewed, limit=limit, offset=offset
    )
    return RecordFieldConflictListOut(
        items=[RecordFieldConflictOut.model_validate(c) for c in items], total=total, limit=limit, offset=offset
    )


@router.post("/{conflict_id}/ack", response_model=RecordFieldConflictOut)
async def acknowledge_conflict(
    conflict_id: uuid.UUID,
    user: User = Depends(get_current_user),
    membership: Membership = Depends(require_role(OrgRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
) -> RecordFieldConflictOut:
    conflict = await SyncConflictService(db).acknowledge(membership.organization_id, conflict_id, user)
    if conflict is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Conflit introuvable.")
    return RecordFieldConflictOut.model_validate(conflict)
