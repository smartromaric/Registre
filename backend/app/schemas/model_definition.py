import uuid
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.dynamic_fields.types import FieldType
from app.models.model_definition import RecordNature


class FieldOption(BaseModel):
    value: str
    label: str


class FieldDefinitionCreate(BaseModel):
    key: str = Field(min_length=1, max_length=80, pattern=r"^[a-z][a-z0-9_]*$")
    label: str = Field(min_length=1, max_length=120)
    field_type: FieldType
    position: int = 0
    is_required: bool = False
    is_unique: bool = False
    default_value: Any = None
    help_text: str | None = None
    show_in_list: bool = False
    is_filterable: bool = False
    select_options: list[FieldOption] | None = None
    select_multiple: bool = False
    number_unit: str | None = None
    visible_roles: list[str] | None = None
    editable_roles: list[str] | None = None
    reminder_offsets_days: list[int] | None = None
    reminder_repeat_days_overdue: int | None = None


class FieldDefinitionUpdate(BaseModel):
    label: str | None = None
    position: int | None = None
    is_required: bool | None = None
    is_unique: bool | None = None
    default_value: Any = None
    help_text: str | None = None
    show_in_list: bool | None = None
    is_filterable: bool | None = None
    select_options: list[FieldOption] | None = None
    select_multiple: bool | None = None
    number_unit: str | None = None
    visible_roles: list[str] | None = None
    editable_roles: list[str] | None = None
    reminder_offsets_days: list[int] | None = None
    reminder_repeat_days_overdue: int | None = None


class FieldDefinitionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    key: str
    label: str
    field_type: FieldType
    position: int
    is_required: bool
    is_unique: bool
    default_value: Any
    help_text: str | None
    show_in_list: bool
    is_filterable: bool
    select_options: list[dict] | None
    select_multiple: bool
    number_unit: str | None
    visible_roles: list[str] | None
    editable_roles: list[str] | None
    reminder_offsets_days: list[int] | None
    reminder_repeat_days_overdue: int | None


class ModelDefinitionCreate(BaseModel):
    name_singular: str = Field(min_length=1, max_length=80)
    name_plural: str = Field(min_length=1, max_length=80)
    icon: str | None = None
    color: str | None = None
    nature: RecordNature
    title_field_key: str | None = None
    status_options: list[str] | None = None
    fields: list[FieldDefinitionCreate] = []


class ModelDefinitionUpdate(BaseModel):
    name_singular: str | None = None
    name_plural: str | None = None
    icon: str | None = None
    color: str | None = None
    title_field_key: str | None = None
    status_options: list[str] | None = None
    is_archived: bool | None = None


class ModelDefinitionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name_singular: str
    name_plural: str
    icon: str | None
    color: str | None
    nature: RecordNature
    title_field_key: str | None
    status_options: list[str] | None
    source_template_key: str | None
    is_archived: bool
    field_definitions: list[FieldDefinitionOut]
