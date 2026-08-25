from sqlalchemy import Boolean, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class User(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Un compte personne. Global, non cloisonné : la même adresse peut appartenir
    à plusieurs organisations (cahier des charges §4.4 — le comptable qui suit
    trois entreprises). Le cloisonnement se joue au niveau de `Membership`.
    """

    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(200), nullable=False)

    # Chemin principal : compte Google, aucun mot de passe créé ni stocké (§4.4, §14.1).
    google_sub: Mapped[str | None] = mapped_column(String(255), unique=True)
    # Repli e-mail + mot de passe : empreinte bcrypt uniquement (§14.1).
    hashed_password: Mapped[str | None] = mapped_column(String(255))

    # Faux tant que le compte est seulement "invité" et n'a pas encore été réclamé
    # (première connexion Google ou définition d'un mot de passe) — voir AuthService.
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    # Éditeur = super-administrateur de la plateforme. Aucun accès par défaut aux
    # données métier des organisations (§4.3) — ce n'est pas un rôle d'organisation,
    # c'est pourquoi il vit ici et non dans Membership.role.
    is_platform_admin: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
