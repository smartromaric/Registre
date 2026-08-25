import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import Action, role_can
from app.models.membership import Membership
from app.models.model_definition import FieldDefinition, ModelDefinition
from app.models.user import User
from app.repositories.model_definition import ModelDefinitionRepository
from app.schemas.model_definition import (
    FieldDefinitionCreate,
    FieldDefinitionUpdate,
    ModelDefinitionCreate,
    ModelDefinitionUpdate,
)
from app.services.audit_service import AuditService
from app.services.organization_service import PermissionDeniedError


class FieldNotFoundError(Exception):
    pass


class FieldInUseError(Exception):
    pass


def _build_field(
    model_id: uuid.UUID, organization_id: uuid.UUID, payload: FieldDefinitionCreate, position: int
) -> FieldDefinition:
    return FieldDefinition(
        organization_id=organization_id,
        model_definition_id=model_id,
        key=payload.key,
        label=payload.label,
        field_type=payload.field_type,
        position=position,
        is_required=payload.is_required,
        is_unique=payload.is_unique,
        default_value=payload.default_value,
        help_text=payload.help_text,
        show_in_list=payload.show_in_list,
        is_filterable=payload.is_filterable,
        select_options=[o.model_dump() for o in payload.select_options] if payload.select_options else None,
        select_multiple=payload.select_multiple,
        number_unit=payload.number_unit,
        visible_roles=payload.visible_roles,
        editable_roles=payload.editable_roles,
        reminder_offsets_days=payload.reminder_offsets_days,
        reminder_repeat_days_overdue=payload.reminder_repeat_days_overdue,
    )


