import secrets
import uuid

import pyotp
import qrcode
import qrcode.image.svg
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import (
    InvalidTokenError,
    create_two_factor_challenge_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.models.user import User
from app.repositories.user import UserRepository
from app.services.auth_service import AuthError

_ISSUER = "Registre"
_BACKUP_CODE_COUNT = 10


class TwoFactorError(AuthError):
    pass


class TwoFactorService:
    """Authentification à deux facteurs (TOTP, RFC 6238) — raffinement de sécurité
    non demandé par le cahier des charges mais listé comme manquant au lot 0. Un
    secret posé par `begin_setup` ne verrouille rien tant qu'un code valide n'a
    pas été confirmé par `enable` : impossible de s'enfermer hors de son propre
    compte en s'arrêtant à mi-chemin d'un réglage.
    """

    def __init__(self, db: AsyncSession):
        self.db = db
        self.users = UserRepository(db)

    async def begin_setup(self, user: User) -> tuple[str, str, str]:
        """Renvoie (secret, otpauth_uri, qr_code_svg). Remplace un secret déjà en
        attente (setup relancé) sans toucher à `totp_enabled` — un compte déjà
        protégé reste protégé tant que `enable` n'a pas confirmé le nouveau secret.
        """
        secret = pyotp.random_base32()
        user.totp_secret = secret
        await self.users.save(user)

        otpauth_uri = pyotp.TOTP(secret).provisioning_uri(name=user.email, issuer_name=_ISSUER)
        qr_svg = qrcode.make(otpauth_uri, image_factory=qrcode.image.svg.SvgImage)
        svg_markup = qr_svg.to_string().decode("utf-8")
        return secret, otpauth_uri, svg_markup

    async def enable(self, user: User, code: str) -> list[str]:
        """Vérifie le code TOTP contre le secret posé par `begin_setup`, active la
        2FA, et renvoie les codes de secours **en clair, une seule fois** — seule
        leur empreinte est conservée en base (`totp_backup_codes`), même principe
        que le mot de passe.
        """
        if not user.totp_secret:
            raise TwoFactorError("Aucune configuration 2FA en cours — recommencez depuis le début.")
        if not pyotp.TOTP(user.totp_secret).verify(code, valid_window=1):
            raise TwoFactorError("Code invalide.")

        plain_codes = [secrets.token_hex(4) for _ in range(_BACKUP_CODE_COUNT)]
        user.totp_backup_codes = [hash_password(c) for c in plain_codes]
        user.totp_enabled = True
        await self.users.save(user)
        return plain_codes

    async def disable(self, user: User, password: str) -> None:
        """Exige le mot de passe (pas seulement la session active) : désactiver la
        2FA affaiblit durablement la sécurité du compte, une action de ce poids ne
        doit pas dépendre d'un seul jeton d'accès déjà en main (session volée).
        """
        if user.hashed_password is None or not verify_password(password, user.hashed_password):
            raise TwoFactorError("Mot de passe incorrect.")
        user.totp_secret = None
        user.totp_enabled = False
        user.totp_backup_codes = None
        await self.users.save(user)

    def create_challenge(self, user: User) -> str:
        return create_two_factor_challenge_token(user.id)

    async def verify_challenge(self, challenge_token: str, code: str) -> User:
        try:
            payload = decode_token(challenge_token)
        except InvalidTokenError as exc:
            raise TwoFactorError("Session de connexion expirée — reconnectez-vous.") from exc
        if payload.get("type") != "two_factor_challenge":
            raise TwoFactorError("Jeton de vérification invalide.")

        user = await self.users.get(uuid.UUID(payload["sub"]))
        if user is None or not user.is_active or not user.totp_enabled or not user.totp_secret:
            raise TwoFactorError("Compte introuvable ou 2FA non activée.")

        if pyotp.TOTP(user.totp_secret).verify(code, valid_window=1):
            return user

        if self._consume_backup_code(user, code):
            await self.users.save(user)
            return user

        raise TwoFactorError("Code invalide.")

    @staticmethod
    def _consume_backup_code(user: User, code: str) -> bool:
        if not user.totp_backup_codes:
            return False
        remaining = list(user.totp_backup_codes)
        for hashed in remaining:
            if verify_password(code.strip(), hashed):
                remaining.remove(hashed)
                user.totp_backup_codes = remaining
                return True
        return False
