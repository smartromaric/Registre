import uuid
from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class RecordCreate(BaseModel):
    # Cahier des charges §11.4 : « les identifiants sont générés côté client »
    # — condition posée dès les fondations pour que le mode hors-ligne (lot 5)
    # n'ait jamais à réécrire ce socle. Absent (cas normal aujourd'hui, client web
    # en ligne) : le serveur en génère un. Fourni (agent de terrain ayant créé la
    # fiche hors connexion) : une resoumission avec le même id est un jeu sans
    # effet — voir RecordService.create.
    id: uuid.UUID | None = None
    data: dict[str, Any] = {}
    status: str | None = None
    site: str | None = None
    assigned_person_record_id: uuid.UUID | None = None


class RecordUpdate(BaseModel):
    data: dict[str, Any] | None = None
    status: str | None = None
    site: str | None = None
    assigned_person_record_id: uuid.UUID | None = None
    # §11.3/§11.4 — fondations posées pour le mode hors-ligne (lot 5) :
    # `client_operation_id` rend cette écriture rejouable sans effet (une
    # resoumission après coupure réseau ne réapplique pas la mise à jour).
    # `field_written_at` porte, pour chaque clé de `data`, l'instant où le
    # client a réellement saisi cette valeur (pas l'instant d'envoi) — c'est ce
    # qui permet à RecordService.update de fusionner champ par champ plutôt que
    # de laisser le dernier arrivé au serveur écraser une écriture plus
    # récente. Absents : comportement inchangé (client en ligne classique).
    client_operation_id: uuid.UUID | None = None
    field_written_at: dict[str, datetime] | None = None


class RecordOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    model_definition_id: uuid.UUID
    data: dict[str, Any]
    status: str | None
    site: str | None
    assigned_person_record_id: uuid.UUID | None
    is_archived: bool
    archived_at: datetime | None
    created_at: datetime
    updated_at: datetime


class RecordUpdateOut(RecordOut):
    # Clés de `data` dont l'écriture soumise a été rejetée par la fusion champ
    # par champ (§11.3) au profit d'une valeur déjà en place plus récente — vide
    # dans l'immense majorité des cas (aucun conflit, ou aucune information de
    # temps fournie par le client). Permet au client de savoir immédiatement,
    # sans consulter le journal, qu'une de ses valeurs n'a pas été retenue.
    conflicted_field_keys: list[str] = []


class RecordListOut(BaseModel):
    items: list[RecordOut]
    total: int
    limit: int
    offset: int


class RecordEventCreate(BaseModel):
    event_type: str = Field(min_length=1, max_length=40)
    occurred_at: date
    comment: str | None = None
    cost_amount: float | None = None
    document_ids: list[uuid.UUID] | None = None


class RecordEventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    record_id: uuid.UUID
    event_type: str
    occurred_at: date
    comment: str | None
    cost_amount: float | None
    document_ids: list[str] | None
    created_at: datetime
