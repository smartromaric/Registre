import uuid
from datetime import UTC, date, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.alerts.engine import resolve_alerts_for_deadline
from app.core.permissions import Action, role_can
from app.dynamic_fields.validation import FieldValidationError, extract_due_dates, validate_and_normalize
from app.models.membership import Membership
from app.models.model_definition import ModelDefinition
from app.models.record import Record, RecordDeadline, RecordEvent
from app.models.sync import RecordFieldConflict
from app.models.user import User
from app.repositories.record import RecordRepository
from app.schemas.record import RecordEventCreate
from app.services.audit_service import AuditService
from app.services.organization_service import PermissionDeniedError


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo is not None else value.replace(tzinfo=UTC)


class RecordService:
    """Cahier des charges §6 : la fiche est l'objet réel créé à partir d'un modèle.
    Toute écriture passe ici — c'est le seul endroit qui sait valider `data` contre
    les définitions de champs et tenir à jour l'index des échéances (§8.2).
    """

    def __init__(self, db: AsyncSession):
        self.db = db
        self.repo = RecordRepository(db)
        self.audit = AuditService(db)

    async def list_for_model(
        self,
        organization_id: uuid.UUID,
        model_definition_id: uuid.UUID,
        *,
        include_archived: bool = False,
        status: str | None = None,
        field_filters: dict[str, str] | None = None,
        sort_key: str | None = None,
        sort_direction: str = "desc",
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[Record], int]:
        return await self.repo.list_for_model(
            organization_id,
            model_definition_id,
            include_archived=include_archived,
            status=status,
            field_filters=field_filters,
            sort_key=sort_key,
            sort_direction=sort_direction,
            limit=limit,
            offset=offset,
        )

    async def get(self, organization_id: uuid.UUID, record_id: uuid.UUID) -> Record | None:
        record = await self.repo.get(record_id)
        if record is None or record.organization_id != organization_id:
            return None
        return record

    async def create(
        self,
        *,
        organization_id: uuid.UUID,
        actor: User,
        actor_membership: Membership,
        model: ModelDefinition,
        data: dict[str, Any],
        status: str | None,
        site: str | None,
        assigned_person_record_id: uuid.UUID | None,
        record_id: uuid.UUID | None = None,
    ) -> Record:
        if not role_can(actor_membership.role, Action.CREATE_EDIT_RECORD):
            raise PermissionDeniedError("Vous n'avez pas le droit de créer une fiche.")

        # §11.4 : un identifiant généré côté client rend la création rejouable
        # sans effet — une resoumission après une synchronisation interrompue
        # (coupure réseau juste après l'écriture, avant que la réponse ne
        # revienne à l'appareil) renvoie la fiche déjà créée plutôt que d'en
        # produire une seconde.
        if record_id is not None:
            existing = await self.get(organization_id, record_id)
            if existing is not None:
                return existing

        normalized = validate_and_normalize(model.field_definitions, data, partial=False)
        await self._check_uniqueness(organization_id, model, normalized)

        created_at = datetime.now(UTC)
        record = Record(
            organization_id=organization_id,
            model_definition_id=model.id,
            data=normalized,
            # Base de comparaison pour la fusion champ par champ des futures mises
            # à jour (RecordService.update) — un champ jamais réécrit depuis la
            # création compare contre cet instant, pas contre `None`.
            field_updated_at={key: created_at.isoformat() for key in normalized},
            status=status,
            site=site,
            assigned_person_record_id=assigned_person_record_id,
            created_by_user_id=actor.id,
            updated_by_user_id=actor.id,
        )
        if record_id is not None:
            record.id = record_id
        self.db.add(record)
        await self.db.flush()

        await self._sync_deadlines(organization_id, model, record, normalized)

        await self.audit.record(
            organization_id=organization_id,
            actor_user_id=actor.id,
            action="record.create",
            entity_type="record",
            entity_id=record.id,
            new_value={"model_definition_id": str(model.id)},
        )
        return record

    async def update(
        self,
        *,
        organization_id: uuid.UUID,
        actor: User,
        actor_membership: Membership,
        model: ModelDefinition,
        record: Record,
        data: dict[str, Any] | None,
        status: str | None,
        site: str | None,
        assigned_person_record_id: uuid.UUID | None,
        client_operation_id: uuid.UUID | None = None,
        field_written_at: dict[str, datetime] | None = None,
    ) -> Record:
        """§11.3 : fusion champ par champ. `field_written_at` porte, pour chaque
        clé de `data`, l'instant où le CLIENT a réellement écrit cette valeur
        (capturé côté appareil au moment de la saisie, pas de l'envoi) — c'est ce
        qui distingue une vraie fusion d'un simple "dernier arrivé au serveur
        gagne", nécessaire pour qu'un agent hors-ligne reconnecté en retard ne
        puisse jamais écraser une écriture en ligne plus récente sur le même
        champ. Absent (cas normal, client en ligne sans file d'attente) : chaque
        champ est horodaté à `now()`, ce qui revient au comportement précédent
        (la dernière écriture appliquée gagne). `client_operation_id` rend cette
        méthode rejouable sans effet, comme RecordService.create.
        """
        if not role_can(actor_membership.role, Action.CREATE_EDIT_RECORD):
            raise PermissionDeniedError("Vous n'avez pas le droit de modifier cette fiche.")

        if client_operation_id is not None:
            replay = await self.audit.find_by_client_operation_id(
                organization_id, "record.update", client_operation_id
            )
            if replay is not None:
                record.conflicted_field_keys = []
                return record

        old_value = dict(record.data)
        merged = dict(record.data)
        field_timestamps = dict(record.field_updated_at)
        conflicts: list[RecordFieldConflict] = []

        if data is not None:
            normalized = validate_and_normalize(model.field_definitions, data, partial=True)
            await self._check_uniqueness(organization_id, model, normalized, exclude_record_id=record.id)

            now = datetime.now(UTC)
            for key, new_value in normalized.items():
                new_ts = _aware((field_written_at or {}).get(key) or now)
                old_ts_raw = field_timestamps.get(key)
                old_ts = datetime.fromisoformat(old_ts_raw) if old_ts_raw else None

                if old_ts is not None and new_ts < old_ts and merged.get(key) != new_value:
                    conflicts.append(
                        RecordFieldConflict(
                            organization_id=organization_id,
                            record_id=record.id,
                            field_key=key,
                            kept_value={"value": merged.get(key)},
                            kept_at=old_ts,
                            rejected_value={"value": new_value},
                            rejected_at=new_ts,
                            rejected_by_user_id=actor.id,
                        )
                    )
                    continue

                merged[key] = new_value
                field_timestamps[key] = new_ts.isoformat()

            record.data = merged
            record.field_updated_at = field_timestamps

        if status is not None:
            record.status = status
        if site is not None:
            record.site = site
        if assigned_person_record_id is not None:
            record.assigned_person_record_id = assigned_person_record_id
        record.updated_by_user_id = actor.id
        for conflict in conflicts:
            self.db.add(conflict)
        await self.db.flush()

        if data is not None:
            await self._sync_deadlines(organization_id, model, record, merged)

        await self.audit.record(
            organization_id=organization_id,
            actor_user_id=actor.id,
            action="record.update",
            entity_type="record",
            entity_id=record.id,
            old_value=old_value,
            new_value=merged,
            client_operation_id=client_operation_id,
        )
        record.conflicted_field_keys = [c.field_key for c in conflicts]
        return record

    async def archive(
        self, *, organization_id: uuid.UUID, actor: User, actor_membership: Membership, record: Record
    ) -> Record:
        if not role_can(actor_membership.role, Action.ARCHIVE_RECORD):
            raise PermissionDeniedError("Vous n'avez pas le droit d'archiver cette fiche.")

        record.is_archived = True
        record.archived_at = datetime.now(UTC)
        await self.db.flush()

        await self.audit.record(
            organization_id=organization_id,
            actor_user_id=actor.id,
            action="record.archive",
            entity_type="record",
            entity_id=record.id,
        )
        return record

    async def add_event(
        self,
        *,
        organization_id: uuid.UUID,
        actor: User,
        actor_membership: Membership,
        record: Record,
        payload: RecordEventCreate,
    ) -> RecordEvent:
        if not role_can(actor_membership.role, Action.CREATE_EDIT_RECORD):
            raise PermissionDeniedError("Vous n'avez pas le droit d'ajouter un événement.")

        event = RecordEvent(
            organization_id=organization_id,
            record_id=record.id,
            event_type=payload.event_type,
            occurred_at=payload.occurred_at,
            comment=payload.comment,
            cost_amount=payload.cost_amount,
            document_ids=[str(i) for i in payload.document_ids] if payload.document_ids else None,
            created_by_user_id=actor.id,
        )
        self.db.add(event)
        await self.db.flush()
        return event

    async def _check_uniqueness(
        self,
        organization_id: uuid.UUID,
        model: ModelDefinition,
        values: dict[str, Any],
        exclude_record_id: uuid.UUID | None = None,
    ) -> None:
        errors = {}
        for field in model.field_definitions:
            if field.is_unique and field.key in values and values[field.key] is not None:
                is_free = await self.repo.check_unique_value(
                    organization_id, model.id, field.key, values[field.key], exclude_record_id
                )
                if not is_free:
                    errors[field.key] = "cette valeur est déjà utilisée."
        if errors:
            raise FieldValidationError(errors)

    async def _sync_deadlines(
        self, organization_id: uuid.UUID, model: ModelDefinition, record: Record, values: dict[str, Any]
    ) -> None:
        """Tient à jour l'index matérialisé des échéances (RecordDeadline) et
        referme les alertes ouvertes quand une date change (§5.4).
        """
        due_dates = extract_due_dates(model.field_definitions, values)
        fields_by_key = {f.key: f for f in model.field_definitions}

        for key, value in due_dates.items():
            field = fields_by_key[key]
            due_date = date.fromisoformat(value["due_date"])
            document_id = uuid.UUID(value["document_id"]) if value.get("document_id") else None

            existing = await self.db.execute(
                select(RecordDeadline).where(
                    RecordDeadline.record_id == record.id, RecordDeadline.field_definition_id == field.id
                )
            )
            deadline = existing.scalar_one_or_none()

            if deadline is None:
                deadline = RecordDeadline(
                    organization_id=organization_id,
                    record_id=record.id,
                    field_definition_id=field.id,
                    due_date=due_date,
                    document_id=document_id,
                )
                self.db.add(deadline)
                await self.db.flush()
                continue

            date_changed = deadline.due_date != due_date
            deadline.due_date = due_date
            deadline.document_id = document_id
            await self.db.flush()
            if date_changed:
                await resolve_alerts_for_deadline(self.db, deadline.id)
