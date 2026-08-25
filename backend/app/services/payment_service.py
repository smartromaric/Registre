import uuid
from datetime import UTC, datetime

from dateutil.relativedelta import relativedelta
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.subscription import Invoice, Offer, Payment, PaymentMethod, PaymentStatus, SubscriptionStatus
from app.models.user import User
from app.services.audit_service import AuditService
from app.services.subscription_service import SubscriptionService


class PaymentNotFoundError(Exception):
    pass


class PaymentAlreadyProcessedError(Exception):
    pass


class PaymentService:
    """Cahier des charges §12.4. `SET LOCAL app.current_org_id` est repositionné
    explicitement ici sur l'organisation ciblée avant chaque écriture — c'est ce
    qui permet à l'éditeur (aucun contexte d'organisation "courant" pour lui) de
    créer des lignes rattachées à l'organisation du client, sans élargir l'accès
    de l'éditeur au-delà de ce geste précis (contrairement à un contournement RLS
    général qui s'appliquerait à toutes les tables).
    """

    def __init__(self, db: AsyncSession):
        self.db = db
        self.audit = AuditService(db)

    async def declare(
        self, *, organization_id: uuid.UUID, actor: User, offer_id: uuid.UUID, amount: float, reference: str
    ) -> Payment:
        await self._set_org_context(organization_id)
        payment = Payment(
            organization_id=organization_id,
            offer_id=offer_id,
            status=PaymentStatus.DECLARED,
            declared_amount=amount,
            declared_reference=reference,
            declared_by_user_id=actor.id,
        )
        self.db.add(payment)
        await self.db.flush()
        await self.audit.record(
            organization_id=organization_id, actor_user_id=actor.id, action="payment.declare",
            entity_type="payment", entity_id=payment.id, new_value={"amount": amount, "reference": reference},
        )
        return payment

    async def list_declared(self) -> list[Payment]:
        """File des règlements déclarés, toutes organisations confondues (§13) —
        suppose le contexte éditeur (require_platform_admin).
        """
        stmt = select(Payment).where(Payment.status == PaymentStatus.DECLARED).order_by(Payment.created_at)
        return list((await self.db.execute(stmt)).scalars().all())

    async def validate(
        self, *, payment_id: uuid.UUID, editor: User, validated_amount: float, currency_code: str,
        method: PaymentMethod, validated_reference: str | None,
    ) -> tuple[Payment, Invoice]:
        payment = await self._require_payment(payment_id)
        if payment.status != PaymentStatus.DECLARED:
            raise PaymentAlreadyProcessedError("Ce paiement a déjà été traité.")

        await self._set_org_context(payment.organization_id)
        now = datetime.now(UTC)
        payment.status = PaymentStatus.VALIDATED
        payment.validated_amount = validated_amount
        payment.currency_code = currency_code.upper()
        payment.method = method
        payment.validated_reference = validated_reference
        payment.validated_by_user_id = editor.id
        payment.validated_at = now
        await self.db.flush()

        invoice = await self._renew_subscription_and_invoice(payment, now)
        await self.audit.record(
            organization_id=payment.organization_id, actor_user_id=editor.id, action="payment.validate",
            entity_type="payment", entity_id=payment.id, new_value={"amount": validated_amount, "currency": currency_code},
        )
        return payment, invoice

    async def reject(self, *, payment_id: uuid.UUID, editor: User, reason: str) -> Payment:
        payment = await self._require_payment(payment_id)
        if payment.status != PaymentStatus.DECLARED:
            raise PaymentAlreadyProcessedError("Ce paiement a déjà été traité.")

        await self._set_org_context(payment.organization_id)
        payment.status = PaymentStatus.REJECTED
        payment.rejection_reason = reason
        payment.validated_by_user_id = editor.id
        payment.validated_at = datetime.now(UTC)
        await self.db.flush()
        await self.audit.record(
            organization_id=payment.organization_id, actor_user_id=editor.id, action="payment.reject",
            entity_type="payment", entity_id=payment.id, new_value={"reason": reason},
        )
        return payment

    async def record_manual(
        self, *, organization_id: uuid.UUID, editor: User, offer_id: uuid.UUID, validated_amount: float,
        currency_code: str, method: PaymentMethod, validated_reference: str | None,
    ) -> tuple[Payment, Invoice]:
        """§12.4 : « L'éditeur peut aussi enregistrer un paiement sans demande
        préalable, pour un client qui a réglé par un autre canal. »
        """
        await self._set_org_context(organization_id)
        now = datetime.now(UTC)
        payment = Payment(
            organization_id=organization_id, offer_id=offer_id, status=PaymentStatus.VALIDATED,
            validated_amount=validated_amount, currency_code=currency_code.upper(), method=method,
            validated_reference=validated_reference, validated_by_user_id=editor.id, validated_at=now,
        )
        self.db.add(payment)
        await self.db.flush()

        invoice = await self._renew_subscription_and_invoice(payment, now)
        await self.audit.record(
            organization_id=organization_id, actor_user_id=editor.id, action="payment.record_manual",
            entity_type="payment", entity_id=payment.id, new_value={"amount": validated_amount, "currency": currency_code},
        )
        return payment, invoice

    # --- internes -----------------------------------------------------------------

    async def _renew_subscription_and_invoice(self, payment: Payment, now: datetime) -> Invoice:
        offer = await self.db.get(Offer, payment.offer_id)
        if offer is None:
            raise ValueError("Offre introuvable.")

        subscription_service = SubscriptionService(self.db)
        subscription = await subscription_service.get_for_org(payment.organization_id)

        # §12.4 : jamais à partir de la date de validation — un paiement anticipé
        # ne fait perdre aucun jour. Pour un paiement tardif (période déjà
        # expirée), la nouvelle période part d'aujourd'hui plutôt que de rester
        # bloquée dans le passé : point non explicité par le cahier des charges,
        # tranché ici par bon sens — à confirmer avec le client (voir PRODUCT.md §4).
        base = max(subscription.current_period_end, now)
        period_end = base + relativedelta(months=offer.duration_months)

        subscription.offer_id = offer.id
        subscription.status = SubscriptionStatus.ACTIVE
        subscription.current_period_end = period_end
        subscription.read_only_since = None
        subscription.suspended_since = None
        await self.db.flush()

        number = await self._next_invoice_number()
        invoice = Invoice(
            organization_id=payment.organization_id, payment_id=payment.id, number=number,
            amount=payment.validated_amount, currency_code=payment.currency_code,
            period_start=base.date(), period_end=period_end.date(),
        )
        self.db.add(invoice)
        await self.db.flush()
        return invoice

    async def _next_invoice_number(self) -> str:
        result = await self.db.execute(text("SELECT nextval('invoice_number_seq')"))
        sequence_value = result.scalar_one()
        year = datetime.now(UTC).year
        return f"{year}-{sequence_value:06d}"

    async def _require_payment(self, payment_id: uuid.UUID) -> Payment:
        payment = await self.db.get(Payment, payment_id)
        if payment is None:
            raise PaymentNotFoundError("Paiement introuvable.")
        return payment

    async def _set_org_context(self, organization_id: uuid.UUID) -> None:
        await self.db.execute(text(f"SET LOCAL app.current_org_id = '{organization_id}'"))
