import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User


class UserRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get(self, user_id: uuid.UUID) -> User | None:
        return await self.db.get(User, user_id)

    async def get_for_update(self, user_id: uuid.UUID) -> User | None:
        """Verrou de ligne (`SELECT ... FOR UPDATE`) — nécessaire partout où une
        lecture-modification-écriture doit être exclusive (ex. consommation d'un
        code de secours 2FA, voir TwoFactorService.verify_challenge : sans ce
        verrou, deux vérifications concurrentes avec le même code de secours
        peuvent toutes les deux le lire "encore présent" et réussir)."""
        return await self.db.get(User, user_id, with_for_update=True)

    async def get_by_email(self, email: str) -> User | None:
        result = await self.db.execute(select(User).where(User.email == email))
        return result.scalar_one_or_none()

    async def get_by_google_sub(self, google_sub: str) -> User | None:
        result = await self.db.execute(select(User).where(User.google_sub == google_sub))
        return result.scalar_one_or_none()

    async def create(self, user: User) -> User:
        self.db.add(user)
        await self.db.flush()
        return user

    async def save(self, user: User) -> User:
        await self.db.flush()
        return user
