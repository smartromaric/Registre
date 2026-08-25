"""Lot 4 : abonnements et espace éditeur (cahier des charges §12, §13)."""

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select, text

from app.core.security import create_access_token, hash_password
from app.models.membership import Membership, OrgRole
from app.models.organization import Organization
from app.models.subscription import Currency, Offer, Payment, PaymentMethod, Subscription, SubscriptionStatus
from app.models.user import User
from app.services.payment_service import PaymentService
from app.services.subscription_service import SubscriptionService


async def _bootstrap_org_with_trial(db_session):
    user = User(email=f"{uuid.uuid4()}@example.com", full_name="Awa", hashed_password=hash_password("x"), is_active=True)
    db_session.add(user)
    await db_session.flush()

    org = Organization(name="Transports Awa", country_code="CM", currency_code="XAF", timezone="Africa/Douala")
    db_session.add(org)
    await db_session.flush()

    await db_session.execute(text(f"SET LOCAL app.current_org_id = '{org.id}'"))
    await db_session.execute(text(f"SET LOCAL app.current_user_id = '{user.id}'"))
    db_session.add(Membership(organization_id=org.id, user_id=user.id, role=OrgRole.ADMIN, is_active=True))

    subscription = await SubscriptionService(db_session).create_trial_subscription(org)
    return org, user, subscription


async def test_lifecycle_scan_moves_expired_trial_to_read_only_then_suspended(db_session):
    org, _user, subscription = await _bootstrap_org_with_trial(db_session)

    await db_session.execute(text("SET LOCAL app.is_platform_admin = 'true'"))

    # Le contexte d'organisation ne doit plus être nécessaire une fois le
    # contournement éditeur positionné.
    subscription.current_period_end = datetime.now(UTC) - timedelta(days=1)
    await db_session.flush()

    service = SubscriptionService(db_session)
    transitions = await service.run_lifecycle_scan()
    assert any(t.organization_id == org.id and t.to_status == SubscriptionStatus.READ_ONLY for t in transitions)

    refreshed = await service.get_for_org(org.id)
    assert refreshed.status == SubscriptionStatus.READ_ONLY
    assert refreshed.read_only_since is not None

    # Rejouer le même jour ne doit rien changer de plus (même principe
    # d'idempotence par construction que le moteur d'alertes).
    second_pass = await service.run_lifecycle_scan()
    assert second_pass == []

    # Simule le délai de grâce écoulé (30 jours par défaut) pour vérifier le
    # passage en suspension.
    refreshed.read_only_since = datetime.now(UTC) - timedelta(days=31)
    await db_session.flush()
    third_pass = await service.run_lifecycle_scan()
    assert any(t.to_status == SubscriptionStatus.SUSPENDED for t in third_pass)


async def test_editor_bypass_does_not_leak_into_business_tables(db_session):
    """§4.3 : l'éditeur peut lire subscriptions/payments/invoices à travers toutes
    les organisations, mais PAS les memberships d'une organisation à laquelle il
    n'appartient pas au-delà du dénombrement (voir la politique dédiée), ni les
    tables métier (aucune politique ne les concerne).
    """
    org_a, user_a, _ = await _bootstrap_org_with_trial(db_session)

    # Contexte "éditeur" pur : ni organisation courante, ni appartenance.
    await db_session.execute(text(f"SET LOCAL app.current_user_id = '{uuid.uuid4()}'"))
    await db_session.execute(text("SET LOCAL app.current_org_id = ''"))
    await db_session.execute(text("SET LOCAL app.is_platform_admin = 'true'"))

    subscriptions = (await db_session.execute(select(Subscription))).scalars().all()
    assert any(s.organization_id == org_a.id for s in subscriptions), "l'éditeur voit les abonnements de toutes les orgs"

    # Mais les fiches, elles, n'ont aucune politique de contournement pour
    # l'éditeur : current_org_id vide -> rien de visible.
    from app.models.record import Record

    records = (await db_session.execute(select(Record))).scalars().all()
    assert records == []


