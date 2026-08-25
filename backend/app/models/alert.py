import enum
import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, String, UniqueConstraint, Uuid, func
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, OrgScopedMixin, UUIDPrimaryKeyMixin


def _str_enum_column(enum_cls: type[enum.Enum], name: str):
    return SAEnum(enum_cls, name=name, values_callable=lambda cls: [e.value for e in cls])


class AlertSourceType(str, enum.Enum):
    DEADLINE = "deadline"  # RecordDeadline (échéance, §8.1)
    STOCK_THRESHOLD = "stock_threshold"  # StockLevel sous le seuil (§8.1)
    LOT_EXPIRY = "lot_expiry"  # StockLot proche de la péremption (§8.1)


class AlertStatus(str, enum.Enum):
    EMITTED = "emitted"
    ACKNOWLEDGED = "acknowledged"
    POSTPONED = "postponed"
    RESOLVED = "resolved"


class Alert(UUIDPrimaryKeyMixin, OrgScopedMixin, Base):
    """Un signalement produit par le moteur (cahier des charges §3, §8.3). La
    contrainte d'unicité (organisation, source, palier) est ce qui rend le
    balayage nocturne idempotent (§8.2) : le réexécuter ne duplique rien.
    """

    __tablename__ = "alerts"
    __table_args__ = (
        UniqueConstraint("organization_id", "source_type", "source_id", "palier", name="uq_alert_source_palier"),
    )

    source_type: Mapped[AlertSourceType] = mapped_column(
        _str_enum_column(AlertSourceType, "alert_source_type"), nullable=False
    )
    source_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), nullable=False, index=True)
    # Étiquette du palier de rappel franchi : "j-60", "j-30", "j-7", "j-0", "overdue-1"...
    palier: Mapped[str] = mapped_column(String(20), nullable=False)

    status: Mapped[AlertStatus] = mapped_column(
        _str_enum_column(AlertStatus, "alert_status"), nullable=False, default=AlertStatus.EMITTED
    )
    recipient_user_id: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), ForeignKey("users.id"))
    postponed_until: Mapped[date | None] = mapped_column(Date)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
