import enum
import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, UniqueConstraint, Uuid
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, OrgScopedMixin, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.user import User


class OrgRole(str, enum.Enum):
    """Les quatre rôles d'organisation (cahier des charges §4.1). L'Éditeur n'en
    fait pas partie : c'est un rôle de plateforme (`User.is_platform_admin`).
    """

    ADMIN = "admin"  # Administrateur d'organisation
    MANAGER = "manager"  # Gestionnaire
    OPERATOR = "operator"  # Opérateur
    READER = "reader"  # Lecteur


class Membership(UUIDPrimaryKeyMixin, OrgScopedMixin, TimestampMixin, Base):
    """Le lien cloisonné entre un utilisateur et une organisation, avec son rôle.
    Protégé par RLS (`organization_id`) — voir la migration initiale.
    """

    __tablename__ = "memberships"
    __table_args__ = (UniqueConstraint("organization_id", "user_id", name="uq_membership_org_user"),)

    user_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("users.id"), nullable=False)
    user: Mapped["User"] = relationship("User", foreign_keys=[user_id], lazy="joined")
    role: Mapped[OrgRole] = mapped_column(
        SAEnum(OrgRole, name="org_role", values_callable=lambda cls: [e.value for e in cls]),
        nullable=False,
    )

    # Réglage "option" de la matrice des droits §4.2 : un opérateur peut ou non
    # voir les montants et valorisations.
    can_view_amounts: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    invited_by_user_id: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), ForeignKey("users.id"))
    invited_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
