import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user, get_org_context
from app.models.membership import Membership
from app.models.user import User
from app.schemas.model_definition import (
    FieldDefinitionCreate,
    FieldDefinitionOut,
    ModelDefinitionCreate,
    ModelDefinitionOut,
    ModelDefinitionUpdate,
)
from app.services.model_definition_service import ModelDefinitionService
from app.services.organization_service import PermissionDeniedError

router = APIRouter(prefix="/organizations/{organization_id}/model-definitions", tags=["model-definitions"])


async def _get_model_or_404(service: ModelDefinitionService, organization_id: uuid.UUID, model_id: uuid.UUID):
    model = await service.get(organization_id, model_id)
    if model is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Modèle introuvable.")
    return model


@router.get("", response_model=list[ModelDefinitionOut])
async def list_model_definitions(
    membership: Membership = Depends(get_org_context), db: AsyncSession = Depends(get_db)
) -> list[ModelDefinitionOut]:
    service = ModelDefinitionService(db)
    models = await service.list_for_org(membership.organization_id)
    return [ModelDefinitionOut.model_validate(m) for m in models]


@router.post("", response_model=ModelDefinitionOut, status_code=status.HTTP_201_CREATED)
async def create_model_definition(
    payload: ModelDefinitionCreate,
    user: User = Depends(get_current_user),
    membership: Membership = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
) -> ModelDefinitionOut:
    service = ModelDefinitionService(db)
    try:
        model = await service.create(
            organization_id=membership.organization_id, actor=user, actor_membership=membership, payload=payload
        )
    except PermissionDeniedError as exc:
        raise HTTPException(status.HTTP_403_FORBIDDEN, str(exc)) from exc
    return ModelDefinitionOut.model_validate(model)


@router.get("/{model_id}", response_model=ModelDefinitionOut)
async def get_model_definition(
    model_id: uuid.UUID, membership: Membership = Depends(get_org_context), db: AsyncSession = Depends(get_db)
) -> ModelDefinitionOut:
    service = ModelDefinitionService(db)
    model = await _get_model_or_404(service, membership.organization_id, model_id)
    return ModelDefinitionOut.model_validate(model)


@router.patch("/{model_id}", response_model=ModelDefinitionOut)
async def update_model_definition(
    model_id: uuid.UUID,
    payload: ModelDefinitionUpdate,
    user: User = Depends(get_current_user),
    membership: Membership = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
) -> ModelDefinitionOut:
    service = ModelDefinitionService(db)
    model = await _get_model_or_404(service, membership.organization_id, model_id)
    try:
        model = await service.update(
            organization_id=membership.organization_id,
            actor=user,
            actor_membership=membership,
            model=model,
            payload=payload,
        )
    except PermissionDeniedError as exc:
        raise HTTPException(status.HTTP_403_FORBIDDEN, str(exc)) from exc
    return ModelDefinitionOut.model_validate(model)


@router.post("/{model_id}/fields", response_model=FieldDefinitionOut, status_code=status.HTTP_201_CREATED)
async def add_field(
    model_id: uuid.UUID,
    payload: FieldDefinitionCreate,
    user: User = Depends(get_current_user),
    membership: Membership = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
) -> FieldDefinitionOut:
    service = ModelDefinitionService(db)
    model = await _get_model_or_404(service, membership.organization_id, model_id)
    try:
        field = await service.add_field(
            organization_id=membership.organization_id,
            actor=user,
            actor_membership=membership,
            model=model,
            payload=payload,
        )
    except PermissionDeniedError as exc:
        raise HTTPException(status.HTTP_403_FORBIDDEN, str(exc)) from exc
    return FieldDefinitionOut.model_validate(field)
