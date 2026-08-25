from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.schemas.auth import (
    AuthResponse,
    ForgotPasswordRequest,
    GoogleAuthRequest,
    InvitationAcceptRequest,
    InvitationInfoOut,
    LoginRequest,
    LoginResult,
    RefreshRequest,
    ResetPasswordRequest,
    SignupRequest,
    TokenPairOut,
    TwoFactorDisableRequest,
    TwoFactorEnableOut,
    TwoFactorEnableRequest,
    TwoFactorSetupOut,
    TwoFactorVerifyRequest,
)
from app.schemas.organization import OrganizationCreate, OrganizationOut, OrganizationWithRole
from app.schemas.user import UserOut
from app.services.auth_service import AuthError, AuthService, GoogleNotConfiguredError
from app.services.two_factor_service import TwoFactorError, TwoFactorService

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


@router.post("/login", response_model=LoginResult)
async def login(payload: LoginRequest, db: AsyncSession = Depends(get_db)) -> LoginResult:
    service = AuthService(db)
    try:
        user = await service.login_with_password(payload.email, payload.password)
    except AuthError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, str(exc)) from exc

    if user.totp_enabled:
        challenge_token = TwoFactorService(db).create_challenge(user)
        return LoginResult(requires_2fa=True, challenge_token=challenge_token)

    tokens = service.issue_tokens(user)
    return LoginResult(tokens=TokenPairOut(**tokens.__dict__), user=UserOut.model_validate(user))


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


# --- mot de passe oublié ----------------------------------------------------------


@router.post("/password/forgot", status_code=status.HTTP_204_NO_CONTENT)
async def forgot_password(payload: ForgotPasswordRequest, db: AsyncSession = Depends(get_db)) -> None:
    """Toujours 204, qu'un compte existe ou non pour cet e-mail — voir
    AuthService.request_password_reset : éviter d'énumérer les comptes.
    """
    await AuthService(db).request_password_reset(payload.email)


@router.post("/password/reset", response_model=AuthResponse)
async def reset_password(payload: ResetPasswordRequest, db: AsyncSession = Depends(get_db)) -> AuthResponse:
    service = AuthService(db)
    try:
        user = await service.reset_password(payload.token, payload.password)
    except AuthError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    tokens = service.issue_tokens(user)
    return AuthResponse(tokens=TokenPairOut(**tokens.__dict__), user=UserOut.model_validate(user))


# --- acceptation d'invitation par e-mail (§4.4) -------------------------------------


@router.get("/invitations/{token}", response_model=InvitationInfoOut)
async def get_invitation(token: str, db: AsyncSession = Depends(get_db)) -> InvitationInfoOut:
    service = AuthService(db)
    try:
        user, _membership, organization = await service.get_invitation_info(token)
    except AuthError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    return InvitationInfoOut(
        email=user.email, organization_name=organization.name, already_active=user.hashed_password is not None
    )


@router.post("/invitations/accept", response_model=AuthResponse)
async def accept_invitation(payload: InvitationAcceptRequest, db: AsyncSession = Depends(get_db)) -> AuthResponse:
    service = AuthService(db)
    try:
        user = await service.accept_invitation(payload.token, payload.password, payload.full_name)
    except AuthError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    tokens = service.issue_tokens(user)
    return AuthResponse(tokens=TokenPairOut(**tokens.__dict__), user=UserOut.model_validate(user))


# --- authentification à deux facteurs (TOTP) ----------------------------------------


@router.post("/2fa/setup", response_model=TwoFactorSetupOut)
async def setup_two_factor(
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> TwoFactorSetupOut:
    secret, otpauth_uri, qr_code_svg = await TwoFactorService(db).begin_setup(user)
    return TwoFactorSetupOut(secret=secret, otpauth_uri=otpauth_uri, qr_code_svg=qr_code_svg)


@router.post("/2fa/enable", response_model=TwoFactorEnableOut)
async def enable_two_factor(
    payload: TwoFactorEnableRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TwoFactorEnableOut:
    try:
        backup_codes = await TwoFactorService(db).enable(user, payload.code)
    except TwoFactorError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    return TwoFactorEnableOut(backup_codes=backup_codes)


@router.post("/2fa/disable", status_code=status.HTTP_204_NO_CONTENT)
async def disable_two_factor(
    payload: TwoFactorDisableRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    try:
        await TwoFactorService(db).disable(user, payload.password)
    except TwoFactorError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc


@router.post("/2fa/verify", response_model=AuthResponse)
async def verify_two_factor(payload: TwoFactorVerifyRequest, db: AsyncSession = Depends(get_db)) -> AuthResponse:
    """Deuxième étape de connexion pour un compte à 2FA activée — voir `login`
    ci-dessus, qui renvoie `challenge_token` au lieu de jetons directement.
    """
    service = TwoFactorService(db)
    try:
        user = await service.verify_challenge(payload.challenge_token, payload.code)
    except TwoFactorError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    tokens = AuthService(db).issue_tokens(user)
    return AuthResponse(tokens=TokenPairOut(**tokens.__dict__), user=UserOut.model_validate(user))


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
