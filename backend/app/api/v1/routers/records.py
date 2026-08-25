import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user, get_org_context
from app.dynamic_fields.validation import FieldValidationError
from app.models.membership import Membership
from app.models.record import RecordEvent
from app.models.user import User
from app.schemas.record import (
    RecordCreate,
    RecordEventCreate,
    RecordEventOut,
    RecordListOut,
    RecordOut,
    RecordUpdate,
)
from app.services.model_definition_service import ModelDefinitionService
from app.services.organization_service import PermissionDeniedError
from app.services.record_service import RecordService

router = APIRouter(tags=["records"])


def _validation_error_response(exc: FieldValidationError) -> HTTPException:
    return HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, {"errors": exc.errors})


@router.get("/organizations/{organization_id}/model-definitions/{model_id}/records", response_model=RecordListOut)
async def list_records(
    model_id: uuid.UUID,
    membership: Membership = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
    status_filter: str | None = Query(default=None, alias="status"),
    include_archived: bool = Query(default=False),
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0, ge=0),
) -> RecordListOut:
    model_service = ModelDefinitionService(db)
    model = await model_service.get(membership.organization_id, model_id)
    if model is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Modèle introuvable.")

    record_service = RecordService(db)
    items, total = await record_service.list_for_model(
        membership.organization_id,
        model_id,
        include_archived=include_archived,
        status=status_filter,
        limit=limit,
        offset=offset,
    )
    return RecordListOut(
        items=[RecordOut.model_validate(r) for r in items], total=total, limit=limit, offset=offset
    )


@router.post(
    "/organizations/{organization_id}/model-definitions/{model_id}/records",
    response_model=RecordOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_record(
    model_id: uuid.UUID,
    payload: RecordCreate,
    user: User = Depends(get_current_user),
    membership: Membership = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
) -> RecordOut:
    model_service = ModelDefinitionService(db)
    model = await model_service.get(membership.organization_id, model_id)
    if model is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Modèle introuvable.")

    record_service = RecordService(db)
    try:
        record = await record_service.create(
            organization_id=membership.organization_id,
            actor=user,
            actor_membership=membership,
            model=model,
            data=payload.data,
            status=payload.status,
            site=payload.site,
            assigned_person_record_id=payload.assigned_person_record_id,
        )
    except PermissionDeniedError as exc:
        raise HTTPException(status.HTTP_403_FORBIDDEN, str(exc)) from exc
    except FieldValidationError as exc:
        raise _validation_error_response(exc) from exc
    return RecordOut.model_validate(record)


@router.get("/organizations/{organization_id}/records/{record_id}", response_model=RecordOut)
async def get_record(
    record_id: uuid.UUID, membership: Membership = Depends(get_org_context), db: AsyncSession = Depends(get_db)
) -> RecordOut:
    record = await RecordService(db).get(membership.organization_id, record_id)
    if record is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Fiche introuvable.")
    return RecordOut.model_validate(record)


@router.patch("/organizations/{organization_id}/records/{record_id}", response_model=RecordOut)
async def update_record(
    record_id: uuid.UUID,
    payload: RecordUpdate,
    user: User = Depends(get_current_user),
    membership: Membership = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
) -> RecordOut:
    record_service = RecordService(db)
    record = await record_service.get(membership.organization_id, record_id)
    if record is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Fiche introuvable.")

    model = await ModelDefinitionService(db).get(membership.organization_id, record.model_definition_id)
    if model is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Modèle introuvable.")

    try:
        record = await record_service.update(
            organization_id=membership.organization_id,
            actor=user,
            actor_membership=membership,
            model=model,
            record=record,
            data=payload.data,
            status=payload.status,
            site=payload.site,
            assigned_person_record_id=payload.assigned_person_record_id,
        )
    except PermissionDeniedError as exc:
        raise HTTPException(status.HTTP_403_FORBIDDEN, str(exc)) from exc
    except FieldValidationError as exc:
        raise _validation_error_response(exc) from exc
    return RecordOut.model_validate(record)


@router.post("/organizations/{organization_id}/records/{record_id}/archive", response_model=RecordOut)
async def archive_record(
    record_id: uuid.UUID,
    user: User = Depends(get_current_user),
    membership: Membership = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
) -> RecordOut:
    record_service = RecordService(db)
    record = await record_service.get(membership.organization_id, record_id)
    if record is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Fiche introuvable.")
    try:
        record = await record_service.archive(
            organization_id=membership.organization_id, actor=user, actor_membership=membership, record=record
        )
    except PermissionDeniedError as exc:
        raise HTTPException(status.HTTP_403_FORBIDDEN, str(exc)) from exc
    return RecordOut.model_validate(record)


@router.get("/organizations/{organization_id}/records/{record_id}/events", response_model=list[RecordEventOut])
async def list_record_events(
    record_id: uuid.UUID, membership: Membership = Depends(get_org_context), db: AsyncSession = Depends(get_db)
) -> list[RecordEventOut]:
    stmt = (
        select(RecordEvent)
        .where(RecordEvent.record_id == record_id, RecordEvent.organization_id == membership.organization_id)
        .order_by(RecordEvent.occurred_at.desc())
    )
    events = (await db.execute(stmt)).scalars().all()
    return [RecordEventOut.model_validate(e) for e in events]


@router.post(
    "/organizations/{organization_id}/records/{record_id}/events",
    response_model=RecordEventOut,
    status_code=status.HTTP_201_CREATED,
)
async def add_record_event(
    record_id: uuid.UUID,
    payload: RecordEventCreate,
    user: User = Depends(get_current_user),
    membership: Membership = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
) -> RecordEventOut:
    record_service = RecordService(db)
    record = await record_service.get(membership.organization_id, record_id)
    if record is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Fiche introuvable.")
    try:
        event = await record_service.add_event(
            organization_id=membership.organization_id,
            actor=user,
            actor_membership=membership,
            record=record,
            payload=payload,
        )
    except PermissionDeniedError as exc:
        raise HTTPException(status.HTTP_403_FORBIDDEN, str(exc)) from exc
    return RecordEventOut.model_validate(event)
