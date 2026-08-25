import uuid
from datetime import date

from pydantic import BaseModel, ConfigDict, Field

from app.models.dashboard import DashboardPeriod
from app.models.model_definition import RecordNature

# --- périmètre et tableau de bord calculé (§10.1, §10.2, §10.3) --------------------


class DashboardScope(BaseModel):
    model_definition_id: uuid.UUID | None
    model_name: str | None
    nature: RecordNature | None
    depot_id: uuid.UUID | None
    depot_name: str | None
    site: str | None
    period: DashboardPeriod
    period_start: date
    period_end: date


class AttentionCounters(BaseModel):
    """§10.1 : les quatre indicateurs "qu'est-ce qui demande mon attention
    aujourd'hui", dans cet ordre. Seulement pour le périmètre global (§10.2 les
    remplace par des indicateurs propres à la nature du modèle focalisé)."""

    overdue_deadlines_count: int
    upcoming_deadlines_count: int
    understock_articles_count: int
    expiring_lots_count: int


class SummaryCounters(BaseModel):
    """Compteurs de synthèse globaux, affichés après les indicateurs d'attention
    (§10.1) — jamais avant, pour ne pas noyer ce qui demande une action."""

    total_records: int
    total_stock_value: float | None  # None si l'utilisateur n'a pas le droit de voir les montants (§4.2)


class MonthCount(BaseModel):
    month: str  # "2026-06"
    count: int


class MonthAmount(BaseModel):
    month: str
    amount: float


class StatusCount(BaseModel):
    status: str
    count: int


class AssetIndicators(BaseModel):
    """§10.3, ligne "Actif suivi"."""

    fiche_count: int
    status_breakdown: list[StatusCount]
    overdue_deadlines_count: int
    upcoming_deadlines_count: int
    event_cost_total: float | None
    upcoming_deadlines_by_month: list[MonthCount]
    event_cost_by_month: list[MonthAmount] | None


class VariantQuantity(BaseModel):
    variant_id: uuid.UUID
    label: str
    quantity: int


class DepotQuantity(BaseModel):
    depot_id: uuid.UUID
    depot_name: str
    quantity: int


class DayMovements(BaseModel):
    day: date
    entries_quantity: int
    exits_quantity: int


class StockIndicators(BaseModel):
    """§10.3, ligne "Article de stock"."""

    total_quantity: int
    understock_articles_count: int
    stock_value: float | None
    entries_quantity_period: int
    exits_quantity_period: int
    expiring_lots_count: int
    stock_by_variant: list[VariantQuantity]
    stock_by_depot: list[DepotQuantity]
    movements_by_day: list[DayMovements]


class DashboardOut(BaseModel):
    scope: DashboardScope
    attention: AttentionCounters | None
    summary: SummaryCounters | None
    asset: AssetIndicators | None
    stock: StockIndicators | None


# --- listes "cliquables" (§10.5) --------------------------------------------------


class DeadlineHitOut(BaseModel):
    record_id: uuid.UUID
    model_definition_id: uuid.UUID
    model_name: str
    record_title: str
    field_key: str
    field_label: str
    due_date: date
    days_overdue: int  # négatif si l'échéance n'est pas encore atteinte


class UnderstockHitOut(BaseModel):
    record_id: uuid.UUID
    model_name: str
    record_title: str
    variant_id: uuid.UUID
    variant_label: str
    depot_id: uuid.UUID
    depot_name: str
    quantity: int
    threshold: int


class ExpiringLotHitOut(BaseModel):
    record_id: uuid.UUID
    model_name: str
    record_title: str
    variant_id: uuid.UUID
    variant_label: str
    depot_id: uuid.UUID
    depot_name: str
    lot_number: str
    expiry_date: date
    remaining_quantity: int


class DeadlineHitListOut(BaseModel):
    items: list[DeadlineHitOut]
    total: int
    limit: int
    offset: int


class UnderstockHitListOut(BaseModel):
    items: list[UnderstockHitOut]
    total: int
    limit: int
    offset: int


class ExpiringLotHitListOut(BaseModel):
    items: list[ExpiringLotHitOut]
    total: int
    limit: int
    offset: int


# --- tableaux de bord enregistrés (§10.4) -------------------------------------------


class SavedDashboardCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    model_definition_id: uuid.UUID | None = None
    depot_id: uuid.UUID | None = None
    site: str | None = None
    period: DashboardPeriod = DashboardPeriod.DAYS_30


class SavedDashboardUpdate(BaseModel):
    name: str | None = None
    model_definition_id: uuid.UUID | None = None
    depot_id: uuid.UUID | None = None
    site: str | None = None
    period: DashboardPeriod | None = None
    is_pinned: bool | None = None


class SavedDashboardOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    model_definition_id: uuid.UUID | None
    depot_id: uuid.UUID | None
    site: str | None
    period: DashboardPeriod
    is_pinned: bool
