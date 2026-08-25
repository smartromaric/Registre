from sqlalchemy import Boolean, String
from sqlalchemy.dialects.postgresql import JSONB
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

    # Authentification à deux facteurs (TOTP, RFC 6238). `totp_secret` est posé dès
    # `POST /auth/2fa/setup` mais `totp_enabled` ne bascule à `true` qu'une fois un
    # code valide vérifié (`POST /auth/2fa/enable`) — un secret seul n'active rien,
    # pour ne jamais verrouiller un compte hors d'un choix explicite et confirmé.
    totp_secret: Mapped[str | None] = mapped_column(String(64))
    totp_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # Codes de secours à usage unique, hachés (bcrypt) — jamais en clair en base,
    # même principe que hashed_password. Liste JSON de hachages ; un code consommé
    # est retiré de la liste plutôt que marqué "utilisé" (plus simple, même garantie
    # d'usage unique).
    totp_backup_codes: Mapped[list | None] = mapped_column(JSONB)
