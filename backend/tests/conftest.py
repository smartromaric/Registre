import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.core.database import get_db, get_sessionmaker
from app.main import app


@pytest_asyncio.fixture
async def db_session():
    """Une session par test, dans une transaction jamais commitée : chaque test
    repart d'une base propre sans avoir à la réinitialiser entre deux exécutions.
    """
    sessionmaker = get_sessionmaker()
    async with sessionmaker() as session:
        await session.begin()
        try:
            yield session
        finally:
            await session.rollback()


@pytest_asyncio.fixture
async def client(db_session):
    """Client HTTP branché sur la même transaction que `db_session`, pour pouvoir
    préparer des données et vérifier le comportement de l'API dans le même test.
    """

    async def _override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()
