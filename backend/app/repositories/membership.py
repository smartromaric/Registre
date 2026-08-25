import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.membership import Membership


class MembershipRepository:
    """Table protégée par RLS : toutes les méthodes supposent que
    `SET LOCAL app.current_org_id` a déjà été positionné sur la session pour la
    transaction en cours (voir core/deps.py::get_org_context), sauf
    `get_for_user_and_org` qui sert justement à établir ce contexte.
    """

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_for_user_and_org(self, user_id: uuid.UUID, organization_id: uuid.UUID) -> Membership | None:
        # Volontairement non filtré par RLS applicatif ici : c'est cette requête qui
        # détermine si l'utilisateur a le droit d'entrer dans le contexte de l'organisation.
        stmt = select(Membership).where(
            Membership.organization_id == organization_id,
            Membership.user_id == user_id,
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get(self, membership_id: uuid.UUID) -> Membership | None:
        return await self.db.get(Membership, membership_id)

    async def list_for_org(self, organization_id: uuid.UUID) -> list[Membership]:
        stmt = (
            select(Membership)
            .where(Membership.organization_id == organization_id)
            .order_by(Membership.created_at)
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def create(self, membership: Membership) -> Membership:
        self.db.add(membership)
        await self.db.flush()
        return membership

    async def save(self, membership: Membership) -> Membership:
        await self.db.flush()
        return membership
