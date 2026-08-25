import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr

from app.models.membership import OrgRole
from app.schemas.user import UserOut


class MembershipInvite(BaseModel):
    email: EmailStr
    full_name: str
    role: OrgRole
    can_view_amounts: bool = True


class MembershipUpdate(BaseModel):
    role: OrgRole | None = None
    can_view_amounts: bool | None = None
    is_active: bool | None = None


class MembershipOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    organization_id: uuid.UUID
    role: OrgRole
    can_view_amounts: bool
    is_active: bool
    invited_at: datetime | None
    user: UserOut
