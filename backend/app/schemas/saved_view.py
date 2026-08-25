import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class SavedViewCreate(BaseModel):
    model_definition_id: uuid.UUID
    name: str = Field(min_length=1, max_length=120)
    filters: dict[str, str] | None = None
    columns: list[str] | None = None
    sort_key: str | None = None
    sort_direction: str = Field(default="desc", pattern="^(asc|desc)$")


class SavedViewUpdate(BaseModel):
    name: str | None = None
    filters: dict[str, str] | None = None
    columns: list[str] | None = None
    sort_key: str | None = None
    sort_direction: str | None = Field(default=None, pattern="^(asc|desc)$")


class SavedViewOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    model_definition_id: uuid.UUID
    name: str
    filters: dict[str, str] | None
    columns: list[str] | None
    sort_key: str | None
    sort_direction: str
    created_at: datetime
