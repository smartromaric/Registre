import uuid

from fastapi import APIRouter, Depends, Form, HTTPException, Request, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user, get_org_context
from app.models.membership import Membership
from app.models.user import User
from app.schemas.document import DocumentOut, DocumentWithUrlOut
from app.schemas.sync import UploadSessionCreate, UploadSessionOut
from app.services.document_service import MAX_UPLOAD_BYTES, DocumentService
from app.services.record_service import RecordService
from app.services.sync_service import UploadSessionError, UploadSessionService

router = APIRouter(prefix="/organizations/{organization_id}/records/{record_id}/documents", tags=["documents"])


@router.post("", response_model=DocumentWithUrlOut, status_code=status.HTTP_201_CREATED)
async def upload_document(
    record_id: uuid.UUID,
    file: UploadFile,
    field_key: str | None = Form(default=None),
    user: User = Depends(get_current_user),
    membership: Membership = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
) -> DocumentWithUrlOut:
    record = await RecordService(db).get(membership.organization_id, record_id)
    if record is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Fiche introuvable.")

    data = await file.read()
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "Fichier trop volumineux.")

    document_service = DocumentService(db)
    document = await document_service.upload(
        organization_id=membership.organization_id,
        uploader_id=user.id,
        record=record,
        field_key=field_key,
        filename=file.filename or "document",
        content_type=file.content_type or "application/octet-stream",
        data=data,
    )
    return DocumentWithUrlOut(
        **DocumentOut.model_validate(document).model_dump(),
        url=document_service.signed_url(document),
    )


# --- téléversement repris par morceaux (§11.3 : « reprennent après coupure sans
# repartir de zéro ») ---------------------------------------------------------------


@router.post("/uploads", response_model=UploadSessionOut, status_code=status.HTTP_201_CREATED)
async def create_upload_session(
    record_id: uuid.UUID,
    payload: UploadSessionCreate,
    user: User = Depends(get_current_user),
    membership: Membership = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
) -> UploadSessionOut:
    record = await RecordService(db).get(membership.organization_id, record_id)
    if record is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Fiche introuvable.")
    try:
        session = await UploadSessionService(db).create_or_resume(
            organization_id=membership.organization_id,
            record=record,
            actor=user,
            session_id=payload.id,
            field_key=payload.field_key,
            filename=payload.filename,
            content_type=payload.content_type,
            total_bytes=payload.total_bytes,
            chunk_size=payload.chunk_size,
        )
    except UploadSessionError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    return UploadSessionOut.model_validate(session)


@router.get("/uploads/{session_id}", response_model=UploadSessionOut)
async def get_upload_session(
    record_id: uuid.UUID,
    session_id: uuid.UUID,
    membership: Membership = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
) -> UploadSessionOut:
    session = await UploadSessionService(db).get(membership.organization_id, session_id)
    if session is None or session.record_id != record_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session de téléversement introuvable.")
    return UploadSessionOut.model_validate(session)


@router.put("/uploads/{session_id}/chunks/{chunk_index}", response_model=UploadSessionOut)
async def put_upload_chunk(
    record_id: uuid.UUID,
    session_id: uuid.UUID,
    chunk_index: int,
    request: Request,
    membership: Membership = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
) -> UploadSessionOut:
    """Corps brut (pas de multipart) : un seul morceau, taille bornée par
    `session.chunk_size` — voir UploadSessionService.save_chunk."""
    service = UploadSessionService(db)
    session = await service.get(membership.organization_id, session_id)
    if session is None or session.record_id != record_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session de téléversement introuvable.")
    data = await request.body()
    try:
        session = await service.save_chunk(session, chunk_index, data)
    except UploadSessionError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    return UploadSessionOut.model_validate(session)


@router.post("/uploads/{session_id}/complete", response_model=DocumentWithUrlOut)
async def complete_upload_session(
    record_id: uuid.UUID,
    session_id: uuid.UUID,
    user: User = Depends(get_current_user),
    membership: Membership = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
) -> DocumentWithUrlOut:
    service = UploadSessionService(db)
    session = await service.get(membership.organization_id, session_id)
    if session is None or session.record_id != record_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session de téléversement introuvable.")
    record = await RecordService(db).get(membership.organization_id, record_id)
    if record is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Fiche introuvable.")

    document_service = DocumentService(db)
    try:
        document = await service.complete(
            organization_id=membership.organization_id,
            session=session,
            actor=user,
            record=record,
            document_service=document_service,
        )
    except UploadSessionError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    return DocumentWithUrlOut(
        **DocumentOut.model_validate(document).model_dump(),
        url=document_service.signed_url(document),
    )


@router.get("", response_model=list[DocumentWithUrlOut])
async def list_documents(
    record_id: uuid.UUID, membership: Membership = Depends(get_org_context), db: AsyncSession = Depends(get_db)
) -> list[DocumentWithUrlOut]:
    document_service = DocumentService(db)
    documents = await document_service.list_for_record(membership.organization_id, record_id)
    return [
        DocumentWithUrlOut(**DocumentOut.model_validate(d).model_dump(), url=document_service.signed_url(d))
        for d in documents
    ]


@router.get("/{document_id}", response_model=DocumentWithUrlOut)
async def get_document(
    record_id: uuid.UUID,
    document_id: uuid.UUID,
    membership: Membership = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
) -> DocumentWithUrlOut:
    """Renouvelle l'URL signée (§14.1 : durée de vie courte) — le seul moyen pour
    un client de revenir consulter un document après l'expiration du lien
    obtenu au moment du téléversement.
    """
    document_service = DocumentService(db)
    document = await document_service.get(membership.organization_id, document_id)
    if document is None or document.record_id != record_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Document introuvable.")
    return DocumentWithUrlOut(
        **DocumentOut.model_validate(document).model_dump(), url=document_service.signed_url(document)
    )
