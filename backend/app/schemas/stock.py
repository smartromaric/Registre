import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class DepotCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    address: str | None = None


class DepotUpdate(BaseModel):
    name: str | None = None
    address: str | None = None
    is_active: bool | None = None


class DepotOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    name: str
    address: str | None
    is_active: bool


class VariantInput(BaseModel):
    attributes: dict[str, str] | None = None
    label: str | None = None
    default_threshold: int | None = None


class ArticleConfigCreate(BaseModel):
    unit: str | None = None
    purchase_price: float | None = None
    sale_price: float | None = None
    variant_attribute_labels: list[str] | None = Field(default=None, max_length=2)
    lot_tracking_enabled: bool = False
    is_consigned: bool = False
    deposit_unit_amount: float | None = None
    # Si vide, une variante par défaut (non déclinée) est créée automatiquement.
    variants: list[VariantInput] = []


class ArticleConfigOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    record_id: uuid.UUID
    unit: str | None
    purchase_price: float | None
    sale_price: float | None
    variant_attribute_labels: list[str] | None
    lot_tracking_enabled: bool
    is_consigned: bool
    deposit_unit_amount: float | None


class ArticleVariantOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    record_id: uuid.UUID
    attributes: dict | None
    label: str | None
    is_default: bool
    default_threshold: int | None


class ArticleWithVariantsOut(BaseModel):
    config: ArticleConfigOut
    variants: list[ArticleVariantOut]


class ThresholdSet(BaseModel):
    depot_id: uuid.UUID | None = None  # None = seuil global de la variante
    threshold: int = Field(ge=0)


class MovementCreate(BaseModel):
    # §11.4 : identifiant d'opération généré côté client — voir StockMovement.client_operation_id.
    client_operation_id: uuid.UUID | None = None
    variant_id: uuid.UUID
    depot_id: uuid.UUID
    quantity: int = Field(gt=0)
    reason: str | None = None
    supplier: str | None = None
    beneficiary: str | None = None
    cost_amount: float | None = None
    lot_number: str | None = None
    lot_expiry_date: date | None = None
    document_id: uuid.UUID | None = None
    note: str | None = None


class AdjustmentCreate(BaseModel):
    client_operation_id: uuid.UUID | None = None
    variant_id: uuid.UUID
    depot_id: uuid.UUID
    counted_quantity: int = Field(ge=0)
    note: str = Field(min_length=1)  # justification obligatoire (§7.3)


class TransferCreate(BaseModel):
    client_operation_id: uuid.UUID | None = None
    variant_id: uuid.UUID
    from_depot_id: uuid.UUID
    to_depot_id: uuid.UUID
    quantity: int = Field(gt=0)
    note: str | None = None


class MovementOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    client_operation_id: uuid.UUID | None
    variant_id: uuid.UUID
    depot_id: uuid.UUID
    movement_type: str
    quantity_delta: int
    reason: str | None
    supplier: str | None
    beneficiary: str | None
    cost_amount: float | None
    lot_number: str | None
    lot_expiry_date: date | None
    transfer_group_id: uuid.UUID | None
    adjustment_counted_quantity: int | None
    note: str | None
    created_at: datetime


class MovementListOut(BaseModel):
    items: list[MovementOut]
    total: int
    limit: int
    offset: int


class DepotThresholdOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    depot_id: uuid.UUID
    threshold: int


class StockLevelOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    variant_id: uuid.UUID
    depot_id: uuid.UUID
    quantity: int
    updated_at: datetime


class StockLotOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    variant_id: uuid.UUID
    depot_id: uuid.UUID
    lot_number: str
    expiry_date: date
    remaining_quantity: int


class ConsignmentActionCreate(BaseModel):
    variant_id: uuid.UUID
    depot_id: uuid.UUID
    # Cahier des charges §7.6 : "une sortie de bouteille pleine incrémente la
    # circulation ; un retour de vide la décrémente" — c'est tout le périmètre v1.
    action: Literal["deliver_full", "return_empty"]
    quantity: int = Field(gt=0)
    deposit_amount: float | None = None


class ConsignmentSummaryOut(BaseModel):
    variant_id: uuid.UUID
    depot_id: uuid.UUID
    full_count: int
    empty_count: int
    in_circulation_count: int
    deposit_amount_collected: float
