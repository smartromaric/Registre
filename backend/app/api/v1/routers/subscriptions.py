
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user, require_role
from app.core.permissions import Action, role_can
from app.models.membership import Membership, OrgRole
from app.models.subscription import Invoice, Payment
from app.models.user import User
from app.schemas.subscription import InvoiceOut, PaymentDeclare, PaymentOut, SubscriptionOut
from app.services.payment_service import PaymentService
from app.services.subscription_service import SubscriptionNotFoundError, SubscriptionService

router = APIRouter(prefix="/organizations/{organization_id}", tags=["subscriptions"])


@router.get("/subscription", response_model=SubscriptionOut)
async def get_my_subscription(
    membership: Membership = Depends(require_role(*OrgRole)), db: AsyncSession = Depends(get_db)
) -> SubscriptionOut:
    try:
        subscription = await SubscriptionService(db).get_for_org(membership.organization_id)
    except SubscriptionNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc
    return SubscriptionOut.model_validate(subscription)


@router.post("/payments", response_model=PaymentOut, status_code=status.HTTP_201_CREATED)
async def declare_payment(
    payload: PaymentDeclare,
    user: User = Depends(get_current_user),
    membership: Membership = Depends(require_role(OrgRole.ADMIN)),
    db: AsyncSession = Depends(get_db),
) -> PaymentOut:
    if not role_can(membership.role, Action.MANAGE_SUBSCRIPTION):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Seul un administrateur peut déclarer un paiement.")
    payment = await PaymentService(db).declare(
        organization_id=membership.organization_id, actor=user,
        offer_id=payload.offer_id, amount=payload.declared_amount, reference=payload.declared_reference,
    )
    return PaymentOut.model_validate(payment)


@router.get("/payments", response_model=list[PaymentOut])
async def list_my_payments(
    membership: Membership = Depends(require_role(OrgRole.ADMIN)), db: AsyncSession = Depends(get_db)
) -> list[PaymentOut]:
    stmt = select(Payment).where(Payment.organization_id == membership.organization_id).order_by(Payment.created_at.desc())
    payments = (await db.execute(stmt)).scalars().all()
    return [PaymentOut.model_validate(p) for p in payments]


@router.get("/invoices", response_model=list[InvoiceOut])
async def list_my_invoices(
    membership: Membership = Depends(require_role(OrgRole.ADMIN)), db: AsyncSession = Depends(get_db)
) -> list[InvoiceOut]:
    stmt = select(Invoice).where(Invoice.organization_id == membership.organization_id).order_by(Invoice.issued_at.desc())
    invoices = (await db.execute(stmt)).scalars().all()
    return [InvoiceOut.model_validate(i) for i in invoices]
