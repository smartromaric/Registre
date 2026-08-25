import math
import uuid
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.document import Document
from app.models.record import Record
from app.models.sync import RecordFieldConflict, UploadSession
from app.models.user import User
from app.services.document_service import MAX_UPLOAD_BYTES, DocumentService
from app.storage.chunked import cleanup, read_assembled, write_chunk

# Un morceau isolé trop gros retire l'intérêt de la reprise (autant renvoyer
# le fichier entier) — cette borne garde chaque morceau raisonnable à rejouer
# après une coupure, sans contraindre le choix du client au-delà.
MAX_CHUNK_BYTES = 5 * 1024 * 1024


class UploadSessionError(Exception):
    pass


class SyncConflictService:
    """§11.3 : « Tout conflit réel est inscrit dans un journal consultable par
    l'administrateur, avec les deux valeurs. » — lecture et pointage comme lu,
    écriture faite exclusivement par RecordService.update.
    """

    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_for_organization(
        self, organization_id: uuid.UUID, *, only_unreviewed: bool = False, limit: int = 50, offset: int = 0
    ) -> tuple[list[RecordFieldConflict], int]:
        stmt = select(RecordFieldConflict).where(RecordFieldConflict.organization_id == organization_id)
        if only_unreviewed:
            stmt = stmt.where(RecordFieldConflict.reviewed_at.is_(None))
        total = (await self.db.execute(select(func.count()).select_from(stmt.subquery()))).scalar_one()
        stmt = stmt.order_by(RecordFieldConflict.created_at.desc()).limit(limit).offset(offset)
        items = (await self.db.execute(stmt)).scalars().all()
        return list(items), total

    async def acknowledge(
        self, organization_id: uuid.UUID, conflict_id: uuid.UUID, actor: User
    ) -> RecordFieldConflict | None:
        conflict = await self.db.get(RecordFieldConflict, conflict_id)
        if conflict is None or conflict.organization_id != organization_id:
            return None
        conflict.reviewed_at = datetime.now(UTC)
        conflict.reviewed_by_user_id = actor.id
        await self.db.flush()
        return conflict


class UploadSessionService:
    """§11.3 : « Les photos partent en arrière-plan, compressées, et reprennent
    après coupure sans repartir de zéro. » Chaque morceau reçu est écrit sur
    disque local (app/storage/chunked.py) ; l'assemblage et le passage au
    backend de stockage final n'ont lieu qu'à `complete`.
    """

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_or_resume(
        self,
        *,
        organization_id: uuid.UUID,
        record: Record,
        actor: User,
        session_id: uuid.UUID,
        field_key: str | None,
        filename: str,
        content_type: str,
        total_bytes: int,
        chunk_size: int,
    ) -> UploadSession:
        existing = await self.get(organization_id, session_id)
        if existing is not None:
            return existing
        if total_bytes > MAX_UPLOAD_BYTES:
            raise UploadSessionError("Fichier trop volumineux.")
        if chunk_size > MAX_CHUNK_BYTES:
            raise UploadSessionError("Morceau trop volumineux.")

        session = UploadSession(
            id=session_id,
            organization_id=organization_id,
            record_id=record.id,
            field_key=field_key,
            filename=filename,
            content_type=content_type,
            total_bytes=total_bytes,
            chunk_size=chunk_size,
            chunks_received=[],
            status="in_progress",
            created_by_user_id=actor.id,
        )
        self.db.add(session)
        await self.db.flush()
        return session

    async def get(self, organization_id: uuid.UUID, session_id: uuid.UUID) -> UploadSession | None:
        session = await self.db.get(UploadSession, session_id)
        if session is None or session.organization_id != organization_id:
            return None
        return session

    async def _get_for_update(self, organization_id: uuid.UUID, session_id: uuid.UUID) -> UploadSession | None:
        stmt = select(UploadSession).where(UploadSession.id == session_id).with_for_update()
        found = (await self.db.execute(stmt)).scalar_one_or_none()
        if found is None or found.organization_id != organization_id:
            return None
        return found

    def expected_chunk_count(self, session: UploadSession) -> int:
        return math.ceil(session.total_bytes / session.chunk_size)

    async def save_chunk(self, session: UploadSession, chunk_index: int, data: bytes) -> UploadSession:
        if session.status != "in_progress":
            raise UploadSessionError("Ce téléversement est déjà terminé.")
        expected = self.expected_chunk_count(session)
        if not (0 <= chunk_index < expected):
            raise UploadSessionError("Indice de morceau hors limites.")
        if len(data) > session.chunk_size:
            raise UploadSessionError("Ce morceau dépasse la taille annoncée pour la session.")

        write_chunk(session.id, chunk_index, data)
        received = set(session.chunks_received)
        received.add(chunk_index)
        session.chunks_received = sorted(received)
        await self.db.flush()
        return session

    async def complete(
        self,
        *,
        organization_id: uuid.UUID,
        session: UploadSession,
        actor: User,
        record: Record,
        document_service: DocumentService,
    ) -> Document:
        # Verrou de ligne avant toute décision : sans lui, deux appels concurrents
        # à `complete` pour la même session pouvaient tous deux lire "en cours",
        # assembler et téléverser chacun de leur côté — le second échouant avec
        # une erreur disque brute au lieu d'un résultat idempotent, puisque le
        # premier avait déjà nettoyé les morceaux (voir app/storage/chunked.py).
        locked = await self._get_for_update(organization_id, session.id)
        if locked is None:
            raise UploadSessionError("Session de téléversement introuvable.")
        session = locked

        # Resoumission après coupure entre l'écriture et la réponse (§11.4) :
        # renvoie le document déjà produit plutôt que d'assembler une seconde fois.
        if session.status == "completed" and session.document_id is not None:
            document = await document_service.get(organization_id, session.document_id)
            if document is not None:
                return document

        expected = list(range(self.expected_chunk_count(session)))
        if sorted(session.chunks_received) != expected:
            missing = sorted(set(expected) - set(session.chunks_received))
            raise UploadSessionError(f"Morceaux manquants : {missing}")

        data = read_assembled(session.id, session.chunks_received)
        if len(data) != session.total_bytes:
            raise UploadSessionError("Taille assemblée incohérente — reprenez le téléversement.")

        document = await document_service.upload(
            organization_id=organization_id,
            uploader_id=actor.id,
            record=record,
            field_key=session.field_key,
            filename=session.filename,
            content_type=session.content_type,
            data=data,
        )
        session.status = "completed"
        session.document_id = document.id
        await self.db.flush()
        cleanup(session.id)
        return document
