"""Régressions pour les failles trouvées lors d'une chasse au bug dédiée
(2026-08-25, voir PRODUCT.md §10.13) et corrigées le jour même. Chaque test
correspond à un scénario concret confirmé avant correction — pas une
supposition théorique.
"""

import uuid

from sqlalchemy import text

from app.core.security import create_password_reset_token, hash_password
from app.dynamic_fields.types import FieldType
from app.models.membership import Membership, OrgRole
from app.models.model_definition import FieldDefinition, ModelDefinition, RecordNature
from app.models.organization import Organization
from app.models.record import Record
from app.models.stock import ArticleConfig, ArticleVariant, Depot
from app.models.user import User
from app.schemas.stock import ConsignmentActionCreate, MovementCreate
from app.services.record_service import RecordService
from app.services.stock_service import InsufficientStockError, StockService


async def _org_admin(db_session, name: str = "Awa"):
    user = User(email=f"{uuid.uuid4()}@example.com", full_name=name, hashed_password=hash_password("x"), is_active=True)
    db_session.add(user)
    await db_session.flush()
    org = Organization(name="Transports " + name, country_code="CM", currency_code="XAF", timezone="Africa/Douala")
    db_session.add(org)
    await db_session.flush()
    await db_session.execute(text(f"SET LOCAL app.current_org_id = '{org.id}'"))
    await db_session.execute(text(f"SET LOCAL app.current_user_id = '{user.id}'"))
    membership = Membership(organization_id=org.id, user_id=user.id, role=OrgRole.ADMIN, is_active=True)
    db_session.add(membership)
    await db_session.flush()
    return user, org, membership


# --- 1. Prise de compte via /auth/signup (findings #1) ------------------------------


async def test_signup_cannot_take_over_a_google_only_account(client, db_session):
    google_email = f"{uuid.uuid4()}@example.com"
    victim = User(email=google_email, full_name="Victime", google_sub="google-sub-123", is_active=True)
    db_session.add(victim)
    await db_session.flush()

    attack = await client.post(
        "/api/v1/auth/signup",
        json={"email": google_email, "password": "mot-de-passe-attaquant", "full_name": "Attaquant"},
    )
    assert attack.status_code == 409, "un compte Google existant ne doit jamais pouvoir etre reclame par un simple signup"


async def test_signup_cannot_take_over_a_pending_invitation(client, db_session):
    pending_email = f"{uuid.uuid4()}@example.com"
    pending = User(email=pending_email, full_name="Invite en attente", is_active=False)
    db_session.add(pending)
    await db_session.flush()

    attack = await client.post(
        "/api/v1/auth/signup",
        json={"email": pending_email, "password": "mot-de-passe-attaquant", "full_name": "Attaquant"},
    )
    assert attack.status_code == 409, "une invitation en attente ne se reclame que via son jeton signe, jamais par email seul"


# --- 2. Rejeu du jeton de reinitialisation de mot de passe (finding #2) -------------


async def test_password_reset_token_cannot_be_replayed(client, db_session):
    user = User(
        email=f"{uuid.uuid4()}@example.com", full_name="Awa", hashed_password=hash_password("ancien-mdp-1"), is_active=True
    )
    db_session.add(user)
    await db_session.flush()

    token = create_password_reset_token(user.id, user.hashed_password)
    first = await client.post("/api/v1/auth/password/reset", json={"token": token, "password": "nouveau-mdp-1"})
    assert first.status_code == 200, first.text

    replay = await client.post("/api/v1/auth/password/reset", json={"token": token, "password": "encore-un-autre-mdp"})
    assert replay.status_code == 400, "un jeton de reinitialisation deja utilise ne doit plus jamais fonctionner"

    login_with_second_password = await client.post(
        "/api/v1/auth/login", json={"email": user.email, "password": "encore-un-autre-mdp"}
    )
    assert login_with_second_password.status_code == 401, "le rejeu ne doit pas avoir change le mot de passe une seconde fois"


# --- 3. Stock negatif sans suivi de lots (finding #4) --------------------------------


