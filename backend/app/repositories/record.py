import uuid
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.record import Record


class RecordRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get(self, record_id: uuid.UUID) -> Record | None:
        return await self.db.get(Record, record_id)

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
        stmt = select(Record).where(
            Record.organization_id == organization_id, Record.model_definition_id == model_definition_id
        )
        if not include_archived:
            stmt = stmt.where(Record.is_archived.is_(False))
        if status:
            stmt = stmt.where(Record.status == status)
        # Cahier des charges §9 : filtres combinables sur tout champ marqué filtrable
        # — égalité simple en v1 (voir SavedView pour les raffinements possibles).
        for key, value in (field_filters or {}).items():
            stmt = stmt.where(Record.data[key].astext == value)

        total = (await self.db.execute(select(func.count()).select_from(stmt.subquery()))).scalar_one()

        order_column = self._sort_column(sort_key)
        order_column = order_column.desc() if sort_direction == "desc" else order_column.asc()
        stmt = stmt.order_by(order_column).limit(limit).offset(offset)
        rows = list((await self.db.execute(stmt)).scalars().all())
        return rows, total

    @staticmethod
    def _sort_column(sort_key: str | None):
        if sort_key in (None, "created_at"):
            return Record.created_at
        if sort_key == "updated_at":
            return Record.updated_at
        if sort_key == "status":
            return Record.status
        # Un champ personnalisé : tri sur sa représentation texte dans le JSONB.
        return Record.data[sort_key].astext

    async def check_unique_value(
        self,
        organization_id: uuid.UUID,
        model_definition_id: uuid.UUID,
        field_key: str,
        value: Any,
        exclude_record_id: uuid.UUID | None = None,
    ) -> bool:
        stmt = select(Record.id).where(
            Record.organization_id == organization_id,
            Record.model_definition_id == model_definition_id,
            Record.data[field_key].astext == str(value),
        )
        if exclude_record_id is not None:
            stmt = stmt.where(Record.id != exclude_record_id)
        result = await self.db.execute(stmt.limit(1))
        return result.scalar_one_or_none() is None
