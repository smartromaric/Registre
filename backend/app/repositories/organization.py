import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.membership import Membership
from app.models.organization import Organization


class OrganizationRepository:
    """N'est PAS filtré par RLS (la table `organizations` n'a pas de organization_id :
    son id EST l'organisation). La visibilité est donc filtrée explicitement ici par
    appartenance (jointure sur memberships), pas par une politique de base.
    """

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get(self, organization_id: uuid.UUID) -> Organization | None:
        return await self.db.get(Organization, organization_id)

    async def create(self, organization: Organization) -> Organization:
        self.db.add(organization)
        await self.db.flush()
        return organization

    async def save(self, organization: Organization) -> Organization:
        await self.db.flush()
        return organization

    async def list_for_user(self, user_id: uuid.UUID) -> list[tuple[Organization, Membership]]:
        stmt = (
            select(Organization, Membership)
            .join(Membership, Membership.organization_id == Organization.id)
            .where(Membership.user_id == user_id, Membership.is_active.is_(True))
            .order_by(Organization.name)
        )
        result = await self.db.execute(stmt)
        return [(row.Organization, row.Membership) for row in result]
