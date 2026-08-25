import uuid
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, Integer, String, Uuid, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, OrgScopedMixin, UUIDPrimaryKeyMixin


class RecordFieldConflict(UUIDPrimaryKeyMixin, OrgScopedMixin, Base):
    """Journal des conflits réels de fusion champ par champ (cahier des charges
    §11.3) : « Tout conflit réel est inscrit dans un journal consultable par
    l'administrateur, avec les deux valeurs. » Écrit uniquement quand une
    écriture rejouée (agent reconnecté en retard) perd face à une écriture
    chronologiquement plus récente sur le même champ — jamais pour une fusion
    silencieuse et sans perte (champs différents, ou même valeur).
    """

    __tablename__ = "record_field_conflicts"

    record_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("records.id"), nullable=False, index=True)
    field_key: Mapped[str] = mapped_column(String(80), nullable=False)

    kept_value: Mapped[dict] = mapped_column(JSONB, nullable=False)
    kept_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    rejected_value: Mapped[dict] = mapped_column(JSONB, nullable=False)
    rejected_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    rejected_by_user_id: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), ForeignKey("users.id"))

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    reviewed_by_user_id: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), ForeignKey("users.id"))


class UploadSession(UUIDPrimaryKeyMixin, OrgScopedMixin, Base):
    """Téléversement de photo/document reprenable (cahier des charges §11.3 :
    « Les photos partent en arrière-plan, compressées, et reprennent après
    coupure sans repartir de zéro. »). L'id est généré côté client (comme les
    fiches, §11.4) : une session ouverte hors-ligne garde le même id après une
    coupure, ce qui permet de reprendre l'envoi des morceaux déjà en attente
    sans en dupliquer aucun. Les morceaux eux-mêmes sont accumulés sur disque
    local (app/storage/chunked.py), hors du backend de stockage final
    (local/S3) — ils ne sont assemblés et poussés vers ce dernier qu'une fois
    la session complète.
    """

    __tablename__ = "upload_sessions"

    record_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("records.id"), nullable=False, index=True)
    field_key: Mapped[str | None] = mapped_column(String(80))

    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    content_type: Mapped[str] = mapped_column(String(120), nullable=False)
    total_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    chunk_size: Mapped[int] = mapped_column(Integer, nullable=False)
    # Indices des morceaux déjà reçus — un client qui revient après une coupure
    # relit cette liste pour savoir où reprendre plutôt que de tout renvoyer.
    chunks_received: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="in_progress")

    document_id: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), ForeignKey("documents.id"))
    created_by_user_id: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
