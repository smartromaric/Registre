from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.schemas.subscription import CurrencyOut, OfferOut
from app.services.offer_service import CurrencyService, OfferService

router = APIRouter(prefix="/catalog", tags=["catalog"])


@router.get("/offers", response_model=list[OfferOut])
async def list_offers(_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> list[OfferOut]:
    """Cahier des charges §12.1 : le catalogue proposé aux organisations pour
    souscrire ou changer d'offre — seules les offres actives sont retenues.
    """
    offers = await OfferService(db).list_offers(only_active=True)
    return [OfferOut.model_validate(o) for o in offers]


@router.get("/currencies", response_model=list[CurrencyOut])
async def list_currencies(_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> list[CurrencyOut]:
    currencies = await CurrencyService(db).list_currencies(only_active=True)
    return [CurrencyOut.model_validate(c) for c in currencies]
