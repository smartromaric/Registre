import uuid
from dataclasses import dataclass

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.dynamic_fields.types import FieldType
from app.models.model_definition import ModelDefinition
from app.models.record import Record

_TEXT_TYPES = (FieldType.TEXT_SHORT, FieldType.TEXT_LONG, FieldType.PHONE, FieldType.CODE)


@dataclass
class SearchHit:
    record_id: uuid.UUID
    model_definition_id: uuid.UUID
    model_name: str
    title: str


async def global_search(
    db: AsyncSession, organization_id: uuid.UUID, query: str, *, model_id: uuid.UUID | None = None, limit: int = 20
) -> list[SearchHit]:
    """Cahier des charges §9 : « une seule barre qui cherche dans toutes les
    fiches... sur les champs déclarés indexables. » Recherche par sous-chaîne sur
    les champs texte marqués filtrables, plus le champ-titre de chaque modèle.
    """
    query = query.strip()
    if not query:
        return []

    models_stmt = (
        select(ModelDefinition)
        .options(selectinload(ModelDefinition.field_definitions))
        .where(ModelDefinition.organization_id == organization_id, ModelDefinition.is_archived.is_(False))
    )
    if model_id is not None:
        models_stmt = models_stmt.where(ModelDefinition.id == model_id)
    models = (await db.execute(models_stmt)).scalars().unique().all()

    hits: list[SearchHit] = []
    for model in models:
        searchable_keys = {f.key for f in model.field_definitions if f.is_filterable and f.field_type in _TEXT_TYPES}
        if model.title_field_key:
            searchable_keys.add(model.title_field_key)
        if not searchable_keys:
            continue

        conditions = [Record.data[key].astext.ilike(f"%{query}%") for key in searchable_keys]
        stmt = (
            select(Record)
            .where(
                Record.organization_id == organization_id,
                Record.model_definition_id == model.id,
                Record.is_archived.is_(False),
                or_(*conditions),
            )
            .limit(limit)
        )
        for record in (await db.execute(stmt)).scalars().all():
            title_value = record.data.get(model.title_field_key) if model.title_field_key else None
            hits.append(
                SearchHit(
                    record_id=record.id,
                    model_definition_id=model.id,
                    model_name=model.name_singular,
                    title=str(title_value) if title_value else "Fiche sans titre",
                )
            )

    return hits[:limit]
