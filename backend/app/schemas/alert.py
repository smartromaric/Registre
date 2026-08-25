import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict

from app.models.alert import AlertStatus


class AlertOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    source_type: str
    source_id: uuid.UUID
    palier: str
    status: AlertStatus
    recipient_user_id: uuid.UUID | None
    postponed_until: date | None
    created_at: datetime
    resolved_at: datetime | None


class AlertPostpone(BaseModel):
    postponed_until: date


class NotificationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    body: str
    related_alert_id: uuid.UUID | None
    is_read: bool
    created_at: datetime
