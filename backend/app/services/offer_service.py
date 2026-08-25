import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.subscription import Currency, Offer
from app.schemas.subscription import CurrencyCreate, CurrencyUpdate, OfferCreate, OfferUpdate


class OfferService:
    """Cahier des charges §13 : l'éditeur pilote son catalogue sans intervention
    de développement. Ni `Offer` ni `Currency` ne sont cloisonnées par
    organisation — c'est un catalogue partagé par toute la plateforme.
    """

    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_offers(self, *, only_active: bool = False) -> list[Offer]:
        stmt = select(Offer)
        if only_active:
            stmt = stmt.where(Offer.is_active.is_(True))
        return list((await self.db.execute(stmt.order_by(Offer.duration_months))).scalars().all())

    async def create(self, payload: OfferCreate) -> Offer:
        offer = Offer(**payload.model_dump())
        self.db.add(offer)
        await self.db.flush()
        return offer

    async def update(self, offer_id: uuid.UUID, payload: OfferUpdate) -> Offer:
        offer = await self.db.get(Offer, offer_id)
        if offer is None:
            raise ValueError("Offre introuvable.")
        for key, value in payload.model_dump(exclude_unset=True).items():
            setattr(offer, key, value)
        await self.db.flush()
        return offer


class CurrencyService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_currencies(self, *, only_active: bool = False) -> list[Currency]:
        stmt = select(Currency)
        if only_active:
            stmt = stmt.where(Currency.is_active.is_(True))
        return list((await self.db.execute(stmt.order_by(Currency.code))).scalars().all())

    async def create(self, payload: CurrencyCreate) -> Currency:
        currency = Currency(code=payload.code.upper(), display_format=payload.display_format, is_active=payload.is_active)
        self.db.add(currency)
        await self.db.flush()
        return currency

    async def update(self, currency_id: uuid.UUID, payload: CurrencyUpdate) -> Currency:
        currency = await self.db.get(Currency, currency_id)
        if currency is None:
            raise ValueError("Devise introuvable.")
        for key, value in payload.model_dump(exclude_unset=True).items():
            setattr(currency, key, value)
        await self.db.flush()
        return currency
