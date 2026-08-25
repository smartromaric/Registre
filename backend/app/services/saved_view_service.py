import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.saved_view import SavedView
from app.models.user import User
from app.schemas.saved_view import SavedViewCreate, SavedViewUpdate


class SavedViewNotFoundError(Exception):
    pass


class SavedViewService:
    """Cahier des charges §9. Privées à leur créateur (voir SavedView) : aucune
    vérification de rôle au-delà de l'appartenance à l'organisation, qui vient
    déjà de get_org_context.
    """

    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_for_user(
        self, organization_id: uuid.UUID, owner: User, model_definition_id: uuid.UUID | None = None
    ) -> list[SavedView]:
        stmt = select(SavedView).where(SavedView.organization_id == organization_id, SavedView.owner_user_id == owner.id)
        if model_definition_id is not None:
            stmt = stmt.where(SavedView.model_definition_id == model_definition_id)
        return list((await self.db.execute(stmt.order_by(SavedView.name))).scalars().all())

    async def create(self, organization_id: uuid.UUID, owner: User, payload: SavedViewCreate) -> SavedView:
        view = SavedView(
            organization_id=organization_id,
            owner_user_id=owner.id,
            model_definition_id=payload.model_definition_id,
            name=payload.name,
            filters=payload.filters,
            columns=payload.columns,
            sort_key=payload.sort_key,
            sort_direction=payload.sort_direction,
        )
        self.db.add(view)
        await self.db.flush()
        return view

    async def update(self, organization_id: uuid.UUID, owner: User, view_id: uuid.UUID, payload: SavedViewUpdate) -> SavedView:
        view = await self._get_owned(organization_id, owner, view_id)
        for key, value in payload.model_dump(exclude_unset=True).items():
            setattr(view, key, value)
        await self.db.flush()
        return view

    async def delete(self, organization_id: uuid.UUID, owner: User, view_id: uuid.UUID) -> None:
        view = await self._get_owned(organization_id, owner, view_id)
        await self.db.delete(view)
        await self.db.flush()

    async def _get_owned(self, organization_id: uuid.UUID, owner: User, view_id: uuid.UUID) -> SavedView:
        view = await self.db.get(SavedView, view_id)
        if view is None or view.organization_id != organization_id or view.owner_user_id != owner.id:
            raise SavedViewNotFoundError("Vue introuvable.")
        return view
