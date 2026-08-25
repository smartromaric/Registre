import hashlib
import uuid
from datetime import UTC, datetime, timedelta

import bcrypt
from jose import JWTError, jwt

from app.core.config import get_settings


class InvalidTokenError(Exception):
    pass


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))


def _create_token(subject: uuid.UUID, token_type: str, expires_delta: timedelta) -> str:
    settings = get_settings()
    now = datetime.now(UTC)
    payload = {
        "sub": str(subject),
        "type": token_type,
        "iat": int(now.timestamp()),
        "exp": now + expires_delta,
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def create_access_token(user_id: uuid.UUID) -> str:
    settings = get_settings()
    return _create_token(user_id, "access", timedelta(minutes=settings.access_token_expire_minutes))


def create_refresh_token(user_id: uuid.UUID) -> str:
    settings = get_settings()
    return _create_token(user_id, "refresh", timedelta(days=settings.refresh_token_expire_days))


def password_fingerprint(hashed_password: str) -> str:
    """Empreinte courte et stable du mot de passe actuel, embarquée dans le
    jeton de réinitialisation pour le rendre à usage unique sans état
    supplémentaire en base (voir create_password_reset_token)."""
    return hashlib.sha256(hashed_password.encode("utf-8")).hexdigest()[:16]


def create_password_reset_token(user_id: uuid.UUID, current_hashed_password: str) -> str:
    """Correctif sécurité (2026-08-25) : un jeton `password_reset` JWT n'a par
    nature aucun état côté serveur, donc rien n'empêchait par défaut de le
    rejouer plusieurs fois pendant toute son heure de validité. Embarquer une
    empreinte du mot de passe EN PLACE au moment de l'émission rend le jeton
    à usage unique sans table de jetons consommés à tenir à jour : la première
    utilisation change le mot de passe, donc change l'empreinte, donc toute
    resoumission du même jeton ne correspond plus à rien (voir
    AuthService.reset_password, qui vérifie l'empreinte avant d'appliquer).
    """
    settings = get_settings()
    now = datetime.now(UTC)
    payload = {
        "sub": str(user_id),
        "type": "password_reset",
        "pwd_fp": password_fingerprint(current_hashed_password),
        "iat": int(now.timestamp()),
        "exp": now + timedelta(hours=1),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def create_two_factor_challenge_token(user_id: uuid.UUID) -> str:
    """Émis une fois le mot de passe vérifié pour un compte à 2FA activée —
    prouve que ce jeton correspond bien à quelqu'un qui vient de réussir la
    première étape, sans encore délivrer de jeton d'accès/rafraîchissement
    tant que le second facteur n'est pas confirmé. Volontairement très court
    (5 min) : ce n'est qu'un pont entre les deux étapes d'une même connexion.
    """
    return _create_token(user_id, "two_factor_challenge", timedelta(minutes=5))


def create_invitation_token(user_id: uuid.UUID, organization_id: uuid.UUID) -> str:
    """§4.4 : le lien d'invitation par e-mail. Volontairement long à vivre (14
    jours, comme la durée de rétention la plus courte du produit) — un membre
    invité qui revient de congés ne doit pas trouver un lien mort.

    Porte `organization_id` en plus du sujet (`user_id`) : accepter une
    invitation se produit avant toute authentification, donc avant que
    `SET LOCAL app.current_org_id`/`app.current_user_id` n'aient de raison
    d'être positionnés — sans `organization_id` explicite dans le jeton, la
    ligne `memberships` correspondante resterait invisible sous RLS (même
    blocage de démarrage que l'onboarding d'une organisation, voir
    AuthService.onboard_organization). Encoder aussi l'organisation lève
    l'ambiguïté si la même personne est invitée deux fois, dans deux
    organisations, avant d'avoir accepté la première.
    """
    settings = get_settings()
    now = datetime.now(UTC)
    payload = {
        "sub": str(user_id),
        "type": "invitation",
        "organization_id": str(organization_id),
        "iat": int(now.timestamp()),
        "exp": now + timedelta(days=14),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_token(token: str) -> dict:
    settings = get_settings()
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except JWTError as exc:
        raise InvalidTokenError(str(exc)) from exc