async def _bootstrap_stock(db_session):
    user, org, membership = await _org_admin(db_session)
    model = ModelDefinition(
        organization_id=org.id, name_singular="Article", name_plural="Articles", nature=RecordNature.STOCK_ITEM
    )
    db_session.add(model)
    await db_session.flush()
    record = Record(organization_id=org.id, model_definition_id=model.id, data={})
    db_session.add(record)
    await db_session.flush()
    db_session.add(ArticleConfig(organization_id=org.id, record_id=record.id))
    variant = ArticleVariant(organization_id=org.id, record_id=record.id, is_default=True)
    db_session.add(variant)
    depot = Depot(organization_id=org.id, name="Depot central")
    db_session.add(depot)
    await db_session.flush()
    return user, org, membership, variant, depot


async def test_exit_without_lot_tracking_rejects_insufficient_stock(db_session):
    user, org, membership, variant, depot = await _bootstrap_stock(db_session)
    service = StockService(db_session)

    await service.record_entry(
        organization_id=org.id, actor=user, actor_membership=membership,
        payload=MovementCreate(variant_id=variant.id, depot_id=depot.id, quantity=5, reason="achat"),
    )

    try:
        await service.record_exit(
            organization_id=org.id, actor=user, actor_membership=membership,
            payload=MovementCreate(variant_id=variant.id, depot_id=depot.id, quantity=100, reason="sortie"),
        )
        raised = False
    except InsufficientStockError:
        raised = True
    assert raised, "une sortie sans suivi de lots ne doit jamais rendre la quantite negative"

    level = await service.repo.get_stock_level(variant.id, depot.id)
    assert level.quantity == 5, "le refus ne doit rien avoir modifie"


# --- 4. Consignation rejouable sans effet (finding #6) --------------------------------


async def test_consignment_deliver_full_is_idempotent(db_session):
    user, org, membership, variant, depot = await _bootstrap_stock(db_session)
    service = StockService(db_session)
    config = await service._require_config(variant)
    config.is_consigned = True
    await db_session.flush()

    await service.record_entry(
        organization_id=org.id, actor=user, actor_membership=membership,
        payload=MovementCreate(variant_id=variant.id, depot_id=depot.id, quantity=20, reason="achat"),
    )

    operation_id = uuid.uuid4()
    payload = ConsignmentActionCreate(
        client_operation_id=operation_id, variant_id=variant.id, depot_id=depot.id,
        action="deliver_full", quantity=10, deposit_amount=500,
    )
    first = await service.record_consignment_action(
        organization_id=org.id, actor=user, actor_membership=membership, payload=payload
    )
    second = await service.record_consignment_action(
        organization_id=org.id, actor=user, actor_membership=membership, payload=payload
    )

    assert first.in_circulation_count == 10
    assert second.in_circulation_count == 10, "une resoumission ne doit jamais doubler la quantite en circulation"


# --- 5. Droits sur les alertes (finding #7) -------------------------------------------


async def test_reader_cannot_acknowledge_someone_elses_alert(client, db_session):
    from app.models.alert import Alert, AlertSourceType

    user, org, membership = await _org_admin(db_session)
    reader = User(email=f"{uuid.uuid4()}@example.com", full_name="Lecteur", hashed_password=hash_password("x"), is_active=True)
    db_session.add(reader)
    await db_session.flush()
    db_session.add(Membership(organization_id=org.id, user_id=reader.id, role=OrgRole.READER, is_active=True))
    await db_session.flush()

    alert = Alert(
        organization_id=org.id, source_type=AlertSourceType.DEADLINE, source_id=uuid.uuid4(),
        palier="j-7", recipient_user_id=user.id,
    )
    db_session.add(alert)
    await db_session.flush()

    from app.core.security import create_access_token

    reader_token = create_access_token(reader.id)
    response = await client.post(
        f"/api/v1/organizations/{org.id}/alerts/{alert.id}/acknowledge",
        headers={"Authorization": f"Bearer {reader_token}"},
    )
    assert response.status_code == 403, "un READER ne doit pas pouvoir acquitter l'alerte de quelqu'un d'autre"


