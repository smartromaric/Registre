import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class DocumentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    record_id: uuid.UUID
    field_key: str | None
    filename: str
    content_type: str
    size_bytes: int
    created_at: datetime


class DocumentWithUrlOut(DocumentOut):
    url: str
