"""Balayage nocturne multi-organisations (cahier des charges §8.2), la logique
derriere `app/tasks/alerts.py::run_nightly_alert_scan` — testee sans Celery ni
Redis (aucun des deux n'est provisionne dans cet environnement de
developpement) en appelant directement `scan_all_organizations`.
"""

import uuid
from datetime import date, timedelta

from sqlalchemy import select, text

from app.core.security import hash_password
from app.dynamic_fields.types import FieldType
from app.models.alert import Alert
from app.models.membership import Membership, OrgRole
from app.models.model_definition import FieldDefinition, ModelDefinition, RecordNature
from app.models.organization import Organization
from app.models.record import Record, RecordDeadline
from app.models.user import User
from app.tasks.alerts import scan_all_organizations


async def _bootstrap_org_with_overdue_deadline(db_session, name: str):
    user = User(email=f"{uuid.uuid4()}@example.com", full_name=name, hashed_password=hash_password("x"), is_active=True)
    db_session.add(user)
    await db_session.flush()

    org = Organization(name=name, country_code="CM", currency_code="XAF", timezone="Africa/Douala")
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
    field = FieldDefinition(
        organization_id=org.id, model_definition_id=model.id, key="assurance", label="Assurance",
        field_type=FieldType.DUE_DATE,
    )
    db_session.add(field)
    await db_session.flush()

    record = Record(organization_id=org.id, model_definition_id=model.id, data={"immatriculation": f"{name}-01"})
    db_session.add(record)
    await db_session.flush()
    db_session.add(
        RecordDeadline(
            organization_id=org.id, record_id=record.id, field_definition_id=field.id,
            due_date=date.today() - timedelta(days=3),
        )
    )
    await db_session.flush()
    return org


async def test_scan_all_organizations_scans_each_org_in_isolation(db_session):
    org_a = await _bootstrap_org_with_overdue_deadline(db_session, "Awa Transports")
    org_b = await _bootstrap_org_with_overdue_deadline(db_session, "Bello Logistique")

    results = await scan_all_organizations(db_session, today=date.today())

    assert results[str(org_a.id)] >= 1
    assert results[str(org_b.id)] >= 1

    # RLS n'expose qu'une seule organisation à la fois : vérifier "pas de
    # fuite entre organisations" impose donc de se replacer explicitement
    # dans le contexte de chacune avant de relire ses propres alertes —
    # exactement ce que fait une vraie requête HTTP via get_org_context.
    await db_session.execute(text(f"SET LOCAL app.current_org_id = '{org_a.id}'"))
    alerts_a = (await db_session.execute(select(Alert).where(Alert.organization_id == org_a.id))).scalars().all()
    assert len(alerts_a) >= 1
    assert {a.organization_id for a in alerts_a} == {org_a.id}, "aucune fuite d'alertes entre organisations"

    await db_session.execute(text(f"SET LOCAL app.current_org_id = '{org_b.id}'"))
    alerts_b = (await db_session.execute(select(Alert).where(Alert.organization_id == org_b.id))).scalars().all()
    assert len(alerts_b) >= 1
    assert {a.organization_id for a in alerts_b} == {org_b.id}


async def test_scan_all_organizations_is_idempotent_across_two_runs(db_session):
    org = await _bootstrap_org_with_overdue_deadline(db_session, "Awa Transports")

    first = await scan_all_organizations(db_session, today=date.today())
    second = await scan_all_organizations(db_session, today=date.today())

    assert first[str(org.id)] >= 1
    assert second[str(org.id)] == 0, "rejouer le meme jour ne doit rien creer de plus (§8.2)"
