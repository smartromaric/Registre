import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_org_context
from app.models.membership import Membership
from app.schemas.search import SearchHitOut
from app.services.search_service import global_search

router = APIRouter(prefix="/organizations/{organization_id}/search", tags=["search"])


@router.get("", response_model=list[SearchHitOut])
async def search(
    q: str = Query(min_length=1),
    model_id: uuid.UUID | None = Query(default=None),
    membership: Membership = Depends(get_org_context),
    db: AsyncSession = Depends(get_db),
) -> list[SearchHitOut]:
    hits = await global_search(db, membership.organization_id, q, model_id=model_id)
    return [
        SearchHitOut(
            record_id=h.record_id, model_definition_id=h.model_definition_id, model_name=h.model_name, title=h.title
        )
        for h in hits
    ]
