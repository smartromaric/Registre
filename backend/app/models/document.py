import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, OrgScopedMixin, UUIDPrimaryKeyMixin


class Document(UUIDPrimaryKeyMixin, OrgScopedMixin, Base):
    """Un fichier téléversé (document ou photo, cahier des charges §5.2). Jamais
    servi publiquement — voir app/storage pour les liens signés à courte durée
    (§14.1). Rattaché à une fiche : un document se téléverse toujours après la
    création de la fiche qui le porte.
    """

    __tablename__ = "documents"

    record_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("records.id"), nullable=False)
    field_key: Mapped[str | None] = mapped_column(String(80))

    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    content_type: Mapped[str] = mapped_column(String(120), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    storage_key: Mapped[str] = mapped_column(String(500), nullable=False)

    uploaded_by_user_id: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