async def test_reader_can_acknowledge_their_own_alert(client, db_session):
    from app.core.security import create_access_token
    from app.models.alert import Alert, AlertSourceType

    _admin, org, _membership = await _org_admin(db_session)
    reader = User(email=f"{uuid.uuid4()}@example.com", full_name="Lecteur", hashed_password=hash_password("x"), is_active=True)
    db_session.add(reader)
    await db_session.flush()
    db_session.add(Membership(organization_id=org.id, user_id=reader.id, role=OrgRole.READER, is_active=True))
    await db_session.flush()

    alert = Alert(
        organization_id=org.id, source_type=AlertSourceType.DEADLINE, source_id=uuid.uuid4(),
        palier="j-7", recipient_user_id=reader.id,
    )
    db_session.add(alert)
    await db_session.flush()

    reader_token = create_access_token(reader.id)
    response = await client.post(
        f"/api/v1/organizations/{org.id}/alerts/{alert.id}/acknowledge",
        headers={"Authorization": f"Bearer {reader_token}"},
    )
    assert response.status_code == 200, (
        "une alerte adressee personnellement reste acquittable par son destinataire, quel que soit son role"
    )


# --- 6. Droits sur le televersement de documents (finding #8) ------------------------


async def test_reader_cannot_upload_a_document(client, db_session):
    from app.core.security import create_access_token

    _admin, org, _membership = await _org_admin(db_session)
    model = ModelDefinition(organization_id=org.id, name_singular="Vehicule", name_plural="Vehicules", nature=RecordNature.ASSET)
    db_session.add(model)
    await db_session.flush()
    record = Record(organization_id=org.id, model_definition_id=model.id, data={})
    db_session.add(record)
    await db_session.flush()

    reader = User(email=f"{uuid.uuid4()}@example.com", full_name="Lecteur", hashed_password=hash_password("x"), is_active=True)
    db_session.add(reader)
    await db_session.flush()
    db_session.add(Membership(organization_id=org.id, user_id=reader.id, role=OrgRole.READER, is_active=True))
    await db_session.flush()

    reader_token = create_access_token(reader.id)
    response = await client.post(
        f"/api/v1/organizations/{org.id}/records/{record.id}/documents",
        headers={"Authorization": f"Bearer {reader_token}"},
        files={"file": ("photo.jpg", b"donnee-factice", "image/jpeg")},
    )
    assert response.status_code == 403, "un READER ne doit pas pouvoir televerser de document"


# --- 7. Reutilisation d'un id client pour deux fiches differentes (finding #9) -------


async def test_reusing_a_client_id_for_different_data_fails_loudly(db_session):
    user, org, membership = await _org_admin(db_session)
    model = ModelDefinition(organization_id=org.id, name_singular="Vehicule", name_plural="Vehicules", nature=RecordNature.ASSET)
    db_session.add(model)
    await db_session.flush()
    db_session.add(
        FieldDefinition(
            organization_id=org.id, model_definition_id=model.id, key="immatriculation", label="Immatriculation",
            field_type=FieldType.TEXT_SHORT, is_required=False,
        )
    )
    await db_session.flush()
    await db_session.refresh(model, attribute_names=["field_definitions"])

    service = RecordService(db_session)
    client_id = uuid.uuid4()
    await service.create(
        organization_id=org.id, actor=user, actor_membership=membership, model=model,
        data={"immatriculation": "CE 111 AA"}, status=None, site=None, assigned_person_record_id=None,
        record_id=client_id,
    )

    from app.dynamic_fields.validation import FieldValidationError

    raised = False
    try:
        await service.create(
            organization_id=org.id, actor=user, actor_membership=membership, model=model,
            data={"immatriculation": "CE 999 ZZ"}, status=None, site=None, assigned_person_record_id=None,
            record_id=client_id,
        )
    except FieldValidationError:
        raised = True
    assert raised, (
        "reutiliser un id pour des donnees differentes doit echouer bruyamment, pas perdre la seconde version en silence"
    )
