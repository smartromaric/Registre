from datetime import UTC, datetime, timedelta

from sqlalchemy import DateTime, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


def _default_trial_end() -> datetime:
    from app.core.config import get_settings

    return datetime.now(UTC) + timedelta(days=get_settings().trial_period_days)


class Organization(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Une entreprise cliente. C'est l'unité d'abonnement et de cloisonnement
    (cahier des charges §3). Cette table n'est pas elle-même protégée par RLS —
    son id EST l'organisation ; la visibilité est filtrée par appartenance
    (voir MembershipRepository / OrganizationRepository).
    """

    __tablename__ = "organizations"

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    legal_name: Mapped[str | None] = mapped_column(String(200))
    country_code: Mapped[str] = mapped_column(String(2), nullable=False)
    currency_code: Mapped[str] = mapped_column(String(3), nullable=False)
    sector: Mapped[str | None] = mapped_column(String(120))
    timezone: Mapped[str] = mapped_column(String(64), nullable=False, default="UTC")

    # Cycle de vie complet de l'abonnement (offre, quotas, factures) arrive au lot 4 (§12).
    # En attendant, la date de fin d'essai suffit à faire fonctionner le parcours d'inscription (§4.4).
    trial_ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_default_trial_end)
