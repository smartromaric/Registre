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


class Offer(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Cahier des charges §12.1, §13. Pilotée par l'éditeur, pas cloisonnée par
    organisation : toutes les organisations voient le même catalogue.
    """

    __tablename__ = "offers"

    name: Mapped[str] = mapped_column(String(80), nullable=False)
    duration_months: Mapped[int] = mapped_column(Integer, nullable=False)
    storage_quota_gb: Mapped[int] = mapped_column(Integer, nullable=False)
    user_quota: Mapped[int | None] = mapped_column(Integer)  # None = illimité (§12.1)
    # {"XAF": 5000, "EUR": 12} — un prix par devise acceptée (§12.2, §13).
    prices: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    is_featured: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)


class Currency(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "currencies"

    code: Mapped[str] = mapped_column(String(3), nullable=False, unique=True)
    display_format: Mapped[str] = mapped_column(String(40), nullable=False, default="{amount}")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class SubscriptionStatus(str, enum.Enum):
    """Cahier des charges §12.3."""

    TRIAL = "trial"
    ACTIVE = "active"
    READ_ONLY = "read_only"
    SUSPENDED = "suspended"
    ARCHIVED = "archived"


class Subscription(UUIDPrimaryKeyMixin, OrgScopedMixin, TimestampMixin, Base):
    """Un seul enregistrement de paiement au fil du temps (§12.4 : « alimenté à la
    main en v1 et, plus tard, par un opérateur de paiement mobile »), pour que le
    passage à l'automatisation n'oblige pas à refaire la facturation ni le cycle
    d'abonnement.
    """

    __tablename__ = "subscriptions"
    __table_args__ = (UniqueConstraint("organization_id", name="uq_subscription_organization"),)

    offer_id: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), ForeignKey("offers.id"))
    status: Mapped[SubscriptionStatus] = mapped_column(
        _str_enum_column(SubscriptionStatus, "subscription_status"), nullable=False
    )
    current_period_end: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    read_only_since: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    suspended_since: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class PaymentStatus(str, enum.Enum):
    DECLARED = "declared"
    VALIDATED = "validated"
    REJECTED = "rejected"


class PaymentMethod(str, enum.Enum):
    MOBILE_MONEY = "mobile_money"
    BANK_TRANSFER = "bank_transfer"
    CASH = "cash"
    OTHER = "other"


class Payment(UUIDPrimaryKeyMixin, OrgScopedMixin, TimestampMixin, Base):
    """Cahier des charges §12.4 : le client déclare, l'éditeur vérifie et
    enregistre. Aussi utilisable par l'éditeur seul, sans déclaration préalable
    (« paiement reçu par un autre canal »).
    """

    __tablename__ = "payments"

    offer_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("offers.id"), nullable=False)
    status: Mapped[PaymentStatus] = mapped_column(
        _str_enum_column(PaymentStatus, "payment_status"), nullable=False, default=PaymentStatus.DECLARED
    )

    declared_amount: Mapped[float | None] = mapped_column(Numeric(14, 2))
    declared_reference: Mapped[str | None] = mapped_column(String(120))
    declared_by_user_id: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), ForeignKey("users.id"))

    validated_amount: Mapped[float | None] = mapped_column(Numeric(14, 2))
    currency_code: Mapped[str | None] = mapped_column(String(3))
    method: Mapped[PaymentMethod | None] = mapped_column(_str_enum_column(PaymentMethod, "payment_method"))
    validated_reference: Mapped[str | None] = mapped_column(String(120))
    validated_by_user_id: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), ForeignKey("users.id"))
    validated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    rejection_reason: Mapped[str | None] = mapped_column(String(300))
    # Motif obligatoire pour toute prolongation accordée à la main (§12.4).
    extension_reason: Mapped[str | None] = mapped_column(String(300))


class Invoice(UUIDPrimaryKeyMixin, OrgScopedMixin, Base):
    """Cahier des charges §12.4 : numérotée en séquence, à l'en-tête de l'éditeur.
    Émise automatiquement dès qu'un paiement est validé.
    """

    __tablename__ = "invoices"

    payment_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("payments.id"), nullable=False)
    number: Mapped[str] = mapped_column(String(30), nullable=False, unique=True)
    amount: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    currency_code: Mapped[str] = mapped_column(String(3), nullable=False)
    period_start: Mapped[date] = mapped_column(Date, nullable=False)
    period_end: Mapped[date] = mapped_column(Date, nullable=False)
    issued_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
