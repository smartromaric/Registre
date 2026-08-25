import enum
import uuid

from sqlalchemy import Boolean, ForeignKey, String
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, OrgScopedMixin, TimestampMixin, UUIDPrimaryKeyMixin


def _str_enum_column(enum_cls: type[enum.Enum], name: str):
    return SAEnum(enum_cls, name=name, values_callable=lambda cls: [e.value for e in cls])


class DashboardPeriod(str, enum.Enum):
    """Cahier des charges §10.4 : les quatre périodes proposées pour restreindre
    un tableau de bord (entrées/sorties, coût des événements)."""

    DAYS_7 = "7d"
    DAYS_30 = "30d"
    DAYS_90 = "90d"
    CURRENT_YEAR = "current_year"


class SavedDashboard(UUIDPrimaryKeyMixin, OrgScopedMixin, TimestampMixin, Base):
    """Cahier des charges §10.4 : un périmètre de tableau de bord (modèle + dépôt
    ou site + période) enregistré et nommé, et épinglable comme page d'accueil.
    Privé à son créateur — même principe que `SavedView` (§9) : aucune raison de
    partager la page d'accueil d'un magasinier avec le reste de l'organisation.
    `model_definition_id` absent = périmètre "Tout" (§10.1).
    """

    __tablename__ = "saved_dashboards"

    owner_user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    model_definition_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("model_definitions.id"))
    depot_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("depots.id"))
    site: Mapped[str | None] = mapped_column(String(120))
    period: Mapped[DashboardPeriod] = mapped_column(
        _str_enum_column(DashboardPeriod, "dashboard_period"), nullable=False, default=DashboardPeriod.DAYS_30
    )
    # Un seul tableau de bord épinglé à la fois par utilisateur (appliqué au
    # niveau service, pas d'une contrainte d'unicité partielle ici — voir
    # DashboardService.pin) : "chaque utilisateur peut épingler UN tableau de
    # bord comme sa page d'accueil".
    is_pinned: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
