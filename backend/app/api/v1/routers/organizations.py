from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user, get_org_context
from app.models.membership import Membership
from app.models.user import User
from app.repositories.organization import OrganizationRepository
from app.schemas.organization import OrganizationOut, OrganizationUpdate, OrganizationWithRole
from app.services.organization_service import OrganizationService, PermissionDeniedError

router = APIRouter(prefix="/organizations", tags=["organizations"])


@router.get("", response_model=list[OrganizationWithRole])
async def list_my_organizations(
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> list[OrganizationWithRole]:
    service = OrganizationService(db)
    pairs = await service.list_for_user(user.id)
    return [
        OrganizationWithRole(**OrganizationOut.model_validate(org).model_dump(), my_role=membership.role)
        for org, membership in pairs
    ]


@router.get("/{organization_id}", response_model=OrganizationWithRole)
async def get_organization(
    membership: Membership = Depends(get_org_context), db: AsyncSession = Depends(get_db)
) -> OrganizationWithRole:
    org = await OrganizationRepository(db).get(membership.organization_id)
    if org is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Organisation introuvable.")
    return OrganizationWithRole(**OrganizationOut.model_validate(org).model_dump(), my_role=membership.role)


@router.patch("/{organization_id}", response_model=OrganizationOut)
async def update_organization(
    payload: OrganizationUpdate,
    user: User = Depends(get_current_user),
    membership: Membership = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
) -> OrganizationOut:
    org = await OrganizationRepository(db).get(membership.organization_id)
    if org is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Organisation introuvable.")
    service = OrganizationService(db)
    try:
        org = await service.update(
            organization=org,
            actor=user,
            actor_membership=membership,
            **payload.model_dump(exclude_unset=True),
        )
    except PermissionDeniedError as exc:
        raise HTTPException(status.HTTP_403_FORBIDDEN, str(exc)) from exc
    return OrganizationOut.model_validate(org)
