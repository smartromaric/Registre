import uuid
from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Numeric, String, UniqueConstraint, Uuid, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, OrgScopedMixin, TimestampMixin, UUIDPrimaryKeyMixin, utcnow


class Record(UUIDPrimaryKeyMixin, OrgScopedMixin, TimestampMixin, Base):
    """Une fiche : un objet réel créé à partir d'un modèle (cahier des charges §3).
    Structure hybride prescrite au §15 : colonnes fixes du socle ici, champs
    personnalisés dans `data` (JSONB, indexé — voir la migration).
    """

    __tablename__ = "records"

    model_definition_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("model_definitions.id"), nullable=False, index=True
    )
    data: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    # Socle commun à toute fiche (§6.1) : statut configurable, affectation facultative.
    status: Mapped[str | None] = mapped_column(String(60))
    site: Mapped[str | None] = mapped_column(String(120))
    assigned_person_record_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("records.id")
    )

    is_archived: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    created_by_user_id: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), ForeignKey("users.id"))
    updated_by_user_id: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), ForeignKey("users.id"))


class RecordEvent(UUIDPrimaryKeyMixin, OrgScopedMixin, Base):
    """Un événement daté sur une fiche — entretien, réparation, incident, contrôle,
    affectation (cahier des charges §6.2). Remplace le carnet d'entretien papier.
    """

    __tablename__ = "record_events"

    record_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("records.id"), nullable=False, index=True
    )
    event_type: Mapped[str] = mapped_column(String(40), nullable=False)
    occurred_at: Mapped[date] = mapped_column(Date, nullable=False)
    comment: Mapped[str | None] = mapped_column(String(2000))
    cost_amount: Mapped[float | None] = mapped_column(Numeric(14, 2))
    document_ids: Mapped[list | None] = mapped_column(JSONB)

    created_by_user_id: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class RecordDeadline(UUIDPrimaryKeyMixin, OrgScopedMixin, Base):
    """Index matérialisé des champs Échéance, tenu à jour par RecordService à
    chaque écriture. Existe pour que le moteur d'alertes (app/alerts) balaie une
    table plate et indexée plutôt que de traverser du JSONB pour chaque
    organisation et chaque modèle — voir cahier des charges §8.2, §14.3.

    Une ligne par (record, champ) — `id` reste stable d'un renouvellement à
    l'autre, ce qui permet au moteur d'alertes de résoudre proprement les
    alertes ouvertes quand la date change (§5.4 : "l'alerte en cours se referme
    d'elle-même").
    """

    __tablename__ = "record_deadlines"
    __table_args__ = (UniqueConstraint("record_id", "field_definition_id", name="uq_deadline_record_field"),)

    record_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("records.id"), nullable=False)
    field_definition_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("field_definitions.id"), nullable=False
    )
    due_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    document_id: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), ForeignKey("documents.id"))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=utcnow
    )
