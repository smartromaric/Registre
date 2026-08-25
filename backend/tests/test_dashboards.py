"""Tableaux de bord (cahier des charges §10) : vue globale (§10.1), focalisation
par modèle avec des indicateurs qui changent selon la nature (§10.2, §10.3),
listes "cliquables" pour chaque compteur (§10.5), tableaux de bord enregistrés
et épinglés (§10.4).
"""

import uuid
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import text

from app.core.security import create_access_token, hash_password
from app.dynamic_fields.types import FieldType
from app.models.membership import Membership, OrgRole
from app.models.model_definition import FieldDefinition, ModelDefinition, RecordNature
from app.models.organization import Organization
from app.models.record import Record, RecordDeadline, RecordEvent
from app.models.stock import ArticleConfig, ArticleVariant, Depot, DepotThreshold, MovementType, StockLot, StockMovement
from app.models.user import User


async def _bootstrap(db_session, *, can_view_amounts: bool = True):
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
    db_session.add(
        Membership(
            organization_id=org.id, user_id=user.id, role=OrgRole.ADMIN, is_active=True, can_view_amounts=can_view_amounts
        )
    )
    await db_session.flush()

    # --- modèle actif suivi : deux fiches, une échéance en retard, une à venir ---
    vehicle_model = ModelDefinition(
        organization_id=org.id, name_singular="Véhicule", name_plural="Véhicules",
        nature=RecordNature.ASSET, title_field_key="immatriculation",
    )
    db_session.add(vehicle_model)
    await db_session.flush()
    due_field = FieldDefinition(
        organization_id=org.id, model_definition_id=vehicle_model.id,
        key="assurance", label="Assurance", field_type=FieldType.DUE_DATE,
    )
    db_session.add(due_field)
    await db_session.flush()

    today = date.today()
    overdue_record = Record(
        organization_id=org.id, model_definition_id=vehicle_model.id,
        data={"immatriculation": "CE 001 AB"}, status="en_service",
    )
    upcoming_record = Record(
        organization_id=org.id, model_definition_id=vehicle_model.id,
        data={"immatriculation": "CE 002 AB"}, status="immobilise",
    )
    db_session.add_all([overdue_record, upcoming_record])
    await db_session.flush()
    db_session.add_all(
        [
            RecordDeadline(
                organization_id=org.id, record_id=overdue_record.id, field_definition_id=due_field.id,
                due_date=today - timedelta(days=5),
            ),
            RecordDeadline(
                organization_id=org.id, record_id=upcoming_record.id, field_definition_id=due_field.id,
                due_date=today + timedelta(days=10),
            ),
        ]
    )
    db_session.add(
        RecordEvent(
            organization_id=org.id, record_id=overdue_record.id, event_type="entretien",
            occurred_at=today - timedelta(days=2), cost_amount=15000,
        )
    )
    await db_session.flush()

    # --- modèle article de stock : une variante sous seuil, un lot qui expire bientôt ---
    gas_model = ModelDefinition(
        organization_id=org.id, name_singular="Article de gaz", name_plural="Stock de gaz", nature=RecordNature.STOCK_ITEM
    )
    db_session.add(gas_model)
    await db_session.flush()
    db_session.add(
        FieldDefinition(
            organization_id=org.id, model_definition_id=gas_model.id, key="nom", label="Nom", field_type=FieldType.TEXT_SHORT
        )
    )
    gas_record = Record(organization_id=org.id, model_definition_id=gas_model.id, data={"nom": "Bouteille 12,5 kg"})
    db_session.add(gas_record)
    await db_session.flush()
    config = ArticleConfig(organization_id=org.id, record_id=gas_record.id, unit="bouteille", purchase_price=4500)
    db_session.add(config)
    variant = ArticleVariant(
        organization_id=org.id, record_id=gas_record.id, label="12,5 kg", is_default=True, default_threshold=50
    )
    db_session.add(variant)
    await db_session.flush()

    depot = Depot(organization_id=org.id, name="Dépôt Bonabéri")
    db_session.add(depot)
    await db_session.flush()

    # Entrée passée hors période (60 jours) puis sortie dans la période (30 jours par défaut).
    # `created_at` fixé explicitement à l'insertion : stock_movements est immuable
    # (trigger qui rejette tout UPDATE, voir test_stock.py) donc on ne peut pas
    # la dater après coup, seulement au moment de la construction de la ligne.
    db_session.add(
        StockMovement(
            organization_id=org.id, variant_id=variant.id, depot_id=depot.id,
            movement_type=MovementType.ENTRY, quantity_delta=40, created_by_user_id=user.id,
            created_at=datetime.now(UTC) - timedelta(days=60),
        )
    )
    await db_session.flush()
    db_session.add(
        StockMovement(
            organization_id=org.id, variant_id=variant.id, depot_id=depot.id,
            movement_type=MovementType.EXIT, quantity_delta=-10, created_by_user_id=user.id,
        )
    )
    await db_session.flush()  # quantité restante 30, sous le seuil de 50

    db_session.add(
        StockLot(
            organization_id=org.id, variant_id=variant.id, depot_id=depot.id,
            lot_number="L1", expiry_date=today + timedelta(days=5), remaining_quantity=10,
        )
    )
    db_session.add(
        StockLot(
            organization_id=org.id, variant_id=variant.id, depot_id=depot.id,
            lot_number="L2", expiry_date=today + timedelta(days=200), remaining_quantity=10,
        )
    )
    await db_session.flush()

    headers = {"Authorization": f"Bearer {create_access_token(user.id)}"}
    return {
        "org": org, "user": user, "headers": headers,
        "vehicle_model": vehicle_model, "gas_model": gas_model,
        "overdue_record": overdue_record, "upcoming_record": upcoming_record,
        "due_field": due_field, "variant": variant, "depot": depot,
    }


