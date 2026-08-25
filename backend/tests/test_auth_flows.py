"""Réinitialisation de mot de passe et acceptation d'invitation par e-mail
(cahier des charges §4.4) — les deux mécaniques manquantes documentées comme
"pas encore construites côté backend" au lot 0.
"""

import uuid

from sqlalchemy import text

from app.core.security import create_access_token, create_password_reset_token, hash_password
from app.models.membership import Membership, OrgRole
from app.models.organization import Organization
from app.models.user import User
from app.services.auth_service import AuthError, AuthService


async def _bootstrap_admin_org(db_session):
    user = User(
        email=f"{uuid.uuid4()}@example.com", full_name="Awa", hashed_password=hash_password("correct-horse-1"),
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
    await db_session.flush()

    headers = {"Authorization": f"Bearer {create_access_token(user.id)}"}
    return org, user, headers


# --- mot de passe oublié ------------------------------------------------------------


async def test_forgot_password_is_always_204_even_for_unknown_email(client, db_session):
    response = await client.post("/api/v1/auth/password/forgot", json={"email": "personne@example.com"})
    assert response.status_code == 204, "ne jamais reveler si un compte existe pour cet e-mail"


async def test_reset_password_with_valid_token_allows_login_with_new_password(client, db_session):
    user = User(
        email=f"{uuid.uuid4()}@example.com", full_name="Awa", hashed_password=hash_password("ancien-mdp-1"),
        is_active=True,
    )
    db_session.add(user)
    await db_session.flush()

    token = create_password_reset_token(user.id)
    response = await client.post(
        "/api/v1/auth/password/reset", json={"token": token, "password": "nouveau-mdp-tres-sur"}
    )
    assert response.status_code == 200, response.text
    assert response.json()["user"]["email"] == user.email

    login = await client.post(
        "/api/v1/auth/login", json={"email": user.email, "password": "nouveau-mdp-tres-sur"}
    )
    assert login.status_code == 200, login.text

    old_password_login = await client.post("/api/v1/auth/login", json={"email": user.email, "password": "ancien-mdp-1"})
    assert old_password_login.status_code == 401


async def test_reset_password_rejects_wrong_token_type(client, db_session):
    user = User(
        email=f"{uuid.uuid4()}@example.com", full_name="Awa", hashed_password=hash_password("ancien-mdp-1"),
        is_active=True,
    )
    db_session.add(user)
    await db_session.flush()

    access_token = create_access_token(user.id)  # bon jeton, mauvais type
    response = await client.post("/api/v1/auth/password/reset", json={"token": access_token, "password": "xxxxxxxx"})
    assert response.status_code == 400


# --- acceptation d'invitation par e-mail --------------------------------------------


async def test_invite_new_member_returns_link_when_smtp_unconfigured(client, db_session):
    org, _admin, headers = await _bootstrap_admin_org(db_session)
    invitee_email = f"{uuid.uuid4()}@example.com"

    response = await client.post(
        f"/api/v1/organizations/{org.id}/members",
        headers=headers,
        json={"email": invitee_email, "full_name": "Nouveau Membre", "role": "operator"},
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["invitation_email_sent"] is False, "aucun SMTP configure en environnement de test"
    assert body["invitation_link"] is not None
    assert "token=" in body["invitation_link"]
    assert body["membership"]["user"]["email"] == invitee_email
    assert body["membership"]["is_active"] is True


async def test_invitation_accept_flow_activates_user_and_allows_login(client, db_session):
    org, _admin, headers = await _bootstrap_admin_org(db_session)
    invitee_email = f"{uuid.uuid4()}@example.com"

    invite = await client.post(
        f"/api/v1/organizations/{org.id}/members",
        headers=headers,
        json={"email": invitee_email, "full_name": "Nouveau Membre", "role": "operator"},
    )
    token = invite.json()["invitation_link"].split("token=")[1]

    info = await client.get(f"/api/v1/auth/invitations/{token}")
    assert info.status_code == 200, info.text
    assert info.json() == {"email": invitee_email, "organization_name": org.name, "already_active": False}

    accept = await client.post(
        "/api/v1/auth/invitations/accept", json={"token": token, "password": "mot-de-passe-invite-1"}
    )
    assert accept.status_code == 200, accept.text
    assert accept.json()["user"]["email"] == invitee_email

    login = await client.post("/api/v1/auth/login", json={"email": invitee_email, "password": "mot-de-passe-invite-1"})
    assert login.status_code == 200

    replay = await client.post(
        "/api/v1/auth/invitations/accept", json={"token": token, "password": "autre-mot-de-passe"}
    )
    assert replay.status_code == 400, "une invitation deja acceptee ne se reclame pas deux fois"


async def test_inviting_already_active_user_sends_no_invitation_email(client, db_session):
    org, _admin, headers = await _bootstrap_admin_org(db_session)
    other_org = Organization(name="Autre Org", country_code="CM", currency_code="XAF", timezone="Africa/Douala")
    db_session.add(other_org)
    await db_session.flush()

    already_active = User(
        email=f"{uuid.uuid4()}@example.com", full_name="Deja Actif", hashed_password=hash_password("x"), is_active=True
    )
    db_session.add(already_active)
    await db_session.flush()

    response = await client.post(
        f"/api/v1/organizations/{org.id}/members",
        headers=headers,
        json={"email": already_active.email, "full_name": already_active.full_name, "role": "reader"},
    )
    assert response.status_code == 201, response.text
    assert response.json()["invitation_email_sent"] is False
    assert response.json()["invitation_link"] is None, "un utilisateur deja actif n a rien a accepter par e-mail"


async def test_accept_invitation_with_garbage_token_is_a_clean_400(client, db_session):
    response = await client.post(
        "/api/v1/auth/invitations/accept", json={"token": "not-a-real-token", "password": "xxxxxxxx"}
    )
    assert response.status_code == 400


async def test_decode_invitation_service_error_for_expired_type(db_session):
    """Sanity check direct sur le service : un jeton du mauvais type est rejete
    avant meme d'aller chercher une organisation ou une adhesion."""
    user = User(email=f"{uuid.uuid4()}@example.com", full_name="Awa", is_active=False)
    db_session.add(user)
    await db_session.flush()

    raised = False
    try:
        await AuthService(db_session).get_invitation_info(create_password_reset_token(user.id))
    except AuthError:
        raised = True
    assert raised
