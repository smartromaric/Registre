import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.subscription import PaymentMethod, PaymentStatus, SubscriptionStatus


class OfferCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    duration_months: int = Field(gt=0)
    storage_quota_gb: int = Field(gt=0)
    user_quota: int | None = Field(default=None, gt=0)
    prices: dict[str, float] = Field(default_factory=dict)
    is_active: bool = True
    is_featured: bool = False


class OfferUpdate(BaseModel):
    name: str | None = None
    duration_months: int | None = None
    storage_quota_gb: int | None = None
    user_quota: int | None = None
    prices: dict[str, float] | None = None
    is_active: bool | None = None
    is_featured: bool | None = None


class OfferOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    duration_months: int
    storage_quota_gb: int
    user_quota: int | None
    prices: dict[str, float]
    is_active: bool
    is_featured: bool


class CurrencyCreate(BaseModel):
    code: str = Field(min_length=3, max_length=3)
    display_format: str = "{amount}"
    is_active: bool = True


class CurrencyUpdate(BaseModel):
    display_format: str | None = None
    is_active: bool | None = None


class CurrencyOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    code: str
    display_format: str
    is_active: bool


class SubscriptionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    organization_id: uuid.UUID
    offer_id: uuid.UUID | None
    status: SubscriptionStatus
    current_period_end: datetime
    read_only_since: datetime | None
    suspended_since: datetime | None


class SubscriptionAdminAdjust(BaseModel):
    """§13 : prolonger/suspendre/réactiver à la main, motif obligatoire."""

    new_status: SubscriptionStatus | None = None
    new_period_end: datetime | None = None
    reason: str = Field(min_length=1, max_length=300)


class PaymentDeclare(BaseModel):
    offer_id: uuid.UUID
    declared_amount: float = Field(gt=0)
    declared_reference: str = Field(min_length=1, max_length=120)


class PaymentValidate(BaseModel):
    validated_amount: float = Field(gt=0)
    currency_code: str = Field(min_length=3, max_length=3)
    method: PaymentMethod
    validated_reference: str | None = None


class PaymentReject(BaseModel):
    reason: str = Field(min_length=1, max_length=300)


class PaymentRecordManual(BaseModel):
    """§12.4 : l'éditeur enregistre un paiement sans demande préalable."""

    organization_id: uuid.UUID
    offer_id: uuid.UUID
    validated_amount: float = Field(gt=0)
    currency_code: str = Field(min_length=3, max_length=3)
    method: PaymentMethod
    validated_reference: str | None = None


class PaymentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    organization_id: uuid.UUID
    offer_id: uuid.UUID
    status: PaymentStatus
    declared_amount: float | None
    declared_reference: str | None
    validated_amount: float | None
    currency_code: str | None
    method: PaymentMethod | None
    validated_reference: str | None
    validated_at: datetime | None
    rejection_reason: str | None
    created_at: datetime


class InvoiceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    organization_id: uuid.UUID
    payment_id: uuid.UUID
    number: str
    amount: float
    currency_code: str
    period_start: date
    period_end: date
    issued_at: datetime


class OrganizationSummaryOut(BaseModel):
    """§13 : liste des organisations côté éditeur — date d'inscription, offre en
    cours, expiration, utilisateurs, stockage consommé/quota.
    """

    organization_id: uuid.UUID
    name: str
    country_code: str
    created_at: datetime
    subscription_status: SubscriptionStatus
    offer_name: str | None
    current_period_end: datetime
    member_count: int
