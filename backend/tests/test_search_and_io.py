"""Lot 3 : recherche, vues enregistrées, export et import (cahier des charges §9)."""

import uuid

from sqlalchemy import text

from app.core.security import hash_password
from app.dynamic_fields.types import FieldType
from app.models.membership import Membership, OrgRole
from app.models.model_definition import FieldDefinition, ModelDefinition, RecordNature
from app.models.organization import Organization
from app.models.record import Record
from app.models.user import User
from app.services.export_service import export_records_csv
from app.services.import_service import build_rows, suggest_mapping
from app.services.search_service import global_search


async def _bootstrap_vehicle_model(db_session):
    user = User(email=f"{uuid.uuid4()}@example.com", full_name="Awa", hashed_password=hash_password("x"), is_active=True)
    db_session.add(user)
    await db_session.flush()

    org = Organization(name="Transports Awa", country_code="CM", currency_code="XAF", timezone="Africa/Douala")
    db_session.add(org)
    await db_session.flush()

    await db_session.execute(text(f"SET LOCAL app.current_org_id = '{org.id}'"))
    await db_session.execute(text(f"SET LOCAL app.current_user_id = '{user.id}'"))
    db_session.add(Membership(organization_id=org.id, user_id=user.id, role=OrgRole.ADMIN, is_active=True))

    model = ModelDefinition(
        organization_id=org.id, name_singular="Véhicule", name_plural="Véhicules",
        nature=RecordNature.ASSET, title_field_key="immatriculation",
    )
    db_session.add(model)
    await db_session.flush()

    immat = FieldDefinition(
        organization_id=org.id, model_definition_id=model.id, key="immatriculation", label="Immatriculation",
        field_type=FieldType.TEXT_SHORT, is_required=True, is_filterable=True, show_in_list=True,
    )
    marque = FieldDefinition(
        organization_id=org.id, model_definition_id=model.id, key="marque", label="Marque",
        field_type=FieldType.TEXT_SHORT, is_filterable=True, show_in_list=True,
    )
    db_session.add_all([immat, marque])
    await db_session.flush()
    await db_session.refresh(model, attribute_names=["field_definitions"])
    return org, user, model


async def test_global_search_finds_record_by_filterable_field(db_session):
    org, user, model = await _bootstrap_vehicle_model(db_session)
    record = Record(
        organization_id=org.id, model_definition_id=model.id,
        data={"immatriculation": "CE 456 AB", "marque": "Toyota"}, created_by_user_id=user.id,
    )
    db_session.add(record)
    await db_session.flush()

    hits = await global_search(db_session, org.id, "toyota")
    assert any(h.record_id == record.id and h.title == "CE 456 AB" for h in hits)

    no_hits = await global_search(db_session, org.id, "nissan")
    assert no_hits == []


async def test_export_csv_uses_field_labels_and_formats_values(db_session):
    org, user, model = await _bootstrap_vehicle_model(db_session)
    record = Record(
        organization_id=org.id, model_definition_id=model.id,
        data={"immatriculation": "CE 456 AB", "marque": "Toyota"}, created_by_user_id=user.id,
    )
    db_session.add(record)
    await db_session.flush()

    csv_text = export_records_csv(model, [record])
    lines = csv_text.strip().splitlines()
    assert "Immatriculation" in lines[0] and "Marque" in lines[0]
    assert "CE 456 AB" in lines[1] and "Toyota" in lines[1]


def test_import_mapping_matches_headers_to_field_labels():
    fields = [
        FieldDefinition(key="immatriculation", label="Immatriculation", field_type=FieldType.TEXT_SHORT),
        FieldDefinition(key="marque", label="Marque", field_type=FieldType.TEXT_SHORT),
    ]
    mapping = suggest_mapping(["Immat", "Immatriculation", "Marque véhicule", "Colonne inconnue"], fields)
    assert mapping["Immatriculation"] == "immatriculation"
    assert mapping["Colonne inconnue"] is None


def test_import_build_rows_reports_errors_for_missing_required_field():
    fields = [
        FieldDefinition(key="immatriculation", label="Immatriculation", field_type=FieldType.TEXT_SHORT, is_required=True),
    ]
    rows = build_rows(
        [{"Immat": "CE 456 AB"}, {"Immat": ""}],
        {"Immat": "immatriculation"},
        fields,
    )
    assert rows[0].is_valid and rows[0].data == {"immatriculation": "CE 456 AB"}
    assert not rows[1].is_valid and "immatriculation" in rows[1].errors
