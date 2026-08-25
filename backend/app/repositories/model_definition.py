import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.model_definition import ModelDefinition


class ModelDefinitionRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get(self, model_id: uuid.UUID) -> ModelDefinition | None:
        stmt = (
            select(ModelDefinition)
            .options(selectinload(ModelDefinition.field_definitions))
            .where(ModelDefinition.id == model_id)
        )
        return (await self.db.execute(stmt)).scalar_one_or_none()

    async def list_for_org(
        self, organization_id: uuid.UUID, *, include_archived: bool = False
    ) -> list[ModelDefinition]:
        stmt = (
            select(ModelDefinition)
            .options(selectinload(ModelDefinition.field_definitions))
            .where(ModelDefinition.organization_id == organization_id)
        )
        if not include_archived:
            stmt = stmt.where(ModelDefinition.is_archived.is_(False))
        stmt = stmt.order_by(ModelDefinition.name_plural)
        return list((await self.db.execute(stmt)).scalars().unique().all())
