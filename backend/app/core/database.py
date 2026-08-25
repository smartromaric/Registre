from collections.abc import AsyncIterator
from functools import lru_cache

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import get_settings


@lru_cache
def get_engine():
    settings = get_settings()
    return create_async_engine(settings.database_url, pool_pre_ping=True, future=True)


@lru_cache
def get_sessionmaker() -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(bind=get_engine(), expire_on_commit=False, class_=AsyncSession)


async def get_db() -> AsyncIterator[AsyncSession]:
    """Session par requête. Une transaction est ouverte pour toute la durée de la requête :
    c'est dans cette même transaction que `SET LOCAL app.current_org_id` (voir core/deps.py)
    prend effet pour les politiques RLS. Commit automatique en sortie si aucune exception,
    rollback sinon.
    """
    sessionmaker = get_sessionmaker()
    async with sessionmaker() as session:
        async with session.begin():
            yield session
