import uuid

from sqlalchemy import ForeignKey, String, Uuid
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, OrgScopedMixin, TimestampMixin, UUIDPrimaryKeyMixin


class SavedView(UUIDPrimaryKeyMixin, OrgScopedMixin, TimestampMixin, Base):
    """Cahier des charges §9 : "un jeu de filtres, de colonnes et de tris qu'un
    utilisateur nomme et retrouve". Privée à son créateur en v1 — le partage
    d'une vue entre collègues n'est pas demandé par le cahier des charges et
    peut s'ajouter plus tard sans changer cette table (il suffirait d'ajouter
    un indicateur de partage, pas de la redéfinir).
    """

    __tablename__ = "saved_views"

    model_definition_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("model_definitions.id"), nullable=False, index=True
    )
    owner_user_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    # Filtres simples par égalité : {"field_key": "valeur"}. Les filtres avancés
    # (plages, comparateurs) sont un raffinement possible sans changer la forme.
    filters: Mapped[dict | None] = mapped_column(JSONB)
    columns: Mapped[list | None] = mapped_column(JSONB)
    sort_key: Mapped[str | None] = mapped_column(String(80))
    sort_direction: Mapped[str] = mapped_column(String(4), nullable=False, default="desc")
