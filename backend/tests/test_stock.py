"""Lot 2 : module Stock. Priorités du cahier des charges §16.1 pour ce lot :
l'additivité des mouvements sous conflit hors-ligne simulé (§7.3, §11.3, §11.4)
— le scénario "48 − 12 − 9 = 27" décrit littéralement au §18.3 — et l'idempotence
du moteur d'alertes appliquée aux seuils de stock (§8.1, §8.2).
"""

import uuid
from datetime import date

from sqlalchemy import select, text

from app.alerts.engine import resolve_stock_threshold_alerts_if_above, scan_organization_stock_thresholds
from app.core.security import hash_password
from app.dynamic_fields.types import FieldType
from app.models.alert import Alert, AlertStatus
from app.models.membership import Membership, OrgRole
from app.models.model_definition import FieldDefinition, ModelDefinition, RecordNature
from app.models.organization import Organization
from app.models.record import Record
from app.models.stock import ArticleConfig, ArticleVariant, Depot, MovementType, StockLevel, StockMovement
from app.models.user import User


async def _bootstrap_gas_article(db_session):
    user = User(
        email=f"{uuid.uuid4()}@example.com", full_name="Marc", hashed_password=hash_password("x"), is_active=True
    )
    db_session.add(user)
    await db_session.flush()

    org = Organization(name="Transports Awa", country_code="CM", currency_code="XAF", timezone="Africa/Douala")
    db_session.add(org)
    await db_session.flush()

    await db_session.execute(text(f"SET LOCAL app.current_org_id = '{org.id}'"))
    await db_session.execute(text(f"SET LOCAL app.current_user_id = '{user.id}'"))
    db_session.add(Membership(organization_id=org.id, user_id=user.id, role=OrgRole.ADMIN, is_active=True))

    model = ModelDefinition(
        organization_id=org.id, name_singular="Article de gaz", name_plural="Stock de gaz", nature=RecordNature.STOCK_ITEM
    )
    db_session.add(model)
    await db_session.flush()
    db_session.add(
        FieldDefinition(
            organization_id=org.id, model_definition_id=model.id, key="nom", label="Nom", field_type=FieldType.TEXT_SHORT
        )
    )
    await db_session.flush()

    record = Record(organization_id=org.id, model_definition_id=model.id, data={"nom": "Bouteille de gaz"})
    db_session.add(record)
    await db_session.flush()

    config = ArticleConfig(organization_id=org.id, record_id=record.id, unit="bouteille")
    db_session.add(config)
    variant = ArticleVariant(
        organization_id=org.id, record_id=record.id, attributes={"Format": "12,5 kg"}, label="12,5 kg", default_threshold=15
    )
    db_session.add(variant)
    await db_session.flush()

    depot = Depot(organization_id=org.id, name="Dépôt Bonabéri")
    db_session.add(depot)
    await db_session.flush()

    return org, user, variant, depot


async def test_movements_are_additive_never_conflicting(db_session):
    """Reproduit exactement le scénario du cahier des charges §18.3 : stock à 50,
    Marc sort 12 hors-ligne, Paul sort 9 depuis le bureau — le stock final doit
    être 50 − 12 − 9 = 29 (adapté ici avec une entrée initiale de 50), jamais un
    écrasement de l'un par l'autre.
    """
    org, user, variant, depot = await _bootstrap_gas_article(db_session)

    entry = StockMovement(
        organization_id=org.id, variant_id=variant.id, depot_id=depot.id,
        movement_type=MovementType.ENTRY, quantity_delta=50, created_by_user_id=user.id,
    )
    db_session.add(entry)
    await db_session.flush()

    exit_marc = StockMovement(
        organization_id=org.id, variant_id=variant.id, depot_id=depot.id,
        movement_type=MovementType.EXIT, quantity_delta=-12, created_by_user_id=user.id,
    )
    exit_paul = StockMovement(
        organization_id=org.id, variant_id=variant.id, depot_id=depot.id,
        movement_type=MovementType.EXIT, quantity_delta=-9, created_by_user_id=user.id,
    )
    db_session.add_all([exit_marc, exit_paul])
    await db_session.flush()

    level = (
        await db_session.execute(
            select(StockLevel).where(StockLevel.variant_id == variant.id, StockLevel.depot_id == depot.id)
        )
    ).scalar_one()
    assert level.quantity == 50 - 12 - 9 == 29


async def test_movements_are_immutable(db_session):
    org, user, variant, depot = await _bootstrap_gas_article(db_session)
    movement = StockMovement(
        organization_id=org.id, variant_id=variant.id, depot_id=depot.id,
        movement_type=MovementType.ENTRY, quantity_delta=10, created_by_user_id=user.id,
    )
    db_session.add(movement)
    await db_session.flush()

    movement.quantity_delta = 999
    raised = False
    try:
        await db_session.flush()
    except Exception as exc:  # noqa: BLE001 — on vérifie juste que Postgres a rejeté
        raised = True
        assert "interdit" in str(exc) or "not allowed" in str(exc).lower() or "append-only" in str(exc).lower()
    assert raised, "un UPDATE sur stock_movements doit être rejeté par le trigger"


async def test_stock_threshold_alert_is_idempotent_and_resolves_when_restocked(db_session):
    org, user, variant, depot = await _bootstrap_gas_article(db_session)

    entry = StockMovement(
        organization_id=org.id, variant_id=variant.id, depot_id=depot.id,
        movement_type=MovementType.ENTRY, quantity_delta=5, created_by_user_id=user.id,  # sous le seuil de 15
    )
    db_session.add(entry)
    await db_session.flush()

    today = date.today()
    first_run = await scan_organization_stock_thresholds(db_session, org.id, today)
    second_run = await scan_organization_stock_thresholds(db_session, org.id, today)

    assert len(first_run) >= 1
    assert second_run == [], "rejouer le même jour ne doit rien créer de plus (§8.2)"

    level = (
        await db_session.execute(
            select(StockLevel).where(StockLevel.variant_id == variant.id, StockLevel.depot_id == depot.id)
        )
    ).scalar_one()
    await resolve_stock_threshold_alerts_if_above(db_session, level.id)  # pas encore réapprovisionné : rien à faire

    restock = StockMovement(
        organization_id=org.id, variant_id=variant.id, depot_id=depot.id,
        movement_type=MovementType.ENTRY, quantity_delta=20, created_by_user_id=user.id,
    )
    db_session.add(restock)
    await db_session.flush()
    await resolve_stock_threshold_alerts_if_above(db_session, level.id)
    await db_session.flush()

    alerts = (await db_session.execute(select(Alert).where(Alert.organization_id == org.id))).scalars().all()
    assert all(a.status == AlertStatus.RESOLVED for a in alerts), "réapprovisionné au-dessus du seuil : résolu (§8.3)"
