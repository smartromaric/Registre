import json
import unicodedata
import uuid
from urllib.parse import quote

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
    RecordUpdateOut,
)
from app.schemas.search import ImportCommitResult, ImportMappingSuggestion
from app.services.export_service import export_records_csv
from app.services.import_service import ImportParseError, build_rows, parse_spreadsheet, suggest_mapping
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


@router.patch("/organizations/{organization_id}/records/{record_id}", response_model=RecordUpdateOut)
async def update_record(
    record_id: uuid.UUID,
    payload: RecordUpdate,
    user: User = Depends(get_current_user),
    membership: Membership = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
) -> RecordUpdateOut:
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
            client_operation_id=payload.client_operation_id,
            field_written_at=payload.field_written_at,
        )
    except PermissionDeniedError as exc:
        raise HTTPException(status.HTTP_403_FORBIDDEN, str(exc)) from exc
    except FieldValidationError as exc:
        raise _validation_error_response(exc) from exc
    return RecordUpdateOut(
        **RecordOut.model_validate(record).model_dump(),
        conflicted_field_keys=getattr(record, "conflicted_field_keys", []),
    )


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


#: Caractères qu'un nom de fichier ne peut pas porter dans un en-tête HTTP : le
#: guillemet fermerait la valeur, l'antislash l'échapperait. Les caractères de
#: contrôle sont écartés à part, par `str.isprintable()`.
_UNSAFE_IN_HEADER = '"\\'


def _content_disposition(filename: str) -> str:
    """En-tête de pièce jointe conforme au RFC 6266.

    Le nom du modèle est libre — il vient du client. L'écrire directement dans
    l'en-tête (`filename="{nom}.csv"`) marchait tant que ce nom tenait dans le
    latin-1, seul jeu de caractères que les en-têtes HTTP savent transporter en
    clair : « Véhicules » passe. Un modèle nommé en cyrillique, en arabe, ou avec
    un simple « € », faisait lever un `UnicodeEncodeError` au moment d'écrire la
    réponse — un export en erreur 500, sans rapport visible avec la cause.

    On envoie donc les deux formes, comme le prescrit le RFC : un `filename`
    ASCII de repli pour les clients anciens, et un `filename*` encodé en UTF-8
    que tous les navigateurs actuels préfèrent.
    """
    stem, dot, extension = filename.rpartition(".")
    if not dot:  # aucun point : tout est le radical
        stem, extension = filename, ""

    ascii_stem = unicodedata.normalize("NFKD", stem).encode("ascii", "ignore").decode()
    # Un saut de ligne est de l'ASCII : il survit à `encode("ascii")` et
    # permettrait d'injecter un en-tête HTTP entier dans la réponse. Ces
    # caractères viennent d'un nom saisi par l'utilisateur — on les retire.
    ascii_stem = "".join(c for c in ascii_stem if c.isprintable() and c not in _UNSAFE_IN_HEADER).strip()

    # Le repli se calcule sur le RADICAL et non sur le nom entier : « 🚚.csv »
    # laissait sinon « .csv », c'est-à-dire un fichier caché sans nom, que le
    # système d'exploitation refuse ou masque.
    ascii_extension = "".join(c for c in extension if c.isalnum())
    safe_name = f"{ascii_stem or 'export'}.{ascii_extension or 'csv'}"

    quoted = quote(filename, safe="")
    return f'attachment; filename="{safe_name}"; filename*=UTF-8\'\'{quoted}'


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
        headers={"Content-Disposition": _content_disposition(f"{model.name_plural}.csv")},
    )


@router.post(
    "/organizations/{organization_id}/model-definitions/{model_id}/records/import/preview",
    response_model=ImportMappingSuggestion,
)
async def preview_import(
    model_id: uuid.UUID,
    file: UploadFile,
    mapping: str | None = Form(default=None),
    membership: Membership = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
) -> ImportMappingSuggestion:
    """`mapping` (optionnel) : la correspondance déjà corrigée à l'écran. Sans lui,
    l'aperçu est calculé sur la correspondance suggérée automatiquement.

    L'accepter est ce qui rend les compteurs honnêtes : dès que l'utilisateur
    corrige une colonne, « N lignes valides » doit décrire *sa* correspondance, pas
    celle devinée au départ.
    """
    model_service = ModelDefinitionService(db)
    model = await model_service.get(membership.organization_id, model_id)
    if model is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Modèle introuvable.")

    try:
        sheet = parse_spreadsheet(await file.read(), file.filename, file.content_type)
    except ImportParseError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc

    suggested = suggest_mapping(sheet.headers, model.field_definitions)
    if mapping is None:
        applied = {h: k for h, k in suggested.items() if k}
    else:
        try:
            applied = json.loads(mapping)
        except json.JSONDecodeError as exc:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "mapping doit être un objet JSON.") from exc

    rows = build_rows(sheet.rows, applied, model.field_definitions)

    return ImportMappingSuggestion(
        headers=sheet.headers,
        suggested_mapping=suggested,
        preview_rows=sheet.rows[:10],
        total_rows=len(rows),
        valid_row_count=sum(1 for r in rows if r.is_valid),
        invalid_row_count=sum(1 for r in rows if not r.is_valid),
        sample_errors=[{"row": r.index, "errors": r.errors} for r in rows if not r.is_valid][:20],
        source_format=sheet.source_format,
        sheet_name=sheet.sheet_name,
        ignored_sheet_names=sheet.ignored_sheet_names,
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
    """`mapping` : JSON {"en_tete_colonne": "cle_de_champ"} — celui validé par l'utilisateur
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

    try:
        sheet = parse_spreadsheet(await file.read(), file.filename, file.content_type)
    except ImportParseError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    rows = build_rows(sheet.rows, mapping_dict, model.field_definitions)

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
