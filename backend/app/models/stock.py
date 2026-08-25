import enum
import uuid
from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, Numeric, String, UniqueConstraint, Uuid, func
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, OrgScopedMixin, TimestampMixin, UUIDPrimaryKeyMixin


def _str_enum_column(enum_cls: type[enum.Enum], name: str):
    return SAEnum(enum_cls, name=name, values_callable=lambda cls: [e.value for e in cls])


class MovementType(str, enum.Enum):
    """Cahier des charges §7.3. Un transfert s'écrit comme deux mouvements liés
    (TRANSFER_OUT au dépôt d'origine, TRANSFER_IN au dépôt de destination) pour
    que la mécanique d'application reste uniforme : chaque mouvement porte un
    delta signé sur UN SEUL dépôt.
    """

    ENTRY = "entry"
    EXIT = "exit"
    TRANSFER_OUT = "transfer_out"
    TRANSFER_IN = "transfer_in"
    ADJUSTMENT = "adjustment"


class Depot(UUIDPrimaryKeyMixin, OrgScopedMixin, TimestampMixin, Base):
    """Cahier des charges §7.2 : les quantités sont toujours rattachées à un dépôt."""

    __tablename__ = "depots"

    name: Mapped[str] = mapped_column(String(120), nullable=False)
    address: Mapped[str | None] = mapped_column(String(300))
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class ArticleConfig(UUIDPrimaryKeyMixin, OrgScopedMixin, Base):
    """Réglages du module Stock pour une fiche de nature `stock_item` (§7.1, §7.5,
    §7.6). Séparé de `Record.data` : ce ne sont pas des champs personnalisés de
    l'organisation, mais la configuration du moteur de stock lui-même.
    """

    __tablename__ = "article_configs"

    record_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("records.id"), nullable=False, unique=True
    )
    unit: Mapped[str | None] = mapped_column(String(20))
    purchase_price: Mapped[float | None] = mapped_column(Numeric(14, 2))
    sale_price: Mapped[float | None] = mapped_column(Numeric(14, 2))
    # Libellés des attributs de variantes propres à cet article, ex. ["Taille", "Couleur"]
    # — un ou deux au maximum (§7.1).
    variant_attribute_labels: Mapped[list | None] = mapped_column(JSONB)
    lot_tracking_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_consigned: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    deposit_unit_amount: Mapped[float | None] = mapped_column(Numeric(14, 2))


class ArticleVariant(UUIDPrimaryKeyMixin, OrgScopedMixin, TimestampMixin, Base):
    """Une déclinaison d'un article (§7.1). Un article non décliné porte une seule
    variante `is_default=True`, sans attribut — ainsi mouvements et niveaux de
    stock s'accrochent toujours à une variante, jamais directement à l'article.
    """

    __tablename__ = "article_variants"

    record_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("records.id"), nullable=False, index=True)
    attributes: Mapped[dict | None] = mapped_column(JSONB)
    label: Mapped[str | None] = mapped_column(String(120))
    is_default: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # Seuil global (§7.2) ; un seuil par dépôt peut le surcharger (DepotThreshold).
    default_threshold: Mapped[int | None] = mapped_column(Integer)


class DepotThreshold(UUIDPrimaryKeyMixin, OrgScopedMixin, Base):
    """Surcharge du seuil d'alerte dépôt par dépôt (§7.2 : "réglable globalement
    ET dépôt par dépôt").
    """

    __tablename__ = "depot_thresholds"
    __table_args__ = (UniqueConstraint("variant_id", "depot_id", name="uq_depot_threshold"),)

    variant_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("article_variants.id"), nullable=False)
    depot_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("depots.id"), nullable=False)
    threshold: Mapped[int] = mapped_column(Integer, nullable=False)


