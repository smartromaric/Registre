import uuid

from fastapi import APIRouter, Depends, Form, HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user, get_org_context
from app.models.membership import Membership
from app.models.user import User
from app.schemas.document import DocumentOut, DocumentWithUrlOut
from app.services.document_service import DocumentService
from app.services.record_service import RecordService

router = APIRouter(prefix="/organizations/{organization_id}/records/{record_id}/documents", tags=["documents"])

# Cahier des charges §14.3 : les photos sont compressées côté appareil avant
# l'envoi — cette limite est un garde-fou serveur, pas la stratégie de compression.
MAX_UPLOAD_BYTES = 15 * 1024 * 1024


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
