import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import Action, role_can
from app.models.membership import Membership
from app.models.model_definition import FieldDefinition, ModelDefinition
from app.models.user import User
from app.repositories.model_definition import ModelDefinitionRepository
from app.schemas.model_definition import FieldDefinitionCreate, ModelDefinitionCreate, ModelDefinitionUpdate
from app.services.audit_service import AuditService
from app.services.organization_service import PermissionDeniedError


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
