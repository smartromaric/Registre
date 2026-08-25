import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import require_platform_admin
from app.models.user import User
from app.schemas.subscription import (
    CurrencyCreate,
    CurrencyOut,
    CurrencyUpdate,
    OfferCreate,
    OfferOut,
    OfferUpdate,
    OrganizationSummaryOut,
    PaymentOut,
    PaymentRecordManual,
    PaymentReject,
    PaymentValidate,
    SubscriptionAdminAdjust,
    SubscriptionOut,
)
from app.services.audit_service import AuditService
from app.services.offer_service import CurrencyService, OfferService
from app.services.payment_service import PaymentAlreadyProcessedError, PaymentNotFoundError, PaymentService
from app.services.subscription_service import SubscriptionNotFoundError, SubscriptionService

router = APIRouter(prefix="/editor", tags=["editor"])


def _service_error(exc: Exception) -> HTTPException:
    if isinstance(exc, (PaymentNotFoundError, SubscriptionNotFoundError)):
        return HTTPException(status.HTTP_404_NOT_FOUND, str(exc))
    if isinstance(exc, PaymentAlreadyProcessedError):
        return HTTPException(status.HTTP_409_CONFLICT, str(exc))
    return HTTPException(status.HTTP_400_BAD_REQUEST, str(exc))


# --- offres et devises (§13) -------------------------------------------------------


@router.get("/offers", response_model=list[OfferOut])
async def list_offers(_admin: User = Depends(require_platform_admin), db: AsyncSession = Depends(get_db)) -> list[OfferOut]:
    """Toutes les offres, actives ou non — contrairement à `GET /catalog/offers`
    (réservé aux organisations, actives uniquement), l'éditeur doit pouvoir
    retrouver une offre désactivée pour la réactiver.
    """
    offers = await OfferService(db).list_offers(only_active=False)
    return [OfferOut.model_validate(o) for o in offers]


@router.get("/currencies", response_model=list[CurrencyOut])
async def list_currencies(
    _admin: User = Depends(require_platform_admin), db: AsyncSession = Depends(get_db)
) -> list[CurrencyOut]:
    currencies = await CurrencyService(db).list_currencies(only_active=False)
    return [CurrencyOut.model_validate(c) for c in currencies]


@router.post("/offers", response_model=OfferOut, status_code=status.HTTP_201_CREATED)
async def create_offer(
    payload: OfferCreate, _admin: User = Depends(require_platform_admin), db: AsyncSession = Depends(get_db)
) -> OfferOut:
    offer = await OfferService(db).create(payload)
    return OfferOut.model_validate(offer)


@router.patch("/offers/{offer_id}", response_model=OfferOut)
async def update_offer(
    offer_id: uuid.UUID, payload: OfferUpdate, _admin: User = Depends(require_platform_admin), db: AsyncSession = Depends(get_db)
) -> OfferOut:
    try:
        offer = await OfferService(db).update(offer_id, payload)
    except ValueError as exc:
        raise _service_error(exc) from exc
    return OfferOut.model_validate(offer)


@router.post("/currencies", response_model=CurrencyOut, status_code=status.HTTP_201_CREATED)
async def create_currency(
    payload: CurrencyCreate, _admin: User = Depends(require_platform_admin), db: AsyncSession = Depends(get_db)
) -> CurrencyOut:
    currency = await CurrencyService(db).create(payload)
    return CurrencyOut.model_validate(currency)


@router.patch("/currencies/{currency_id}", response_model=CurrencyOut)
async def update_currency(
    currency_id: uuid.UUID,
    payload: CurrencyUpdate,
    _admin: User = Depends(require_platform_admin),
    db: AsyncSession = Depends(get_db),
) -> CurrencyOut:
    try:
        currency = await CurrencyService(db).update(currency_id, payload)
    except ValueError as exc:
        raise _service_error(exc) from exc
    return CurrencyOut.model_validate(currency)


# --- organisations et abonnements (§13) --------------------------------------------


