import enum
import uuid

from sqlalchemy import Boolean, ForeignKey, Integer, String, Uuid
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.dynamic_fields.types import FieldType
from app.models.base import Base, OrgScopedMixin, TimestampMixin, UUIDPrimaryKeyMixin


def _str_enum_column(enum_cls: type[enum.Enum], name: str):
    return SAEnum(enum_cls, name=name, values_callable=lambda cls: [e.value for e in cls])


class RecordNature(str, enum.Enum):
    """La distinction qui structure toute l'application (cahier des charges §5.5) :
    la question posée n'est pas la même ("qu'est-ce qui va expirer ?" contre
    "combien m'en reste-t-il ?").
    """

    ASSET = "asset"  # Actif suivi
    STOCK_ITEM = "stock_item"  # Article de stock (lot 2)


class ModelDefinition(UUIDPrimaryKeyMixin, OrgScopedMixin, TimestampMixin, Base):
    """Le gabarit qu'un administrateur configure (cahier des charges §5.1) : nom,
    icône, couleur, nature, liste de champs. Un modèle activé depuis la bibliothèque
    (§5.6) en devient une copie propre — `source_template_key` garde seulement une
    trace de son origine, aucun lien vivant n'est conservé.
    """

    __tablename__ = "model_definitions"

    name_singular: Mapped[str] = mapped_column(String(80), nullable=False)
    name_plural: Mapped[str] = mapped_column(String(80), nullable=False)
    icon: Mapped[str | None] = mapped_column(String(60))
    color: Mapped[str | None] = mapped_column(String(20))
    nature: Mapped[RecordNature] = mapped_column(_str_enum_column(RecordNature, "record_nature"), nullable=False)

    # Clé du champ (FieldDefinition.key) qui sert de titre à la fiche (§5.1).
    title_field_key: Mapped[str | None] = mapped_column(String(80))

    # Statuts disponibles pour les fiches de ce modèle (§6.1) — libres, propres à
    # l'organisation, pas un enum fixe (l'énoncé les dit "configurable").
    status_options: Mapped[list | None] = mapped_column(JSONB)

    source_template_key: Mapped[str | None] = mapped_column(String(60))
    is_archived: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    field_definitions: Mapped[list["FieldDefinition"]] = relationship(
        "FieldDefinition", back_populates="model_definition", order_by="FieldDefinition.position"
    )


class FieldDefinition(UUIDPrimaryKeyMixin, OrgScopedMixin, TimestampMixin, Base):
    """Un champ porté par un modèle (cahier des charges §5.2, §5.3). `key` est le
    nom utilisé dans `Record.data` (JSONB) — stable même si `label` change.
    """

    __tablename__ = "field_definitions"

    model_definition_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("model_definitions.id"), nullable=False
    )
    model_definition: Mapped["ModelDefinition"] = relationship(
        "ModelDefinition", back_populates="field_definitions"
    )

    key: Mapped[str] = mapped_column(String(80), nullable=False)
    label: Mapped[str] = mapped_column(String(120), nullable=False)
    field_type: Mapped[FieldType] = mapped_column(_str_enum_column(FieldType, "field_type"), nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    is_required: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_unique: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    default_value: Mapped[dict | None] = mapped_column(JSONB)
    help_text: Mapped[str | None] = mapped_column(String(300))
    show_in_list: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_filterable: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # SELECT
    select_options: Mapped[list | None] = mapped_column(JSONB)  # [{"value": "...", "label": "..."}]
    select_multiple: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # NUMBER
    number_unit: Mapped[str | None] = mapped_column(String(20))

    # Visibilité / édition par rôle (§5.3) — liste de OrgRole.value ; None = tous les rôles.
    visible_roles: Mapped[list | None] = mapped_column(JSONB)
    editable_roles: Mapped[list | None] = mapped_column(JSONB)

    # DUE_DATE — réglages de la règle de rappel (§8.1), copiés par défaut mais
    # ajustables champ par champ (§8.1 caption : "modifiables... modèle par modèle
    # et champ par champ").
    reminder_offsets_days: Mapped[list | None] = mapped_column(JSONB)
    reminder_repeat_days_overdue: Mapped[int | None] = mapped_column(Integer)