async def test_declared_payment_validation_renews_subscription_and_issues_invoice(db_session):
    org, user, subscription = await _bootstrap_org_with_trial(db_session)

    offer = Offer(name="Semestrielle", duration_months=6, storage_quota_gb=10, user_quota=15, prices={"XAF": 25000})
    db_session.add(offer)
    await db_session.flush()

    period_before = subscription.current_period_end

    payment = await PaymentService(db_session).declare(
        organization_id=org.id, actor=user, offer_id=offer.id, amount=25000, reference="MOMO-12345"
    )
    assert payment.status.value == "declared"

    editor = User(email=f"{uuid.uuid4()}@example.com", full_name="Éditeur", is_platform_admin=True, is_active=True)
    db_session.add(editor)
    await db_session.flush()
    await db_session.execute(text("SET LOCAL app.is_platform_admin = 'true'"))

    validated, invoice = await PaymentService(db_session).validate(
        payment_id=payment.id, editor=editor, validated_amount=25000, currency_code="XAF",
        method=PaymentMethod.MOBILE_MONEY, validated_reference="MOMO-12345",
    )
    assert validated.status.value == "validated"
    assert invoice.amount == 25000
    assert invoice.number  # numérotée en séquence (§12.4)

    refreshed = await SubscriptionService(db_session).get_for_org(org.id)
    assert refreshed.status == SubscriptionStatus.ACTIVE
    assert refreshed.offer_id == offer.id
    # "jamais à partir de la date de validation" (§12.4) : la nouvelle période
    # part de l'ancienne échéance, pas d'aujourd'hui.
    assert refreshed.current_period_end > period_before

    # Un second paiement déjà traité ne peut pas être validé deux fois.
    from app.services.payment_service import PaymentAlreadyProcessedError

    raised = False
    try:
        await PaymentService(db_session).validate(
            payment_id=payment.id, editor=editor, validated_amount=25000, currency_code="XAF",
            method=PaymentMethod.MOBILE_MONEY, validated_reference=None,
        )
    except PaymentAlreadyProcessedError:
        raised = True
    assert raised


async def test_reject_payment_does_not_change_subscription(db_session):
    org, user, subscription = await _bootstrap_org_with_trial(db_session)
    offer = Offer(name="Mensuelle", duration_months=1, storage_quota_gb=2, user_quota=5, prices={"XAF": 5000})
    db_session.add(offer)
    await db_session.flush()

    payment = await PaymentService(db_session).declare(
        organization_id=org.id, actor=user, offer_id=offer.id, amount=5000, reference="REF-1"
    )
    editor = User(email=f"{uuid.uuid4()}@example.com", full_name="Éditeur", is_platform_admin=True, is_active=True)
    db_session.add(editor)
    await db_session.flush()
    await db_session.execute(text("SET LOCAL app.is_platform_admin = 'true'"))

    rejected = await PaymentService(db_session).reject(payment_id=payment.id, editor=editor, reason="Référence introuvable")
    assert rejected.status.value == "rejected"

    unchanged = await SubscriptionService(db_session).get_for_org(org.id)
    assert unchanged.current_period_end == subscription.current_period_end
    assert unchanged.status == SubscriptionStatus.TRIAL


async def test_payment_declared_status_is_visible_via_direct_query(db_session):
    """Sanity check indépendant du service, pour prouver que le paiement est bien
    en base (pas seulement dans l'objet Python retourné).
    """
    org, user, _ = await _bootstrap_org_with_trial(db_session)
    offer = Offer(name="Mensuelle", duration_months=1, storage_quota_gb=2, user_quota=5, prices={"XAF": 5000})
    db_session.add(offer)
    await db_session.flush()

    await PaymentService(db_session).declare(
        organization_id=org.id, actor=user, offer_id=offer.id, amount=5000, reference="REF-2"
    )

    stmt = select(Payment).where(Payment.organization_id == org.id)
    stored = (await db_session.execute(stmt)).scalars().all()
    assert len(stored) == 1
    assert stored[0].declared_reference == "REF-2"


async def test_editor_catalog_routes_include_inactive_offers_and_currencies(client, db_session):
    """`GET /catalog/*` (organisations) ne renvoie que les offres/devises actives
    (§12.1) — mais l'éditeur doit pouvoir retrouver une offre ou une devise déjà
    désactivée pour la réactiver, sinon aucun moyen de revenir en arrière.
    """
    editor = User(
        email=f"{uuid.uuid4()}@example.com", full_name="Éditeur", hashed_password=hash_password("x"),
        is_platform_admin=True, is_active=True,
    )
    db_session.add(editor)
    await db_session.flush()

    inactive_offer = Offer(
        name="Ancienne offre", duration_months=1, storage_quota_gb=1, user_quota=1, prices={"XAF": 1000},
        is_active=False,
    )
    inactive_currency = Currency(code="ZZZ", display_format="{amount} ZZZ", is_active=False)
    db_session.add_all([inactive_offer, inactive_currency])
    await db_session.flush()

    headers = {"Authorization": f"Bearer {create_access_token(editor.id)}"}

    offers = await client.get("/api/v1/editor/offers", headers=headers)
    assert offers.status_code == 200, offers.text
    assert inactive_offer.name in {o["name"] for o in offers.json()}

    currencies = await client.get("/api/v1/editor/currencies", headers=headers)
    assert currencies.status_code == 200, currencies.text
    assert "ZZZ" in {c["code"] for c in currencies.json()}


async def test_editor_catalog_routes_forbidden_for_non_platform_admin(client, db_session):
    user = User(
        email=f"{uuid.uuid4()}@example.com", full_name="Awa", hashed_password=hash_password("x"),
        is_platform_admin=False, is_active=True,
    )
    db_session.add(user)
    await db_session.flush()
    headers = {"Authorization": f"Bearer {create_access_token(user.id)}"}

    response = await client.get("/api/v1/editor/offers", headers=headers)
    assert response.status_code == 403