class StockMovement(UUIDPrimaryKeyMixin, OrgScopedMixin, Base):
    """Cahier des charges §7.3 : immuable, jamais modifié — on corrige par un
    mouvement inverse. `quantity_delta` est signé : positif augmente le stock du
    dépôt visé, négatif le diminue. C'est ce qui rend deux mouvements concurrents
    toujours additifs, jamais en conflit (§11.3, §11.4).
    """

    __tablename__ = "stock_movements"

    # §11.4 : identifiant généré côté client pour l'opération DEMANDÉE (une sortie
    # avec suivi de lots peut produire plusieurs lignes, une par lot consommé —
    # distinct de `id`, qui reste propre à chaque ligne, donc pas de contrainte
    # d'unicité DB ici : une même opération partage volontairement cette valeur
    # sur plusieurs lignes). La détection d'une resoumission après synchronisation
    # interrompue se fait donc côté service (StockService._check_idempotent),
    # avant toute écriture — suffisant pour un appareil qui rejoue sa propre file
    # séquentiellement, le scénario réel du mode hors-ligne (§11.3).
    client_operation_id: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), index=True)

    variant_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("article_variants.id"), nullable=False, index=True
    )
    depot_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("depots.id"), nullable=False, index=True)
    movement_type: Mapped[MovementType] = mapped_column(_str_enum_column(MovementType, "movement_type"), nullable=False)
    quantity_delta: Mapped[int] = mapped_column(Integer, nullable=False)

    reason: Mapped[str | None] = mapped_column(String(60))
    supplier: Mapped[str | None] = mapped_column(String(120))
    beneficiary: Mapped[str | None] = mapped_column(String(120))
    cost_amount: Mapped[float | None] = mapped_column(Numeric(14, 2))

    lot_number: Mapped[str | None] = mapped_column(String(60))
    lot_expiry_date: Mapped[date | None] = mapped_column(Date)

    document_id: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), ForeignKey("documents.id"))
    transfer_group_id: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), index=True)
    adjustment_counted_quantity: Mapped[int | None] = mapped_column(Integer)
    note: Mapped[str | None] = mapped_column(String(500))

    created_by_user_id: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class StockLevel(UUIDPrimaryKeyMixin, OrgScopedMixin, Base):
    """Index matérialisé de la quantité courante par (variante, dépôt) — même
    principe que `RecordDeadline` pour les échéances : le moteur d'alertes et les
    tableaux de bord balaient une table plate plutôt que de sommer les mouvements
    à chaque lecture (§14.3). Tenue à jour par un trigger Postgres (voir la
    migration) : l'incrément est atomique même sous écritures concurrentes.
    """

    __tablename__ = "stock_levels"
    __table_args__ = (UniqueConstraint("variant_id", "depot_id", name="uq_stock_level"),)

    variant_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("article_variants.id"), nullable=False)
    depot_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("depots.id"), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class StockLot(UUIDPrimaryKeyMixin, OrgScopedMixin, Base):
    """Cahier des charges §7.5 : quantité restante d'un lot précis, quand le suivi
    des lots est actif pour l'article. Les sorties se font au plus ancien (FIFO
    par date de péremption) — voir StockService._consume_lots_fifo.
    """

    __tablename__ = "stock_lots"
    __table_args__ = (UniqueConstraint("variant_id", "depot_id", "lot_number", name="uq_stock_lot"),)

    variant_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("article_variants.id"), nullable=False)
    depot_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("depots.id"), nullable=False)
    lot_number: Mapped[str] = mapped_column(String(60), nullable=False)
    expiry_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    remaining_quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ConsignmentLevel(UUIDPrimaryKeyMixin, OrgScopedMixin, Base):
    """Cahier des charges §7.6 : trois compteurs globaux par dépôt — pleines,
    vides, en circulation chez les clients — plus le montant de consigne
    encaissé. Les "pleines" sont déjà le fait de `StockLevel` (mouvements
    normaux d'entrée/sortie sur la variante, §7.3) : les dupliquer ici créerait
    deux sources de vérité pour le même nombre. Cette table ne porte donc que ce
    qui est propre à la consignation — vides et circulation — pas la troisième
    valeur, recomposée à la lecture (voir StockService.get_consignment_summary).
    """

    __tablename__ = "consignment_levels"
    __table_args__ = (UniqueConstraint("variant_id", "depot_id", name="uq_consignment_level"),)

    variant_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("article_variants.id"), nullable=False)
    depot_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("depots.id"), nullable=False)
    empty_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    in_circulation_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    deposit_amount_collected: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
