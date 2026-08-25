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
