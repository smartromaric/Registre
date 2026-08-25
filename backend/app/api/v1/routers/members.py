import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user, get_org_context
from app.models.membership import Membership
from app.models.user import User
from app.schemas.membership import MembershipInvite, MembershipInviteOut, MembershipOut, MembershipUpdate
from app.services.organization_service import MembershipService, PermissionDeniedError

router = APIRouter(prefix="/organizations/{organization_id}/members", tags=["members"])


@router.get("", response_model=list[MembershipOut])
async def list_members(
    membership: Membership = Depends(get_org_context), db: AsyncSession = Depends(get_db)
) -> list[MembershipOut]:
    service = MembershipService(db)
    members = await service.list_members(membership.organization_id)
    return [MembershipOut.model_validate(m) for m in members]


@router.post("", response_model=MembershipInviteOut, status_code=status.HTTP_201_CREATED)
async def invite_member(
    payload: MembershipInvite,
    user: User = Depends(get_current_user),
    membership: Membership = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
) -> MembershipInviteOut:
    service = MembershipService(db)
    try:
        result = await service.invite(
            organization_id=membership.organization_id,
            actor=user,
            actor_membership=membership,
            email=payload.email,
            full_name=payload.full_name,
            role=payload.role,
            can_view_amounts=payload.can_view_amounts,
        )
    except PermissionDeniedError as exc:
        raise HTTPException(status.HTTP_403_FORBIDDEN, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
    return MembershipInviteOut(
        membership=MembershipOut.model_validate(result.membership),
        invitation_email_sent=result.invitation_email_sent,
        invitation_link=result.invitation_link,
    )


@router.patch("/{membership_id}", response_model=MembershipOut)
async def update_member(
    membership_id: uuid.UUID,
    payload: MembershipUpdate,
    user: User = Depends(get_current_user),
    membership: Membership = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
) -> MembershipOut:
    service = MembershipService(db)
    try:
        updated = await service.update(
            organization_id=membership.organization_id,
            actor=user,
            actor_membership=membership,
            membership_id=membership_id,
            role=payload.role,
            can_view_amounts=payload.can_view_amounts,
            is_active=payload.is_active,
        )
    except PermissionDeniedError as exc:
        raise HTTPException(status.HTTP_403_FORBIDDEN, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc
    return MembershipOut.model_validate(updated)
