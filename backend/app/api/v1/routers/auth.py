from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.schemas.auth import (
    AuthResponse,
    GoogleAuthRequest,
    LoginRequest,
    RefreshRequest,
    SignupRequest,
    TokenPairOut,
)
from app.schemas.organization import OrganizationCreate, OrganizationOut, OrganizationWithRole
from app.schemas.user import UserOut
from app.services.auth_service import AuthError, AuthService, GoogleNotConfiguredError

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/signup", response_model=AuthResponse)
async def signup(payload: SignupRequest, db: AsyncSession = Depends(get_db)) -> AuthResponse:
    service = AuthService(db)
    try:
        user = await service.signup_with_password(payload.email, payload.password, payload.full_name)
    except AuthError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
    tokens = service.issue_tokens(user)
    return AuthResponse(
        tokens=TokenPairOut(**tokens.__dict__), user=UserOut.model_validate(user), is_new_user=True
    )


@router.post("/login", response_model=AuthResponse)
async def login(payload: LoginRequest, db: AsyncSession = Depends(get_db)) -> AuthResponse:
    service = AuthService(db)
    try:
        user = await service.login_with_password(payload.email, payload.password)
    except AuthError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, str(exc)) from exc
    tokens = service.issue_tokens(user)
    return AuthResponse(tokens=TokenPairOut(**tokens.__dict__), user=UserOut.model_validate(user))


@router.post("/google", response_model=AuthResponse)
async def google_auth(payload: GoogleAuthRequest, db: AsyncSession = Depends(get_db)) -> AuthResponse:
    service = AuthService(db)
    try:
        user, is_new = await service.login_or_signup_with_google(payload.id_token)
    except GoogleNotConfiguredError as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)) from exc
    except (AuthError, ValueError, KeyError) as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Jeton Google invalide.") from exc
    tokens = service.issue_tokens(user)
    return AuthResponse(
        tokens=TokenPairOut(**tokens.__dict__), user=UserOut.model_validate(user), is_new_user=is_new
    )


@router.post("/refresh", response_model=TokenPairOut)
async def refresh(payload: RefreshRequest, db: AsyncSession = Depends(get_db)) -> TokenPairOut:
    service = AuthService(db)
    try:
        tokens = await service.refresh(payload.refresh_token)
    except AuthError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, str(exc)) from exc
    return TokenPairOut(**tokens.__dict__)


@router.get("/me", response_model=UserOut)
async def me(user: User = Depends(get_current_user)) -> UserOut:
    return UserOut.model_validate(user)


@router.post("/organizations", response_model=OrganizationWithRole, status_code=status.HTTP_201_CREATED)
async def onboard_organization(
    payload: OrganizationCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> OrganizationWithRole:
    """Étape 2 du parcours d'inscription (§4.4) : après l'authentification, on
    demande le nom de l'entreprise, le pays (fixe la devise) et le secteur.
    Volontairement sous /auth plutôt que /organizations : aucune organisation
    n'existe encore pour que get_org_context puisse s'appliquer.
    """
    service = AuthService(db)
    organization, membership = await service.onboard_organization(
        user, payload.name, payload.country_code, payload.sector
    )
    return OrganizationWithRole(
        **OrganizationOut.model_validate(organization).model_dump(), my_role=membership.role
    )
