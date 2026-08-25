import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class RecordFieldConflictOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    record_id: uuid.UUID
    field_key: str
    kept_value: dict
    kept_at: datetime
    rejected_value: dict
    rejected_at: datetime
    rejected_by_user_id: uuid.UUID | None
    created_at: datetime
    reviewed_at: datetime | None
    reviewed_by_user_id: uuid.UUID | None


class RecordFieldConflictListOut(BaseModel):
    items: list[RecordFieldConflictOut]
    total: int
    limit: int
    offset: int


class UploadSessionCreate(BaseModel):
    # Généré côté client (§11.4) : une session ouverte hors-ligne garde le même
    # id après une coupure, ce qui permet de la retrouver et de reprendre
    # l'envoi plutôt que d'en ouvrir une seconde en double.
    id: uuid.UUID
    field_key: str | None = None
    filename: str = Field(min_length=1, max_length=255)
    content_type: str = Field(min_length=1, max_length=120)
    total_bytes: int = Field(gt=0)
    chunk_size: int = Field(gt=0)


class UploadSessionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    record_id: uuid.UUID
    field_key: str | None
    filename: str
    content_type: str
    total_bytes: int
    chunk_size: int
    chunks_received: list[int]
    status: str
    document_id: uuid.UUID | None
