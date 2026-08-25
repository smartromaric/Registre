import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import Action, role_can
from app.models.membership import Membership
from app.models.model_definition import FieldDefinition, ModelDefinition
from app.models.user import User
from app.schemas.model_definition import FieldDefinitionCreate, FieldOption
from app.schemas.stock import ArticleConfigCreate
from app.seeds.templates import TEMPLATES
from app.services.audit_service import AuditService
from app.services.organization_service import PermissionDeniedError
from app.services.record_service import RecordService
from app.services.stock_service import StockService


class TemplateNotFoundError(Exception):
    pass


async def activate_template(
    db: AsyncSession, *, organization_id: uuid.UUID, actor: User, actor_membership: Membership, template_key: str
) -> ModelDefinition:
    """Cahier des charges §5.6 : "un modèle activé devient sa propriété et n'est
    plus lié au modèle d'origine" — on copie donc les données du gabarit dans de
    vraies lignes `ModelDefinition`/`FieldDefinition`, rien de plus.
    """
    if not role_can(actor_membership.role, Action.MANAGE_MODELS):
        raise PermissionDeniedError("Seul un administrateur peut activer un modèle.")

    template = TEMPLATES.get(template_key)
    if template is None:
        raise TemplateNotFoundError(f"Modèle « {template_key} » introuvable dans la bibliothèque.")

    model = ModelDefinition(
        organization_id=organization_id,
        name_singular=template["name_singular"],
        name_plural=template["name_plural"],
        icon=template.get("icon"),
        color=template.get("color"),
        nature=template["nature"],
        title_field_key=template.get("title_field_key"),
        status_options=template.get("status_options"),
        source_template_key=template_key,
    )
    db.add(model)
    await db.flush()

    for position, field_spec in enumerate(template["fields"]):
        options = field_spec.get("select_options")
        field_in = FieldDefinitionCreate(
            **{**field_spec, "select_options": [FieldOption(**o) for o in options] if options else None}
        )
        db.add(
            FieldDefinition(
                organization_id=organization_id,
                model_definition_id=model.id,
                key=field_in.key,
                label=field_in.label,
                field_type=field_in.field_type,
                position=position,
                is_required=field_in.is_required,
                is_unique=field_in.is_unique,
                help_text=field_in.help_text,
                show_in_list=field_in.show_in_list,
                is_filterable=field_in.is_filterable,
                select_options=(
                    [o.model_dump() for o in field_in.select_options] if field_in.select_options else None
                ),
                select_multiple=field_in.select_multiple,
                number_unit=field_in.number_unit,
            )
        )

    await db.flush()
    await db.refresh(model, attribute_names=["field_definitions"])

    for article_spec in template.get("starter_articles", []):
        record_service = RecordService(db)
        record = await record_service.create(
            organization_id=organization_id,
            actor=actor,
            actor_membership=actor_membership,
            model=model,
            data=article_spec["data"],
            status=None,
            site=None,
            assigned_person_record_id=None,
        )
        await StockService(db).configure_article(
            organization_id=organization_id,
            actor=actor,
            actor_membership=actor_membership,
            record=record,
            payload=ArticleConfigCreate(**article_spec["config"]),
        )

    await AuditService(db).record(
        organization_id=organization_id,
        actor_user_id=actor.id,
        action="model_definition.activate_template",
        entity_type="model_definition",
        entity_id=model.id,
        new_value={"template_key": template_key},
    )
    return model
