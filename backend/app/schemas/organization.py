import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.membership import OrgRole


class OrganizationCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    country_code: str = Field(min_length=2, max_length=2)
    sector: str | None = Field(default=None, max_length=120)


class OrganizationUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    legal_name: str | None = None
    sector: str | None = None
    currency_code: str | None = Field(default=None, min_length=3, max_length=3)
    timezone: str | None = None


class OrganizationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    legal_name: str | None
    country_code: str
    currency_code: str
    sector: str | None
    timezone: str
    trial_ends_at: datetime
    created_at: datetime


class OrganizationWithRole(OrganizationOut):
    my_role: OrgRole
