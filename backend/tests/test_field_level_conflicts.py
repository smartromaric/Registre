"""Fusion champ par champ des fiches modifiées hors-ligne (cahier des charges
§11.3) : « la fusion se fait champ par champ : le dernier écrit l'emporte sur
le champ concerné, et non sur la fiche entière. Tout conflit réel est inscrit
dans un journal consultable par l'administrateur, avec les deux valeurs. »

"Le dernier écrit" veut dire chronologiquement (l'instant où l'utilisateur a
réellement saisi la valeur, `field_written_at`), pas l'ordre d'arrivée au
serveur — sans quoi un agent hors-ligne reconnecté en retard écraserait une
écriture en ligne plus récente sur le même champ.
"""

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select, text

from app.core.security import hash_password
from app.dynamic_fields.types import FieldType
from app.models.membership import Membership, OrgRole
from app.models.model_definition import FieldDefinition, ModelDefinition, RecordNature
from app.models.organization import Organization
from app.models.sync import RecordFieldConflict
from app.models.user import User
from app.services.record_service import RecordService
from app.services.sync_service import SyncConflictService


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
    for key, label in (("immatriculation", "Immatriculation"), ("kilometrage", "Kilométrage")):
        db_session.add(
            FieldDefinition(
                organization_id=org.id, model_definition_id=model.id, key=key, label=label,
                field_type=FieldType.TEXT_SHORT, is_required=False,
            )
        )
    await db_session.flush()
    await db_session.refresh(model, attribute_names=["field_definitions"])
    return org, user, membership, model


async def test_two_different_fields_never_conflict(db_session):
    org, user, membership, model = await _bootstrap(db_session)
    service = RecordService(db_session)
    record = await service.create(
        organization_id=org.id, actor=user, actor_membership=membership, model=model,
        data={"immatriculation": "CE 456 AB", "kilometrage": "1000"}, status=None, site=None,
        assigned_person_record_id=None,
    )

    updated = await service.update(
        organization_id=org.id, actor=user, actor_membership=membership, model=model, record=record,
        data={"kilometrage": "1500"}, status=None, site=None, assigned_person_record_id=None,
    )
    assert updated.data == {"immatriculation": "CE 456 AB", "kilometrage": "1500"}
    assert updated.conflicted_field_keys == []


async def test_late_offline_write_loses_to_a_more_recent_online_write(db_session):
    org, user, membership, model = await _bootstrap(db_session)
    service = RecordService(db_session)
    record = await service.create(
        organization_id=org.id, actor=user, actor_membership=membership, model=model,
        data={"kilometrage": "1000"}, status=None, site=None, assigned_person_record_id=None,
    )

    now = datetime.now(UTC)
    online_write_at = now
    offline_write_at = now - timedelta(hours=3)  # saisi hors-ligne AVANT la relève en ligne, reçu APRÈS

    # L'écriture en ligne arrive et s'applique en premier (comportement normal).
    record = await service.update(
        organization_id=org.id, actor=user, actor_membership=membership, model=model, record=record,
        data={"kilometrage": "2000"}, status=None, site=None, assigned_person_record_id=None,
        field_written_at={"kilometrage": online_write_at},
    )
    assert record.data["kilometrage"] == "2000"
    assert record.conflicted_field_keys == []

    # L'agent hors-ligne se reconnecte en retard et rejoue sa saisie, plus ancienne.
    record = await service.update(
        organization_id=org.id, actor=user, actor_membership=membership, model=model, record=record,
        data={"kilometrage": "1800"}, status=None, site=None, assigned_person_record_id=None,
        field_written_at={"kilometrage": offline_write_at},
    )

    assert record.data["kilometrage"] == "2000", "la valeur la plus récente doit être conservée"
    assert record.conflicted_field_keys == ["kilometrage"]

    conflict = (
        await db_session.execute(select(RecordFieldConflict).where(RecordFieldConflict.record_id == record.id))
    ).scalar_one()
    assert conflict.kept_value == {"value": "2000"}
    assert conflict.rejected_value == {"value": "1800"}


