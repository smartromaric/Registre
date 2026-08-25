"""Lectures ajoutées pour préparer l'interface Stock : relire un article déjà
configuré, l'historique des mouvements, les lots, les seuils par dépôt — aucune
de ces quatre routes n'existait avant (seules les écritures étaient exposées).
"""

import uuid
from datetime import date, timedelta

from sqlalchemy import text

from app.core.security import create_access_token, hash_password
from app.dynamic_fields.types import FieldType
from app.models.membership import Membership, OrgRole
from app.models.model_definition import FieldDefinition, ModelDefinition, RecordNature
from app.models.organization import Organization
from app.models.record import Record
from app.models.stock import ArticleConfig, ArticleVariant, Depot, DepotThreshold, MovementType, StockLot, StockMovement
from app.models.user import User


async def _bootstrap(db_session):
    user = User(
        email=f"{uuid.uuid4()}@example.com", full_name="Awa", hashed_password=hash_password("x"), is_active=True
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

    config = ArticleConfig(organization_id=org.id, record_id=record.id, unit="bouteille", lot_tracking_enabled=True)
    db_session.add(config)
    variant = ArticleVariant(
        organization_id=org.id, record_id=record.id, attributes={"Format": "12,5 kg"}, label="12,5 kg", default_threshold=15
    )
    db_session.add(variant)
    await db_session.flush()

    depot = Depot(organization_id=org.id, name="Dépôt Bonabéri")
    db_session.add(depot)
    await db_session.flush()

    headers = {"Authorization": f"Bearer {create_access_token(user.id)}"}
    return org, record, variant, depot, headers


async def test_get_article_returns_config_and_variants_or_404(client, db_session):
    org, record, variant, depot, headers = await _bootstrap(db_session)

    ok = await client.get(f"/api/v1/organizations/{org.id}/records/{record.id}/article", headers=headers)
    assert ok.status_code == 200, ok.text
    body = ok.json()
    assert body["config"]["record_id"] == str(record.id)
    assert [v["id"] for v in body["variants"]] == [str(variant.id)]

    other_record = Record(organization_id=org.id, model_definition_id=record.model_definition_id, data={"nom": "Non configuré"})
    db_session.add(other_record)
    await db_session.flush()
    missing = await client.get(f"/api/v1/organizations/{org.id}/records/{other_record.id}/article", headers=headers)
    assert missing.status_code == 404


async def test_list_movements_paginates_and_filters_by_record(client, db_session):
    org, record, variant, depot, headers = await _bootstrap(db_session)
    for qty in (10, 20, 30):
        db_session.add(
            StockMovement(
                organization_id=org.id, variant_id=variant.id, depot_id=depot.id,
                movement_type=MovementType.ENTRY, quantity_delta=qty, created_by_user_id=None,
            )
        )
    await db_session.flush()

    page = await client.get(
        f"/api/v1/organizations/{org.id}/stock/movements",
        headers=headers,
        params={"record_id": str(record.id), "limit": 2},
    )
    assert page.status_code == 200, page.text
    body = page.json()
    assert body["total"] == 3
    assert len(body["items"]) == 2
    assert body["items"][0]["quantity_delta"] == 30, "le plus récent d'abord"

    second_page = await client.get(
        f"/api/v1/organizations/{org.id}/stock/movements",
        headers=headers,
        params={"record_id": str(record.id), "limit": 2, "offset": 2},
    )
    assert len(second_page.json()["items"]) == 1


async def test_list_lots_filters_expiry_and_excludes_empty_by_default(client, db_session):
    org, record, variant, depot, headers = await _bootstrap(db_session)
    soon = date.today() + timedelta(days=5)
    far = date.today() + timedelta(days=200)
    common = {"organization_id": org.id, "variant_id": variant.id, "depot_id": depot.id}
    db_session.add_all(
        [
            StockLot(**common, lot_number="L1", expiry_date=soon, remaining_quantity=4),
            StockLot(**common, lot_number="L2", expiry_date=far, remaining_quantity=9),
            StockLot(**common, lot_number="L3", expiry_date=soon, remaining_quantity=0),
        ]
    )
    await db_session.flush()

    default = await client.get(
        f"/api/v1/organizations/{org.id}/stock/lots", headers=headers, params={"variant_id": str(variant.id)}
    )
    assert {lot["lot_number"] for lot in default.json()} == {"L1", "L2"}, "les lots épuisés sont exclus par défaut"

    expiring = await client.get(
        f"/api/v1/organizations/{org.id}/stock/lots",
        headers=headers,
        params={"variant_id": str(variant.id), "expiring_before": str(date.today() + timedelta(days=30))},
    )
    assert {lot["lot_number"] for lot in expiring.json()} == {"L1"}


async def test_list_variant_thresholds_returns_only_depot_overrides(client, db_session):
    org, record, variant, depot, headers = await _bootstrap(db_session)
    other_depot = Depot(organization_id=org.id, name="Dépôt Bonanjo")
    db_session.add(other_depot)
    await db_session.flush()
    db_session.add(DepotThreshold(organization_id=org.id, variant_id=variant.id, depot_id=depot.id, threshold=8))
    await db_session.flush()

    response = await client.get(f"/api/v1/organizations/{org.id}/variants/{variant.id}/thresholds", headers=headers)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body == [{"depot_id": str(depot.id), "threshold": 8}]