async def test_global_dashboard_attention_and_summary(client, db_session):
    ctx = await _bootstrap(db_session)
    org_id = ctx["org"].id

    response = await client.get(f"/api/v1/organizations/{org_id}/dashboard", headers=ctx["headers"])
    assert response.status_code == 200, response.text
    body = response.json()

    assert body["scope"]["model_definition_id"] is None
    assert body["attention"]["overdue_deadlines_count"] == 1
    assert body["attention"]["upcoming_deadlines_count"] == 1
    assert body["attention"]["understock_articles_count"] == 1
    assert body["attention"]["expiring_lots_count"] == 1
    assert body["summary"]["total_records"] == 3  # 2 véhicules + 1 article
    assert body["summary"]["total_stock_value"] == 30 * 4500
    assert body["asset"] is None
    assert body["stock"] is None


async def test_asset_focused_dashboard(client, db_session):
    ctx = await _bootstrap(db_session)
    org_id = ctx["org"].id

    response = await client.get(
        f"/api/v1/organizations/{org_id}/dashboard",
        headers=ctx["headers"],
        params={"model_id": str(ctx["vehicle_model"].id)},
    )
    assert response.status_code == 200, response.text
    body = response.json()

    assert body["scope"]["nature"] == "asset"
    asset = body["asset"]
    assert asset["fiche_count"] == 2
    assert {row["status"]: row["count"] for row in asset["status_breakdown"]} == {"en_service": 1, "immobilise": 1}
    assert asset["overdue_deadlines_count"] == 1
    assert asset["upcoming_deadlines_count"] == 1
    assert asset["event_cost_total"] == 15000
    assert asset["event_cost_by_month"][0]["amount"] == 15000
    assert body["attention"] is None
    assert body["stock"] is None


async def test_stock_focused_dashboard(client, db_session):
    ctx = await _bootstrap(db_session)
    org_id = ctx["org"].id

    response = await client.get(
        f"/api/v1/organizations/{org_id}/dashboard",
        headers=ctx["headers"],
        params={"model_id": str(ctx["gas_model"].id)},
    )
    assert response.status_code == 200, response.text
    stock = response.json()["stock"]

    assert stock["total_quantity"] == 30
    assert stock["understock_articles_count"] == 1
    assert stock["stock_value"] == 30 * 4500
    assert stock["entries_quantity_period"] == 0, "l'entree de 40 est hors periode (anterieure a J-30)"
    assert stock["exits_quantity_period"] == 10
    assert stock["expiring_lots_count"] == 1
    assert stock["stock_by_depot"] == [{"depot_id": str(ctx["depot"].id), "depot_name": "Dépôt Bonabéri", "quantity": 30}]


