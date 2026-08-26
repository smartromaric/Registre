import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict

from app.models.alert import AlertStatus


class AlertTarget(BaseModel):
    """Ce que l'alerte désigne réellement, résolu côté serveur.

    `Alert` ne porte que `source_type` + `source_id`, et ce `source_id` pointe un
    `RecordDeadline`, un `StockLevel` ou un `StockLot` — jamais une fiche. Aucune
    route ne permettait d'en remonter jusqu'à quelque chose de navigable :
    l'écran Alertes affichait donc des lignes sur lesquelles on ne pouvait pas
    cliquer, et empruntait son libellé au texte de la notification liée.

    La résolution se fait ici, en une requête groupée par type de source, parce
    que c'est le serveur — et lui seul — qui connaît ces jointures.

    `label` est **toujours** rempli ; les identifiants de navigation, non. Une
    fiche supprimée depuis l'émission de l'alerte donne une cible absente plutôt
    qu'un lien fabriqué qui finirait en 404.
    """

    model_config = ConfigDict(from_attributes=True)

    label: str
    #: Alertes d'échéance — la fiche concernée. Le frontend a déjà `/r/{id}`.
    record_id: uuid.UUID | None = None
    #: Alertes de stock (seuil, péremption de lot).
    depot_id: uuid.UUID | None = None
    variant_id: uuid.UUID | None = None


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
    #: Absente quand la source a disparu — voir `AlertTarget`.
    target: AlertTarget | None = None


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
    #: Même cible que l'alerte liée, résolue par le serveur — sans quoi la cloche
    #: devrait interroger une seconde route pour savoir où mène chaque ligne.
    #: `None` quand la notification n'est liée à aucune alerte, ou quand la source
    #: de celle-ci a disparu.
    target: AlertTarget | None = None
