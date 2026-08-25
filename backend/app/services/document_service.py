import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.document import Document
from app.models.record import Record
from app.storage import get_storage_backend


class DocumentService:
    """Cahier des charges §5.2 : les types Document et Photo. Le fichier part vers
    le stockage objet (app/storage) avant que la ligne ne soit écrite — jamais de
    ligne pointant vers un fichier qui n'existe pas.
    """

    def __init__(self, db: AsyncSession):
        self.db = db

    async def upload(
        self,
        *,
        organization_id: uuid.UUID,
        uploader_id: uuid.UUID,
        record: Record,
        field_key: str | None,
        filename: str,
        content_type: str,
        data: bytes,
    ) -> Document:
        storage = get_storage_backend()
        document_id = uuid.uuid4()
        safe_filename = filename.replace("/", "_").replace("\\", "_")
        storage_key = f"{organization_id}/{record.id}/{document_id}_{safe_filename}"
        await storage.save(storage_key, data, content_type)

        document = Document(
            id=document_id,
            organization_id=organization_id,
            record_id=record.id,
            field_key=field_key,
            filename=filename,
            content_type=content_type,
            size_bytes=len(data),
            storage_key=storage_key,
            uploaded_by_user_id=uploader_id,
        )
        self.db.add(document)
        await self.db.flush()
        return document

    def signed_url(self, document: Document) -> str:
        return get_storage_backend().signed_url(document.storage_key)
