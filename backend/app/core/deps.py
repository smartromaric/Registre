import uuid
from collections.abc import Callable

from fastapi import Depends, HTTPException, Path, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import InvalidTokenError, decode_token
from app.models.membership import Membership, OrgRole
from app.models.user import User
from app.repositories.membership import MembershipRepository
from app.repositories.user import UserRepository

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)

__all__ = ["get_db", "get_current_user", "get_org_context", "require_role", "require_platform_admin"]


async def get_current_user(
    token: str | None = Depends(oauth2_scheme), db: AsyncSession = Depends(get_db)
) -> User:
    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Authentification requise.")
    try:
        payload = decode_token(token)
    except InvalidTokenError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Jeton invalide ou expiré.") from exc
    if payload.get("type") != "access":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Jeton invalide.")

    user = await UserRepository(db).get(uuid.UUID(payload["sub"]))
    if user is None or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Utilisateur introuvable ou désactivé.")

    # Positionné dès l'authentification, pas seulement dans get_org_context : la
    # table memberships doit rester lisible par son propre titulaire — sur toutes
    # ses organisations — AVANT même qu'un contexte d'organisation soit choisi.
    # C'est justement la requête qui sert à établir ce contexte (bootstrap) et à
    # lister "mes organisations" (§4.4 : un utilisateur peut appartenir à
    # plusieurs). Postgres n'acceptant pas de paramètres liés dans SET LOCAL, on
    # interpole directement la valeur — sûr ici car `user.id` est un uuid.UUID
    # typé, jamais une chaîne libre venant du client.
    await db.execute(text(f"SET LOCAL app.current_user_id = '{user.id}'"))
    return user


async def get_org_context(
    organization_id: uuid.UUID = Path(...),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Membership:
    """Vérifie l'appartenance, PUIS positionne le contexte RLS pour le reste de la
    transaction. Toute route qui dépend de ceci est protégée par la base, pas
    seulement par ce contrôle applicatif (cahier des charges §14.1).
    """
    membership = await MembershipRepository(db).get_for_user_and_org(user.id, organization_id)
    if membership is None or not membership.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Vous n'appartenez pas à cette organisation.")

    await db.execute(text(f"SET LOCAL app.current_org_id = '{organization_id}'"))
    return membership


def require_role(*roles: OrgRole) -> Callable:
    async def _check(membership: Membership = Depends(get_org_context)) -> Membership:
        if membership.role not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Rôle insuffisant pour cette action.")
        return membership

    return _check


async def require_platform_admin(user: User = Depends(get_current_user)) -> User:
    if not user.is_platform_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Réservé à l'éditeur du service.")
    return user
