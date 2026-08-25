"""Cahier des charges §11.4 : « les identifiants sont générés côté client »,
posé dès les fondations pour que le mode hors-ligne (lot 5) n'ait jamais à
réécrire ce socle. Ces tests prouvent la propriété qui en dépend directement :
rejouer une création avec le même identifiant après une synchronisation
interrompue ne produit jamais de doublon.
"""

import uuid

from sqlalchemy import select, text

from app.core.security import hash_password
from app.dynamic_fields.types import FieldType
from app.models.membership import Membership, OrgRole
from app.models.model_definition import FieldDefinition, ModelDefinition, RecordNature
from app.models.organization import Organization
from app.models.record import Record
from app.models.stock import ArticleConfig, ArticleVariant, Depot, StockLevel, StockMovement
from app.models.user import User
from app.schemas.stock import MovementCreate
from app.services.record_service import RecordService
from app.services.stock_service import StockService


async def _bootstrap(db_session):
    user = User(email=f"{uuid.uuid4()}@example.com", full_name="Marc", hashed_password=hash_password("x"), is_active=True)
    db_session.add(user)
    await db_session.flush()

    org = Organization(name="Transports Awa", country_code="CM", currency_code="XAF", timezone="Africa/Douala")
    db_session.add(org)
    await db_session.flush()

    await db_session.execute(text(f"SET LOCAL app.current_org_id = '{org.id}'"))
    await db_session.execute(text(f"SET LOCAL app.current_user_id = '{user.id}'"))
    membership = Membership(organization_id=org.id, user_id=user.id, role=OrgRole.ADMIN, is_active=True)
    db_session.add(membership)
    await db_session.flush()

    model = ModelDefinition(
        organization_id=org.id, name_singular="Véhicule", name_plural="Véhicules", nature=RecordNature.ASSET
    )
    db_session.add(model)
    await db_session.flush()
    db_session.add(
        FieldDefinition(
            organization_id=org.id, model_definition_id=model.id, key="immatriculation", label="Immatriculation",
            field_type=FieldType.TEXT_SHORT, is_required=True,
        )
    )
    await db_session.flush()
    await db_session.refresh(model, attribute_names=["field_definitions"])
    return org, user, membership, model


async def test_record_creation_with_client_id_is_idempotent(db_session):
    org, user, membership, model = await _bootstrap(db_session)
    client_id = uuid.uuid4()

    service = RecordService(db_session)
    first = await service.create(
        organization_id=org.id, actor=user, actor_membership=membership, model=model,
        data={"immatriculation": "CE 456 AB"}, status=None, site=None, assigned_person_record_id=None,
        record_id=client_id,
    )
    assert first.id == client_id

    # Synchronisation "rejouée" : même identifiant, même appel.
    second = await service.create(
        organization_id=org.id, actor=user, actor_membership=membership, model=model,
        data={"immatriculation": "CE 456 AB"}, status=None, site=None, assigned_person_record_id=None,
        record_id=client_id,
    )
    assert second.id == first.id

    stored = (await db_session.execute(select(Record).where(Record.organization_id == org.id))).scalars().all()
    assert len(stored) == 1, "une seule fiche, pas un doublon"


async def test_stock_entry_with_client_operation_id_is_idempotent(db_session):
    org, user, membership, _model = await _bootstrap(db_session)

    gas_model = ModelDefinition(
        organization_id=org.id, name_singular="Article", name_plural="Articles", nature=RecordNature.STOCK_ITEM
    )
    db_session.add(gas_model)
    await db_session.flush()
    record = Record(organization_id=org.id, model_definition_id=gas_model.id, data={})
    db_session.add(record)
    await db_session.flush()
    db_session.add(ArticleConfig(organization_id=org.id, record_id=record.id))
    variant = ArticleVariant(organization_id=org.id, record_id=record.id, is_default=True)
    db_session.add(variant)
    depot = Depot(organization_id=org.id, name="Dépôt Bonabéri")
    db_session.add(depot)
    await db_session.flush()

    operation_id = uuid.uuid4()
    payload = MovementCreate(
        client_operation_id=operation_id, variant_id=variant.id, depot_id=depot.id, quantity=12, reason="achat"
    )

    service = StockService(db_session)
    await service.record_entry(organization_id=org.id, actor=user, actor_membership=membership, payload=payload)
    # Synchronisation rejouée : même operation_id, même payload.
    await service.record_entry(organization_id=org.id, actor=user, actor_membership=membership, payload=payload)

    movements = (await db_session.execute(select(StockMovement).where(StockMovement.organization_id == org.id))).scalars().all()
    assert len(movements) == 1, "un seul mouvement malgré la resoumission"

    level = (
        await db_session.execute(select(StockLevel).where(StockLevel.variant_id == variant.id, StockLevel.depot_id == depot.id))
    ).scalar_one()
    assert level.quantity == 12, "la quantité n'est comptée qu'une seule fois"
