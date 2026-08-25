from pydantic import BaseModel, EmailStr, Field

from app.schemas.user import UserOut


class SignupRequest(BaseModel):
    email: EmailStr
    # bcrypt ignore tout au-delà de 72 octets : on borne ici plutôt que de tronquer
    # silencieusement un mot de passe plus long à la volée.
    password: str = Field(min_length=8, max_length=72)
    full_name: str = Field(min_length=1, max_length=200)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class GoogleAuthRequest(BaseModel):
    id_token: str


class RefreshRequest(BaseModel):
    refresh_token: str


class TokenPairOut(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class AuthResponse(BaseModel):
    tokens: TokenPairOut
    user: UserOut
    is_new_user: bool = False


# --- mot de passe oublié (§4.4 raffinement) -----------------------------------------


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    password: str = Field(min_length=8, max_length=72)


# --- acceptation d'invitation par e-mail (§4.4) -------------------------------------


class InvitationInfoOut(BaseModel):
    """Ce qu'une page d'acceptation d'invitation affiche avant de demander un mot de
    passe — jamais le jeton lui-même, il reste dans l'URL côté client."""

    email: str
    organization_name: str
    already_active: bool


class InvitationAcceptRequest(BaseModel):
    token: str
    password: str = Field(min_length=8, max_length=72)
    full_name: str | None = Field(default=None, min_length=1, max_length=200)
