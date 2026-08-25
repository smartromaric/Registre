from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user, get_org_context
from app.models.membership import Membership
from app.models.user import User
from app.schemas.model_definition import ModelDefinitionOut
from app.seeds.service import TemplateNotFoundError, activate_template
from app.seeds.templates import TEMPLATES
from app.services.organization_service import PermissionDeniedError

router = APIRouter(prefix="/organizations/{organization_id}/templates", tags=["templates"])


@router.get("")
async def list_templates(membership: Membership = Depends(get_org_context)) -> list[dict]:
    """Bibliothèque de modèles prêts à l'emploi (cahier des charges §5.6)."""
    return [
        {
            "key": key,
            "name_singular": t["name_singular"],
            "name_plural": t["name_plural"],
            "nature": t["nature"].value,
            "icon": t.get("icon"),
            "color": t.get("color"),
            "field_count": len(t["fields"]),
        }
        for key, t in TEMPLATES.items()
    ]


@router.post("/{template_key}/activate", response_model=ModelDefinitionOut, status_code=status.HTTP_201_CREATED)
async def activate(
    template_key: str,
    user: User = Depends(get_current_user),
    membership: Membership = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
) -> ModelDefinitionOut:
    try:
        model = await activate_template(
            db,
            organization_id=membership.organization_id,
            actor=user,
            actor_membership=membership,
            template_key=template_key,
        )
    except TemplateNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc
    except PermissionDeniedError as exc:
        raise HTTPException(status.HTTP_403_FORBIDDEN, str(exc)) from exc
    return ModelDefinitionOut.model_validate(model)
