import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.membership import Membership
from app.models.organization import Organization
from app.models.subscription import Subscription, SubscriptionStatus


class SubscriptionNotFoundError(Exception):
    pass


@dataclass
class LifecycleTransition:
    organization_id: uuid.UUID
    from_status: SubscriptionStatus
    to_status: SubscriptionStatus


class SubscriptionService:
    """Cahier des charges §12.3. Le cycle de vie est entièrement dérivé de dates
    (`current_period_end`, `read_only_since`, `suspended_since`) : le rejouer ne
    fait jamais régresser un statut déjà atteint — même principe d'idempotence
    par construction que le moteur d'alertes (§8.2).
    """

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_trial_subscription(self, organization: Organization) -> Subscription:
        subscription = Subscription(
            organization_id=organization.id,
            offer_id=None,
            status=SubscriptionStatus.TRIAL,
            current_period_end=organization.trial_ends_at,
        )
        self.db.add(subscription)
        await self.db.flush()
        return subscription

    async def get_for_org(self, organization_id: uuid.UUID) -> Subscription:
        stmt = select(Subscription).where(Subscription.organization_id == organization_id)
        subscription = (await self.db.execute(stmt)).scalar_one_or_none()
        if subscription is None:
            raise SubscriptionNotFoundError("Aucun abonnement pour cette organisation.")
        return subscription

    async def can_write(self, organization_id: uuid.UUID) -> bool:
        """§12.3 : en lecture seule, suspendu ou archivé, plus aucune saisie."""
        subscription = await self.get_for_org(organization_id)
        return subscription.status in (SubscriptionStatus.TRIAL, SubscriptionStatus.ACTIVE)

    async def admin_adjust(
        self, organization_id: uuid.UUID, *, new_status: SubscriptionStatus | None, new_period_end: datetime | None
    ) -> Subscription:
        """§13 : prolonger, suspendre ou réactiver à la main. Le motif obligatoire
        est tracé par l'appelant (routeur) dans le journal d'audit, pas ici.
        """
        subscription = await self.get_for_org(organization_id)
        if new_status is not None:
            subscription.status = new_status
            if new_status != SubscriptionStatus.READ_ONLY:
                subscription.read_only_since = None
            if new_status != SubscriptionStatus.SUSPENDED:
                subscription.suspended_since = None
        if new_period_end is not None:
            subscription.current_period_end = new_period_end
        await self.db.flush()
        return subscription

    async def run_lifecycle_scan(self, today: datetime | None = None) -> list[LifecycleTransition]:
        """Balaie TOUTES les organisations (contexte éditeur — voir
        require_platform_admin) et fait avancer chaque abonnement selon les
        durées configurées par l'éditeur (§12.3, valeurs par défaut : 30 jours de
        lecture seule, 12 mois de conservation avant archivage).
        """
        settings = get_settings()
        now = today or datetime.now(UTC)
        subscriptions = list((await self.db.execute(select(Subscription))).scalars().all())

        transitions: list[LifecycleTransition] = []
        for subscription in subscriptions:
            from_status = subscription.status

            if subscription.status in (SubscriptionStatus.TRIAL, SubscriptionStatus.ACTIVE):
                if now > subscription.current_period_end:
                    subscription.status = SubscriptionStatus.READ_ONLY
                    subscription.read_only_since = now

            elif subscription.status == SubscriptionStatus.READ_ONLY:
                deadline = (subscription.read_only_since or now) + timedelta(days=settings.read_only_grace_days)
                if now > deadline:
                    subscription.status = SubscriptionStatus.SUSPENDED
                    subscription.suspended_since = now

            elif subscription.status == SubscriptionStatus.SUSPENDED:
                deadline = (subscription.suspended_since or now) + timedelta(days=settings.retention_months * 30)
                if now > deadline:
                    subscription.status = SubscriptionStatus.ARCHIVED

            if subscription.status != from_status:
                transitions.append(
                    LifecycleTransition(
                        organization_id=subscription.organization_id, from_status=from_status, to_status=subscription.status
                    )
                )

        await self.db.flush()
        return transitions

    async def list_organization_summaries(self) -> list[tuple[Organization, Subscription, int]]:
        orgs = (await self.db.execute(select(Organization))).scalars().all()
        results = []
        for org in orgs:
            try:
                subscription = await self.get_for_org(org.id)
            except SubscriptionNotFoundError:
                continue
            member_count_stmt = select(Membership).where(
                Membership.organization_id == org.id, Membership.is_active.is_(True)
            )
            member_count = len((await self.db.execute(member_count_stmt)).scalars().all())
            results.append((org, subscription, member_count))
        return results