async def test_can_view_amounts_false_hides_monetary_fields(client, db_session):
    ctx = await _bootstrap(db_session, can_view_amounts=False)
    org_id = ctx["org"].id

    global_resp = await client.get(f"/api/v1/organizations/{org_id}/dashboard", headers=ctx["headers"])
    assert global_resp.json()["summary"]["total_stock_value"] is None

    asset_resp = await client.get(
        f"/api/v1/organizations/{org_id}/dashboard",
        headers=ctx["headers"],
        params={"model_id": str(ctx["vehicle_model"].id)},
    )
    assert asset_resp.json()["asset"]["event_cost_total"] is None
    assert asset_resp.json()["asset"]["event_cost_by_month"] is None

    stock_resp = await client.get(
        f"/api/v1/organizations/{org_id}/dashboard",
        headers=ctx["headers"],
        params={"model_id": str(ctx["gas_model"].id)},
    )
    assert stock_resp.json()["stock"]["stock_value"] is None


async def test_deadline_hits_drilldown_matches_attention_count(client, db_session):
    ctx = await _bootstrap(db_session)
    org_id = ctx["org"].id

    response = await client.get(
        f"/api/v1/organizations/{org_id}/dashboard/deadlines", headers=ctx["headers"], params={"status": "overdue"}
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["total"] == 1
    hit = body["items"][0]
    assert hit["record_id"] == str(ctx["overdue_record"].id)
    assert hit["field_key"] == "assurance"
    assert hit["record_title"] == "CE 001 AB"
    assert hit["days_overdue"] == 5


async def test_understock_and_expiring_lot_hits_drilldown(client, db_session):
    ctx = await _bootstrap(db_session)
    org_id = ctx["org"].id

    understock = await client.get(f"/api/v1/organizations/{org_id}/dashboard/understock", headers=ctx["headers"])
    assert understock.status_code == 200, understock.text
    understock_body = understock.json()
    assert understock_body["total"] == 1
    assert understock_body["items"][0]["quantity"] == 30
    assert understock_body["items"][0]["threshold"] == 50

    expiring = await client.get(f"/api/v1/organizations/{org_id}/dashboard/expiring-lots", headers=ctx["headers"])
    assert expiring.status_code == 200, expiring.text
    expiring_body = expiring.json()
    assert expiring_body["total"] == 1
    assert expiring_body["items"][0]["lot_number"] == "L1"


async def test_understock_respects_depot_specific_override(client, db_session):
    ctx = await _bootstrap(db_session)
    org_id = ctx["org"].id
    db_session.add(
        DepotThreshold(organization_id=ctx["org"].id, variant_id=ctx["variant"].id, depot_id=ctx["depot"].id, threshold=10)
    )
    await db_session.flush()

    understock = await client.get(f"/api/v1/organizations/{org_id}/dashboard/understock", headers=ctx["headers"])
    assert understock.json()["total"] == 0, "30 >= la surcharge de seuil (10) : plus sous seuil"


async def test_saved_dashboard_crud_and_single_pin(client, db_session):
    ctx = await _bootstrap(db_session)
    org_id = ctx["org"].id
    base = f"/api/v1/organizations/{org_id}/dashboards/saved"

    first = await client.post(base, headers=ctx["headers"], json={"name": "Parc Douala", "period": "30d"})
    assert first.status_code == 201, first.text
    second = await client.post(
        base, headers=ctx["headers"], json={"name": "Gaz Bonaberi", "model_definition_id": str(ctx["gas_model"].id)}
    )
    assert second.status_code == 201

    listing = await client.get(base, headers=ctx["headers"])
    assert {d["name"] for d in listing.json()} == {"Parc Douala", "Gaz Bonaberi"}

    pin_first = await client.patch(f"{base}/{first.json()['id']}", headers=ctx["headers"], json={"is_pinned": True})
    assert pin_first.json()["is_pinned"] is True

    pin_second = await client.patch(f"{base}/{second.json()['id']}", headers=ctx["headers"], json={"is_pinned": True})
    assert pin_second.json()["is_pinned"] is True

    pinned = await client.get(f"{base}/pinned", headers=ctx["headers"])
    assert pinned.json()["id"] == second.json()["id"], "un seul tableau de bord epingle a la fois"

    deleted = await client.delete(f"{base}/{first.json()['id']}", headers=ctx["headers"])
    assert deleted.status_code == 204

    missing = await client.patch(f"{base}/{first.json()['id']}", headers=ctx["headers"], json={"name": "x"})
    assert missing.status_code == 404
