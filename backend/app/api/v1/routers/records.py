import json
import uuid

from fastapi import APIRouter, Depends, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import StreamingResponse
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
from app.schemas.search import ImportCommitResult, ImportMappingSuggestion
from app.services.export_service import export_records_csv
from app.services.import_service import build_rows, parse_csv, suggest_mapping
from app.services.model_definition_service import ModelDefinitionService
from app.services.organization_service import PermissionDeniedError
from app.services.record_service import RecordService

router = APIRouter(tags=["records"])


def _validation_error_response(exc: FieldValidationError) -> HTTPException:
    return HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, {"errors": exc.errors})


def _parse_filters(raw: str | None) -> dict[str, str] | None:
    if not raw:
        return None
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Le paramètre filters doit être un objet JSON.") from exc
    if not isinstance(parsed, dict) or not all(isinstance(v, str) for v in parsed.values()):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "filters doit être un objet {champ: valeur texte}.")
    return parsed


@router.get("/organizations/{organization_id}/model-definitions/{model_id}/records", response_model=RecordListOut)
async def list_records(
    model_id: uuid.UUID,
    membership: Membership = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
    status_filter: str | None = Query(default=None, alias="status"),
    include_archived: bool = Query(default=False),
    filters: str | None = Query(default=None, description='JSON {"champ": "valeur"} — cahier des charges §9'),
    sort_key: str | None = Query(default=None),
    sort_direction: str = Query(default="desc", pattern="^(asc|desc)$"),
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
        field_filters=_parse_filters(filters),
        sort_key=sort_key,
        sort_direction=sort_direction,
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
            record_id=payload.id,
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


# --- export / import (cahier des charges §9) ------------------------------------------

# Borne haute pour un export en une seule réponse ; au-delà, un export en tâche de
# fond serait nécessaire (§14.3) — non construit dans ce lot, volume jugé suffisant
# pour les organisations visées (voir PRODUCT.md §4, hypothèse Q6).
_EXPORT_ROW_LIMIT = 10_000


@router.get("/organizations/{organization_id}/model-definitions/{model_id}/records/export.csv")
async def export_records(
    model_id: uuid.UUID,
    membership: Membership = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
    filters: str | None = Query(default=None),
    columns: str | None = Query(default=None, description="Clés de champs séparées par des virgules"),
) -> StreamingResponse:
    model_service = ModelDefinitionService(db)
    model = await model_service.get(membership.organization_id, model_id)
    if model is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Modèle introuvable.")

    record_service = RecordService(db)
    items, _ = await record_service.list_for_model(
        membership.organization_id, model_id, field_filters=_parse_filters(filters), limit=_EXPORT_ROW_LIMIT, offset=0
    )
    column_keys = columns.split(",") if columns else None
    csv_content = export_records_csv(model, items, columns=column_keys)
    return StreamingResponse(
        iter([csv_content]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{model.name_plural}.csv"'},
    )


@router.post(
    "/organizations/{organization_id}/model-definitions/{model_id}/records/import/preview",
    response_model=ImportMappingSuggestion,
)
async def preview_import(
    model_id: uuid.UUID,
    file: UploadFile,
    membership: Membership = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
) -> ImportMappingSuggestion:
    model_service = ModelDefinitionService(db)
    model = await model_service.get(membership.organization_id, model_id)
    if model is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Modèle introuvable.")

    headers, raw_rows = parse_csv(await file.read())
    mapping = suggest_mapping(headers, model.field_definitions)
    rows = build_rows(raw_rows, {h: k for h, k in mapping.items() if k}, model.field_definitions)

    return ImportMappingSuggestion(
        headers=headers,
        suggested_mapping=mapping,
        preview_rows=raw_rows[:10],
        total_rows=len(rows),
        valid_row_count=sum(1 for r in rows if r.is_valid),
        invalid_row_count=sum(1 for r in rows if not r.is_valid),
        sample_errors=[{"row": r.index, "errors": r.errors} for r in rows if not r.is_valid][:20],
    )


@router.post(
    "/organizations/{organization_id}/model-definitions/{model_id}/records/import/commit",
    response_model=ImportCommitResult,
)
async def commit_import(
    model_id: uuid.UUID,
    file: UploadFile,
    mapping: str = Form(...),
    user: User = Depends(get_current_user),
    membership: Membership = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
) -> ImportCommitResult:
    """`mapping` : JSON {"colonne_csv": "cle_de_champ"} — celui validé par l'utilisateur
    à l'écran d'aperçu (§9 : « correspondance des colonnes et aperçu avant validation »).
    """
    model_service = ModelDefinitionService(db)
    model = await model_service.get(membership.organization_id, model_id)
    if model is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Modèle introuvable.")
    try:
        mapping_dict = json.loads(mapping)
    except json.JSONDecodeError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "mapping doit être un objet JSON.") from exc

    _headers, raw_rows = parse_csv(await file.read())
    rows = build_rows(raw_rows, mapping_dict, model.field_definitions)

    record_service = RecordService(db)
    created = 0
    errors: list[dict] = []
    for row in rows:
        if not row.is_valid:
            errors.append({"row": row.index, "errors": row.errors})
            continue
        try:
            await record_service.create(
                organization_id=membership.organization_id,
                actor=user,
                actor_membership=membership,
                model=model,
                data=row.data,
                status=None,
                site=None,
                assigned_person_record_id=None,
            )
            created += 1
        except (PermissionDeniedError, FieldValidationError) as exc:
            message = exc.errors if isinstance(exc, FieldValidationError) else {"_": str(exc)}
            errors.append({"row": row.index, "errors": message})

    return ImportCommitResult(created=created, failed=len(errors), errors=errors)
