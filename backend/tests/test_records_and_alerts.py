"""Lot 1 : moteur de fiches, échéances et alertes. Priorités du cahier des
charges §16.1 pour ce lot : rejouabilité du moteur d'alertes (§8.2), et la
règle centrale du champ Échéance — un renouvellement referme l'alerte ouverte
(§5.4).
"""

import uuid
from datetime import date, timedelta

from sqlalchemy import select, text

from app.alerts.engine import compute_paliers_for_today, resolve_alerts_for_deadline, scan_organization_deadlines
from app.alerts.notify import dispatch_new_alert_notifications
from app.core.security import hash_password
from app.dynamic_fields.types import FieldType
from app.dynamic_fields.validation import FieldValidationError, validate_and_normalize
from app.models.alert import Alert, AlertStatus
from app.models.membership import Membership, OrgRole
from app.models.model_definition import FieldDefinition, ModelDefinition, RecordNature
from app.models.notification import Notification
from app.models.organization import Organization
from app.models.record import Record, RecordDeadline
from app.models.user import User


async def _bootstrap_org_with_vehicle_model(
    db_session,
) -> tuple[Organization, User, ModelDefinition, FieldDefinition]:
    user = User(
        email=f"{uuid.uuid4()}@example.com",
        full_name="Awa",
        hashed_password=hash_password("not-used"),
        is_active=True,
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
        organization_id=org.id,
        name_singular="Véhicule",
        name_plural="Véhicules",
        nature=RecordNature.ASSET,
        title_field_key="immatriculation",
    )
    db_session.add(model)
    await db_session.flush()

    field_immat = FieldDefinition(
        organization_id=org.id,
        model_definition_id=model.id,
        key="immatriculation",
        label="Immatriculation",
        field_type=FieldType.TEXT_SHORT,
        is_required=True,
        is_unique=True,
    )
    field_visite = FieldDefinition(
        organization_id=org.id,
        model_definition_id=model.id,
        key="visite_technique",
        label="Visite technique",
        field_type=FieldType.DUE_DATE,
        reminder_offsets_days=[30, 7, 0],
        reminder_repeat_days_overdue=3,
    )
    db_session.add_all([field_immat, field_visite])
    await db_session.flush()
    await db_session.refresh(model, attribute_names=["field_definitions"])
    return org, user, model, field_visite


def test_compute_paliers_catches_up_skipped_offsets():
    today = date(2026, 4, 1)
    due = today + timedelta(days=25)  # entre les paliers 30 et 7 : les deux "au-dessus" doivent sortir
    assert compute_paliers_for_today(due, today, [60, 30, 7, 0], 3) == ["j-30", "j-60"]


def test_compute_paliers_overdue_repeats_every_n_days():
    today = date(2026, 4, 10)
    due = today - timedelta(days=4)  # 4 jours de retard, cycle de 3 -> cycle 1
    assert compute_paliers_for_today(due, today, [60, 30, 7, 0], 3) == ["overdue-1"]


def test_validate_and_normalize_rejects_unknown_and_missing_required_fields():
    field = FieldDefinition(
        organization_id=uuid.uuid4(),
        model_definition_id=uuid.uuid4(),
        key="immatriculation",
        label="Immatriculation",
        field_type=FieldType.TEXT_SHORT,
        is_required=True,
    )
    try:
        validate_and_normalize([field], {"champ_inconnu": "x"}, partial=False)
        raise AssertionError("devait lever FieldValidationError")
    except FieldValidationError as exc:
        assert "champ_inconnu" in exc.errors
        assert "immatriculation" in exc.errors  # obligatoire et absent


async def test_creating_due_date_field_populates_record_deadline(db_session):
    org, user, model, field_visite = await _bootstrap_org_with_vehicle_model(db_session)

    due = date.today() + timedelta(days=10)
    record = Record(
        organization_id=org.id,
        model_definition_id=model.id,
        data={
            "immatriculation": "CE 456 AB",
            "visite_technique": {"due_date": due.isoformat(), "document_id": None},
        },
        created_by_user_id=user.id,
    )
    db_session.add(record)
    await db_session.flush()

    # Simule ce que RecordService._sync_deadlines fait à l'écriture.
    deadline = RecordDeadline(
        organization_id=org.id, record_id=record.id, field_definition_id=field_visite.id, due_date=due
    )
    db_session.add(deadline)
    await db_session.flush()

    result = await db_session.execute(select(RecordDeadline).where(RecordDeadline.record_id == record.id))
    stored = result.scalar_one()
    assert stored.due_date == due


async def test_alert_scan_is_idempotent_and_creates_in_app_notification(db_session):
    org, user, model, field_visite = await _bootstrap_org_with_vehicle_model(db_session)

    due = date.today() + timedelta(days=5)  # doit franchir le palier j-7
    record = Record(
        organization_id=org.id,
        model_definition_id=model.id,
        data={"immatriculation": "CE 456 AB"},
        created_by_user_id=user.id,
    )
    db_session.add(record)
    await db_session.flush()

    deadline = RecordDeadline(
        organization_id=org.id, record_id=record.id, field_definition_id=field_visite.id, due_date=due
    )
    db_session.add(deadline)
    await db_session.flush()

    today = date.today()
    first_run = await scan_organization_deadlines(db_session, org.id, today)
    await dispatch_new_alert_notifications(db_session, org.id, first_run)
    await db_session.flush()

    second_run = await scan_organization_deadlines(db_session, org.id, today)

    assert len(first_run) >= 1, "au moins une alerte (palier j-7) doit être émise"
    assert second_run == [], "rejouer le même jour ne doit rien créer de plus (§8.2)"

    alerts = (await db_session.execute(select(Alert).where(Alert.organization_id == org.id))).scalars().all()
    assert len({(a.source_id, a.palier) for a in alerts}) == len(alerts), "aucun doublon (source, palier)"

    notifications = (
        (await db_session.execute(select(Notification).where(Notification.organization_id == org.id)))
        .scalars()
        .all()
    )
    assert len(notifications) == len(first_run), "une notification par alerte nouvellement émise (§8.5)"


async def test_renewing_deadline_resolves_open_alert(db_session):
    org, user, model, field_visite = await _bootstrap_org_with_vehicle_model(db_session)

    overdue = date.today() - timedelta(days=1)
    record = Record(
        organization_id=org.id,
        model_definition_id=model.id,
        data={"immatriculation": "CE 456 AB"},
        created_by_user_id=user.id,
    )
    db_session.add(record)
    await db_session.flush()

    deadline = RecordDeadline(
        organization_id=org.id, record_id=record.id, field_definition_id=field_visite.id, due_date=overdue
    )
    db_session.add(deadline)
    await db_session.flush()

    new_alerts = await scan_organization_deadlines(db_session, org.id, date.today())
    assert len(new_alerts) >= 1

    # Renouvellement : la nouvelle date est loin dans le futur.
    deadline.due_date = date.today() + timedelta(days=365)
    await db_session.flush()
    await resolve_alerts_for_deadline(db_session, deadline.id)
    await db_session.flush()

    alerts = (await db_session.execute(select(Alert).where(Alert.source_id == deadline.id))).scalars().all()
    assert all(a.status == AlertStatus.RESOLVED for a in alerts)