class ModelDefinitionService:
    """Le moteur de fiches (cahier des charges §5) : un administrateur définit ici
    ce que son organisation suit, sans développement.
    """

    def __init__(self, db: AsyncSession):
        self.db = db
        self.repo = ModelDefinitionRepository(db)
        self.audit = AuditService(db)

    async def list_for_org(self, organization_id: uuid.UUID) -> list[ModelDefinition]:
        return await self.repo.list_for_org(organization_id)

    async def get(self, organization_id: uuid.UUID, model_id: uuid.UUID) -> ModelDefinition | None:
        model = await self.repo.get(model_id)
        if model is None or model.organization_id != organization_id:
            return None
        return model

    async def create(
        self,
        *,
        organization_id: uuid.UUID,
        actor: User,
        actor_membership: Membership,
        payload: ModelDefinitionCreate,
    ) -> ModelDefinition:
        if not role_can(actor_membership.role, Action.MANAGE_MODELS):
            raise PermissionDeniedError("Seul un administrateur peut créer un modèle.")

        model = ModelDefinition(
            organization_id=organization_id,
            name_singular=payload.name_singular,
            name_plural=payload.name_plural,
            icon=payload.icon,
            color=payload.color,
            nature=payload.nature,
            title_field_key=payload.title_field_key,
            status_options=payload.status_options,
        )
        self.db.add(model)
        await self.db.flush()

        for index, field_in in enumerate(payload.fields):
            self.db.add(_build_field(model.id, organization_id, field_in, field_in.position or index))
        await self.db.flush()
        await self.db.refresh(model, attribute_names=["field_definitions"])

        await self.audit.record(
            organization_id=organization_id,
            actor_user_id=actor.id,
            action="model_definition.create",
            entity_type="model_definition",
            entity_id=model.id,
            new_value={"name_singular": model.name_singular, "nature": model.nature.value},
        )
        return model

    async def add_field(
        self,
        *,
        organization_id: uuid.UUID,
        actor: User,
        actor_membership: Membership,
        model: ModelDefinition,
        payload: FieldDefinitionCreate,
    ) -> FieldDefinition:
        if not role_can(actor_membership.role, Action.MANAGE_MODELS):
            raise PermissionDeniedError("Seul un administrateur peut modifier un modèle.")

        position = payload.position or len(model.field_definitions)
        field = _build_field(model.id, organization_id, payload, position)
        self.db.add(field)
        await self.db.flush()

        await self.audit.record(
            organization_id=organization_id,
            actor_user_id=actor.id,
            action="field_definition.create",
            entity_type="field_definition",
            entity_id=field.id,
            new_value={"key": field.key, "field_type": field.field_type.value},
        )
        return field

    async def update(
        self,
        *,
        organization_id: uuid.UUID,
        actor: User,
        actor_membership: Membership,
        model: ModelDefinition,
        payload: ModelDefinitionUpdate,
    ) -> ModelDefinition:
        if not role_can(actor_membership.role, Action.MANAGE_MODELS):
            raise PermissionDeniedError("Seul un administrateur peut modifier un modèle.")

        changes = payload.model_dump(exclude_unset=True)
        old_value = {k: getattr(model, k) for k in changes}
        for key, value in changes.items():
            setattr(model, key, value)
        await self.db.flush()

        await self.audit.record(
            organization_id=organization_id,
            actor_user_id=actor.id,
            action="model_definition.update",
            entity_type="model_definition",
            entity_id=model.id,
            old_value=old_value,
            new_value=changes,
        )
        return model

    async def update_field(
        self,
        *,
        organization_id: uuid.UUID,
        actor: User,
        actor_membership: Membership,
        model: ModelDefinition,
        field_id: uuid.UUID,
        payload: FieldDefinitionUpdate,
    ) -> FieldDefinition:
        """Ne permet pas de changer `key` ni `field_type` : les fiches déjà
        écrites portent leurs valeurs sous cette clé et sous cette forme
        (cahier des charges §5.2) — les renommer ou les retyper après coup
        romprait silencieusement les fiches existantes. Renommer le libellé
        affiché (`label`) reste libre, c'est ce que voit l'utilisateur.
        """
        if not role_can(actor_membership.role, Action.MANAGE_MODELS):
            raise PermissionDeniedError("Seul un administrateur peut modifier un champ.")
        field = self._get_field(model, field_id)

        changes = payload.model_dump(exclude_unset=True)
        old_value = {k: getattr(field, k) for k in changes}
        for key, value in changes.items():
            if key == "select_options" and value is not None:
                value = [o if isinstance(o, dict) else o.model_dump() for o in value]
            setattr(field, key, value)
        await self.db.flush()

        await self.audit.record(
            organization_id=organization_id,
            actor_user_id=actor.id,
            action="field_definition.update",
            entity_type="field_definition",
            entity_id=field.id,
            old_value=old_value,
            new_value=changes,
        )
        return field

    async def delete_field(
        self,
        *,
        organization_id: uuid.UUID,
        actor: User,
        actor_membership: Membership,
        model: ModelDefinition,
        field_id: uuid.UUID,
    ) -> None:
        """Cahier des charges §5.6 : « ajoutez, retirez ou renommez des champs ».
        Les fiches existantes gardent la valeur sous cette clé dans leur JSONB —
        elle devient simplement inerte, jamais une perte de données silencieuse
        au sens strict (l'historique d'audit de la fiche la conserve).
        """
        if not role_can(actor_membership.role, Action.MANAGE_MODELS):
            raise PermissionDeniedError("Seul un administrateur peut supprimer un champ.")
        field = self._get_field(model, field_id)
        if model.title_field_key == field.key:
            raise FieldInUseError("Ce champ sert de titre aux fiches de ce modèle : choisissez-en un autre d'abord.")

        await self.db.delete(field)
        await self.db.flush()
        model.field_definitions.remove(field)

        await self.audit.record(
            organization_id=organization_id,
            actor_user_id=actor.id,
            action="field_definition.delete",
            entity_type="field_definition",
            entity_id=field_id,
            old_value={"key": field.key},
        )

    async def reorder_fields(
        self,
        *,
        organization_id: uuid.UUID,
        actor: User,
        actor_membership: Membership,
        model: ModelDefinition,
        field_ids_in_order: list[uuid.UUID],
    ) -> list[FieldDefinition]:
        if not role_can(actor_membership.role, Action.MANAGE_MODELS):
            raise PermissionDeniedError("Seul un administrateur peut réordonner les champs.")

        fields_by_id = {f.id: f for f in model.field_definitions}
        if set(field_ids_in_order) != set(fields_by_id):
            raise FieldInUseError("La liste fournie ne correspond pas exactement aux champs existants du modèle.")

        for position, field_id in enumerate(field_ids_in_order):
            fields_by_id[field_id].position = position
        await self.db.flush()

        await self.audit.record(
            organization_id=organization_id,
            actor_user_id=actor.id,
            action="field_definition.reorder",
            entity_type="model_definition",
            entity_id=model.id,
            new_value={"order": [str(i) for i in field_ids_in_order]},
        )
        return sorted(model.field_definitions, key=lambda f: f.position)

    @staticmethod
    def _get_field(model: ModelDefinition, field_id: uuid.UUID) -> FieldDefinition:
        for field in model.field_definitions:
            if field.id == field_id:
                return field
        raise FieldNotFoundError("Champ introuvable sur ce modèle.")
