"""Cahier des charges §16.1 : le cloisonnement entre organisations est une des
trois familles de tests exigées dès le lot 0. Deux niveaux de preuve ici :
1. directement contre la base — la politique RLS elle-même bloque la fuite,
   même si une couche applicative avait un bug ;
2. via l'API — un utilisateur d'une organisation ne peut pas agir sur une autre.
"""

import uuid

from sqlalchemy import select, text

from app.core.security import hash_password
from app.models.membership import Membership, OrgRole
from app.models.organization import Organization
from app.models.user import User


async def _create_org_with_admin(db_session, name: str) -> tuple[Organization, User, Membership]:
    user = User(
        email=f"{uuid.uuid4()}@example.com",
        full_name=name,
        hashed_password=hash_password("not-used"),
        is_active=True,
    )
    db_session.add(user)
    await db_session.flush()

    org = Organization(name=name, country_code="CM", currency_code="XAF", timezone="Africa/Douala")
    db_session.add(org)
    await db_session.flush()

    await db_session.execute(text(f"SET LOCAL app.current_org_id = '{org.id}'"))
    await db_session.execute(text(f"SET LOCAL app.current_user_id = '{user.id}'"))

    membership = Membership(organization_id=org.id, user_id=user.id, role=OrgRole.ADMIN, is_active=True)
    db_session.add(membership)
    await db_session.flush()
    return org, user, membership


async def test_rls_blocks_cross_organization_row_access(db_session):
    org_a, _, _ = await _create_org_with_admin(db_session, "Org A")
    org_b, _, _ = await _create_org_with_admin(db_session, "Org B")

    # On se replace explicitement dans le contexte de l'organisation A avant de lire :
    # la ligne de l'organisation B existe bel et bien dans la même transaction,
    # mais la politique RLS doit la rendre invisible.
    await db_session.execute(text(f"SET LOCAL app.current_org_id = '{org_a.id}'"))
    result = await db_session.execute(select(Membership))
    visible_org_ids = {row.organization_id for row in result.scalars().all()}

    assert org_a.id in visible_org_ids
    assert org_b.id not in visible_org_ids


async def test_api_blocks_access_to_foreign_organization(client):
    signup_a = await client.post(
        "/api/v1/auth/signup",
        json={"email": f"{uuid.uuid4()}@example.com", "password": "correct-horse-battery", "full_name": "Awa"},
    )
    assert signup_a.status_code == 200
    token_a = signup_a.json()["tokens"]["access_token"]

    org_a = await client.post(
        "/api/v1/auth/organizations",
        json={"name": "Transports Awa", "country_code": "CM", "sector": "Transport"},
        headers={"Authorization": f"Bearer {token_a}"},
    )
    assert org_a.status_code == 201
    org_a_id = org_a.json()["id"]

    signup_b = await client.post(
        "/api/v1/auth/signup",
        json={"email": f"{uuid.uuid4()}@example.com", "password": "correct-horse-battery", "full_name": "Marc"},
    )
    token_b = signup_b.json()["tokens"]["access_token"]

    forbidden = await client.get(
        f"/api/v1/organizations/{org_a_id}/members",
        headers={"Authorization": f"Bearer {token_b}"},
    )
    assert forbidden.status_code == 403

    allowed = await client.get(
        f"/api/v1/organizations/{org_a_id}/members",
        headers={"Authorization": f"Bearer {token_a}"},
    )
    assert allowed.status_code == 200
    assert len(allowed.json()) == 1
