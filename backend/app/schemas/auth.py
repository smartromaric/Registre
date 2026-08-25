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


class LoginResult(BaseModel):
    """Réponse de `POST /auth/login` — forme volontairement plus large
    qu'`AuthResponse` pour porter les deux issues possibles sans rompre le
    contrat existant : `requires_2fa=False` (l'immense majorité des comptes,
    2FA non activée) laisse `tokens`/`user` toujours renseignés exactement
    comme avant ; `requires_2fa=True` les laisse `None` et fournit
    `challenge_token` à la place, à soumettre avec le code à
    `POST /auth/2fa/verify` pour obtenir les jetons.
    """

    requires_2fa: bool = False
    challenge_token: str | None = None
    tokens: TokenPairOut | None = None
    user: UserOut | None = None
    is_new_user: bool = False


# --- authentification à deux facteurs (TOTP) ----------------------------------------


class TwoFactorSetupOut(BaseModel):
    secret: str
    otpauth_uri: str
    qr_code_svg: str


class TwoFactorEnableRequest(BaseModel):
    code: str = Field(min_length=6, max_length=6)


class TwoFactorEnableOut(BaseModel):
    backup_codes: list[str]


class TwoFactorDisableRequest(BaseModel):
    password: str


class TwoFactorVerifyRequest(BaseModel):
    challenge_token: str
    code: str = Field(min_length=6, max_length=8)  # code TOTP (6 chiffres) ou de secours (8 hex)


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