async def test_chronologically_later_write_wins_even_if_it_arrives_first(db_session):
    org, user, membership, model = await _bootstrap(db_session)
    service = RecordService(db_session)
    record = await service.create(
        organization_id=org.id, actor=user, actor_membership=membership, model=model,
        data={"kilometrage": "1000"}, status=None, site=None, assigned_person_record_id=None,
    )

    now = datetime.now(UTC)
    # Un agent hors-ligne a saisi une valeur PLUS RÉCENTE mais synchronise en premier.
    record = await service.update(
        organization_id=org.id, actor=user, actor_membership=membership, model=model, record=record,
        data={"kilometrage": "2500"}, status=None, site=None, assigned_person_record_id=None,
        field_written_at={"kilometrage": now + timedelta(hours=1)},
    )
    assert record.data["kilometrage"] == "2500"

    # Une écriture plus ancienne (déjà dépassée) arrive ensuite : elle doit perdre.
    record = await service.update(
        organization_id=org.id, actor=user, actor_membership=membership, model=model, record=record,
        data={"kilometrage": "2100"}, status=None, site=None, assigned_person_record_id=None,
        field_written_at={"kilometrage": now},
    )
    assert record.data["kilometrage"] == "2500", "la fusion doit rester correcte quel que soit l'ordre d'arrivée"
    assert record.conflicted_field_keys == ["kilometrage"]


async def test_resubmitting_the_same_client_operation_id_is_a_no_op(db_session):
    org, user, membership, model = await _bootstrap(db_session)
    service = RecordService(db_session)
    record = await service.create(
        organization_id=org.id, actor=user, actor_membership=membership, model=model,
        data={"kilometrage": "1000"}, status=None, site=None, assigned_person_record_id=None,
    )
    operation_id = uuid.uuid4()

    first = await service.update(
        organization_id=org.id, actor=user, actor_membership=membership, model=model, record=record,
        data={"kilometrage": "1200"}, status=None, site=None, assigned_person_record_id=None,
        client_operation_id=operation_id,
    )
    assert first.data["kilometrage"] == "1200"

    # Coupure réseau après écriture, avant la réponse : le client retente le même appel.
    second = await service.update(
        organization_id=org.id, actor=user, actor_membership=membership, model=model, record=record,
        data={"kilometrage": "1200"}, status=None, site=None, assigned_person_record_id=None,
        client_operation_id=operation_id,
    )
    assert second.data["kilometrage"] == "1200"
    assert second.conflicted_field_keys == []

    conflicts = (
        await db_session.execute(select(RecordFieldConflict).where(RecordFieldConflict.record_id == record.id))
    ).scalars().all()
    assert len(conflicts) == 0, "une resoumission identique ne doit jamais générer de faux conflit"


async def test_conflict_is_listed_and_can_be_acknowledged_by_an_admin(db_session):
    org, user, membership, model = await _bootstrap(db_session)
    service = RecordService(db_session)
    record = await service.create(
        organization_id=org.id, actor=user, actor_membership=membership, model=model,
        data={"kilometrage": "1000"}, status=None, site=None, assigned_person_record_id=None,
    )
    now = datetime.now(UTC)
    await service.update(
        organization_id=org.id, actor=user, actor_membership=membership, model=model, record=record,
        data={"kilometrage": "2000"}, status=None, site=None, assigned_person_record_id=None,
        field_written_at={"kilometrage": now},
    )
    await service.update(
        organization_id=org.id, actor=user, actor_membership=membership, model=model, record=record,
        data={"kilometrage": "1800"}, status=None, site=None, assigned_person_record_id=None,
        field_written_at={"kilometrage": now - timedelta(hours=1)},
    )

    conflict_service = SyncConflictService(db_session)
    items, total = await conflict_service.list_for_organization(org.id)
    assert total == 1
    assert items[0].reviewed_at is None

    acknowledged = await conflict_service.acknowledge(org.id, items[0].id, user)
    assert acknowledged.reviewed_at is not None
    assert acknowledged.reviewed_by_user_id == user.id

    _items, unreviewed_total = await conflict_service.list_for_organization(org.id, only_unreviewed=True)
    assert unreviewed_total == 0
