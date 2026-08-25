import uuid
from dataclasses import dataclass
from datetime import UTC, datetime

from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.countries import currency_and_timezone_for_country
from app.core.security import (
    InvalidTokenError,
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.models.membership import Membership, OrgRole
from app.models.organization import Organization
from app.models.user import User
from app.repositories.membership import MembershipRepository
from app.repositories.organization import OrganizationRepository
from app.repositories.user import UserRepository


class AuthError(Exception):
    """Erreur métier d'authentification — toujours convertie en réponse honnête
    côté API (jamais un faux succès), cf. principe des états d'échec du playbook.
    """


class GoogleNotConfiguredError(AuthError):
    pass


@dataclass
class TokenPair:
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


def verify_google_id_token(id_token_value: str) -> dict:
    settings = get_settings()
    if not settings.google_client_id:
        raise GoogleNotConfiguredError("La connexion Google n'est pas configurée sur cet environnement.")
    return google_id_token.verify_oauth2_token(
        id_token_value, google_requests.Request(), settings.google_client_id
    )


class AuthService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.users = UserRepository(db)
        self.orgs = OrganizationRepository(db)
        self.memberships = MembershipRepository(db)

    # --- inscription / connexion ---------------------------------------------------

    async def signup_with_password(self, email: str, password: str, full_name: str) -> User:
        email = email.strip().lower()
        existing = await self.users.get_by_email(email)
        if existing is not None:
            if existing.hashed_password is not None:
                raise AuthError("Un compte existe déjà avec cet e-mail.")
            # Compte "invité" en attente : on lui permet de réclamer son accès (§4.4).
            existing.hashed_password = hash_password(password)
            existing.full_name = full_name or existing.full_name
            existing.is_active = True
            return await self.users.save(existing)

        user = User(email=email, full_name=full_name, hashed_password=hash_password(password), is_active=True)
        return await self.users.create(user)

    async def login_with_password(self, email: str, password: str) -> User:
        user = await self.users.get_by_email(email.strip().lower())
        if user is None or user.hashed_password is None or not verify_password(password, user.hashed_password):
            raise AuthError("E-mail ou mot de passe incorrect.")
        if not user.is_active:
            raise AuthError("Ce compte est désactivé.")
        return user

    async def login_or_signup_with_google(self, id_token_value: str) -> tuple[User, bool]:
        claims = verify_google_id_token(id_token_value)
        sub = claims["sub"]
        email = claims["email"].strip().lower()
        full_name = claims.get("name") or email

        user = await self.users.get_by_google_sub(sub)
        if user is not None:
            return user, False

        user = await self.users.get_by_email(email)
        if user is not None:
            # Compte existant (mot de passe ou "invité") : on rattache Google sans
            # jamais exiger de mot de passe (§4.4).
            user.google_sub = sub
            user.is_active = True
            return await self.users.save(user), False

        user = User(email=email, full_name=full_name, google_sub=sub, is_active=True)
        user = await self.users.create(user)
        return user, True

    def issue_tokens(self, user: User) -> TokenPair:
        return TokenPair(access_token=create_access_token(user.id), refresh_token=create_refresh_token(user.id))

    async def refresh(self, refresh_token: str) -> TokenPair:
        try:
            payload = decode_token(refresh_token)
        except InvalidTokenError as exc:
            raise AuthError("Jeton de rafraîchissement invalide ou expiré.") from exc
        if payload.get("type") != "refresh":
            raise AuthError("Jeton de rafraîchissement invalide.")
        user = await self.users.get(uuid.UUID(payload["sub"]))
        if user is None or not user.is_active:
            raise AuthError("Utilisateur introuvable ou désactivé.")
        return self.issue_tokens(user)

    # --- onboarding organisation (§4.4) ----------------------------------------------

    async def onboard_organization(
        self, user: User, name: str, country_code: str, sector: str | None
    ) -> tuple[Organization, Membership]:
        currency_code, tz = currency_and_timezone_for_country(country_code)
        organization = Organization(
            name=name,
            country_code=country_code.upper(),
            currency_code=currency_code,
            sector=sector,
            timezone=tz,
        )
        organization = await self.orgs.create(organization)

        # L'organisation vient d'être créée : c'est le seul cas où le contexte
        # d'organisation est positionné manuellement plutôt que par la dépendance
        # get_org_context, puisqu'aucune appartenance ne pouvait encore exister
        # pour l'établir. `current_user_id` est déjà positionné par get_current_user
        # pour toute requête HTTP ; on le repositionne ici par défense, au cas où ce
        # service serait un jour appelé hors de ce chemin (script, tâche planifiée).
        await self.db.execute(text(f"SET LOCAL app.current_org_id = '{organization.id}'"))
        await self.db.execute(text(f"SET LOCAL app.current_user_id = '{user.id}'"))

        membership = Membership(
            organization_id=organization.id,
            user_id=user.id,
            role=OrgRole.ADMIN,
            can_view_amounts=True,
            is_active=True,
            invited_at=datetime.now(UTC),
        )
        membership = await self.memberships.create(membership)
        return organization, membership