@router.get("/organizations", response_model=list[OrganizationSummaryOut])
async def list_organizations(
    _admin: User = Depends(require_platform_admin), db: AsyncSession = Depends(get_db)
) -> list[OrganizationSummaryOut]:
    summaries = await SubscriptionService(db).list_organization_summaries()
    return [
        OrganizationSummaryOut(
            organization_id=org.id, name=org.name, country_code=org.country_code, created_at=org.created_at,
            subscription_status=subscription.status, offer_name=None,
            current_period_end=subscription.current_period_end, member_count=member_count,
        )
        for org, subscription, member_count in summaries
    ]


@router.post("/organizations/{organization_id}/subscription/adjust", response_model=SubscriptionOut)
async def adjust_subscription(
    organization_id: uuid.UUID, payload: SubscriptionAdminAdjust,
    admin: User = Depends(require_platform_admin), db: AsyncSession = Depends(get_db),
) -> SubscriptionOut:
    try:
        subscription = await SubscriptionService(db).admin_adjust(
            organization_id, new_status=payload.new_status, new_period_end=payload.new_period_end
        )
    except SubscriptionNotFoundError as exc:
        raise _service_error(exc) from exc

    await db.execute(text(f"SET LOCAL app.current_org_id = '{organization_id}'"))
    await AuditService(db).record(
        organization_id=organization_id, actor_user_id=admin.id, action="subscription.admin_adjust",
        entity_type="subscription", entity_id=subscription.id,
        new_value={"new_status": payload.new_status.value if payload.new_status else None, "reason": payload.reason},
    )
    return SubscriptionOut.model_validate(subscription)


@router.post("/subscriptions/run-lifecycle-scan")
async def run_lifecycle_scan(_admin: User = Depends(require_platform_admin), db: AsyncSession = Depends(get_db)) -> dict:
    transitions = await SubscriptionService(db).run_lifecycle_scan()
    return {
        "transitions": [
            {"organization_id": str(t.organization_id), "from": t.from_status.value, "to": t.to_status.value}
            for t in transitions
        ]
    }


# --- règlements (§12.4, §13) --------------------------------------------------------


@router.get("/payments", response_model=list[PaymentOut])
async def list_declared_payments(
    _admin: User = Depends(require_platform_admin), db: AsyncSession = Depends(get_db)
) -> list[PaymentOut]:
    payments = await PaymentService(db).list_declared()
    return [PaymentOut.model_validate(p) for p in payments]


@router.post("/payments/{payment_id}/validate", response_model=PaymentOut)
async def validate_payment(
    payment_id: uuid.UUID,
    payload: PaymentValidate,
    admin: User = Depends(require_platform_admin),
    db: AsyncSession = Depends(get_db),
) -> PaymentOut:
    try:
        payment, _invoice = await PaymentService(db).validate(
            payment_id=payment_id, editor=admin, validated_amount=payload.validated_amount,
            currency_code=payload.currency_code, method=payload.method, validated_reference=payload.validated_reference,
        )
    except (PaymentNotFoundError, PaymentAlreadyProcessedError) as exc:
        raise _service_error(exc) from exc
    return PaymentOut.model_validate(payment)


@router.post("/payments/{payment_id}/reject", response_model=PaymentOut)
async def reject_payment(
    payment_id: uuid.UUID,
    payload: PaymentReject,
    admin: User = Depends(require_platform_admin),
    db: AsyncSession = Depends(get_db),
) -> PaymentOut:
    try:
        payment = await PaymentService(db).reject(payment_id=payment_id, editor=admin, reason=payload.reason)
    except (PaymentNotFoundError, PaymentAlreadyProcessedError) as exc:
        raise _service_error(exc) from exc
    return PaymentOut.model_validate(payment)


@router.post("/payments/manual", response_model=PaymentOut, status_code=status.HTTP_201_CREATED)
async def record_manual_payment(
    payload: PaymentRecordManual, admin: User = Depends(require_platform_admin), db: AsyncSession = Depends(get_db)
) -> PaymentOut:
    payment, _invoice = await PaymentService(db).record_manual(
        organization_id=payload.organization_id, editor=admin, offer_id=payload.offer_id,
        validated_amount=payload.validated_amount, currency_code=payload.currency_code,
        method=payload.method, validated_reference=payload.validated_reference,
    )
    return PaymentOut.model_validate(payment)
