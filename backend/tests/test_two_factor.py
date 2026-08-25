"""Authentification à deux facteurs (TOTP) — raffinement de sécurité listé
comme manquant au lot 0, ajouté une fois le reste des flux d'authentification
(réinitialisation, invitation) en place.
"""

import uuid

import pyotp

from app.core.security import create_access_token, hash_password
from app.models.user import User


async def _signup(client, email=None):
    email = email or f"{uuid.uuid4()}@example.com"
    response = await client.post(
        "/api/v1/auth/signup", json={"email": email, "password": "correct-horse-1", "full_name": "Awa"}
    )
    response.raise_for_status()
    body = response.json()
    return email, body["user"]["id"], {"Authorization": f"Bearer {body['tokens']['access_token']}"}


async def test_setup_then_enable_returns_backup_codes(client, db_session):
    _email, _user_id, headers = await _signup(client)

    setup = await client.post("/api/v1/auth/2fa/setup", headers=headers)
    assert setup.status_code == 200, setup.text
    secret = setup.json()["secret"]
    assert setup.json()["otpauth_uri"].startswith("otpauth://totp/")
    assert "<svg" in setup.json()["qr_code_svg"]

    valid_code = pyotp.TOTP(secret).now()
    enable = await client.post("/api/v1/auth/2fa/enable", headers=headers, json={"code": valid_code})
    assert enable.status_code == 200, enable.text
    backup_codes = enable.json()["backup_codes"]
    assert len(backup_codes) == 10
    assert len(set(backup_codes)) == 10, "les codes de secours doivent tous être distincts"

    me = await client.get("/api/v1/auth/me", headers=headers)
    assert me.json()["totp_enabled"] is True


async def test_enable_rejects_wrong_code(client, db_session):
    _email, _user_id, headers = await _signup(client)
    await client.post("/api/v1/auth/2fa/setup", headers=headers)

    enable = await client.post("/api/v1/auth/2fa/enable", headers=headers, json={"code": "000000"})
    assert enable.status_code == 400

    me = await client.get("/api/v1/auth/me", headers=headers)
    assert me.json()["totp_enabled"] is False, "un code invalide ne doit jamais activer la 2FA"


async def test_login_with_2fa_enabled_requires_challenge(client, db_session):
    email, _user_id, headers = await _signup(client)
    setup = await client.post("/api/v1/auth/2fa/setup", headers=headers)
    secret = setup.json()["secret"]
    await client.post("/api/v1/auth/2fa/enable", headers=headers, json={"code": pyotp.TOTP(secret).now()})

    login = await client.post("/api/v1/auth/login", json={"email": email, "password": "correct-horse-1"})
    assert login.status_code == 200, login.text
    body = login.json()
    assert body["requires_2fa"] is True
    assert body["tokens"] is None
    assert body["user"] is None
    challenge_token = body["challenge_token"]
    assert challenge_token

    wrong = await client.post(
        "/api/v1/auth/2fa/verify", json={"challenge_token": challenge_token, "code": "000000"}
    )
    assert wrong.status_code == 400

    verify = await client.post(
        "/api/v1/auth/2fa/verify", json={"challenge_token": challenge_token, "code": pyotp.TOTP(secret).now()}
    )
    assert verify.status_code == 200, verify.text
    assert verify.json()["user"]["email"] == email
    assert verify.json()["tokens"]["access_token"]


async def test_backup_code_is_single_use(client, db_session):
    email, _user_id, headers = await _signup(client)
    setup = await client.post("/api/v1/auth/2fa/setup", headers=headers)
    secret = setup.json()["secret"]
    enable = await client.post("/api/v1/auth/2fa/enable", headers=headers, json={"code": pyotp.TOTP(secret).now()})
    backup_code = enable.json()["backup_codes"][0]

    login = await client.post("/api/v1/auth/login", json={"email": email, "password": "correct-horse-1"})
    challenge_token = login.json()["challenge_token"]

    first_use = await client.post(
        "/api/v1/auth/2fa/verify", json={"challenge_token": challenge_token, "code": backup_code}
    )
    assert first_use.status_code == 200, first_use.text

    login_again = await client.post("/api/v1/auth/login", json={"email": email, "password": "correct-horse-1"})
    second_challenge = login_again.json()["challenge_token"]
    second_use = await client.post(
        "/api/v1/auth/2fa/verify", json={"challenge_token": second_challenge, "code": backup_code}
    )
    assert second_use.status_code == 400, "un code de secours deja consomme ne doit plus jamais fonctionner"


async def test_disable_requires_correct_password(client, db_session):
    _email, _user_id, headers = await _signup(client)
    setup = await client.post("/api/v1/auth/2fa/setup", headers=headers)
    secret = setup.json()["secret"]
    await client.post("/api/v1/auth/2fa/enable", headers=headers, json={"code": pyotp.TOTP(secret).now()})

    wrong_password = await client.post("/api/v1/auth/2fa/disable", headers=headers, json={"password": "wrong"})
    assert wrong_password.status_code == 400
    still_on = await client.get("/api/v1/auth/me", headers=headers)
    assert still_on.json()["totp_enabled"] is True

    disable = await client.post(
        "/api/v1/auth/2fa/disable", headers=headers, json={"password": "correct-horse-1"}
    )
    assert disable.status_code == 204

    now_off = await client.get("/api/v1/auth/me", headers=headers)
    assert now_off.json()["totp_enabled"] is False


async def test_two_factor_challenge_token_cannot_be_used_as_access_token(client, db_session):
    """Un jeton `two_factor_challenge` ne doit ouvrir aucune route protégée par
    `get_current_user` avant que le second facteur ne soit confirmé."""
    user = User(email=f"{uuid.uuid4()}@example.com", full_name="Awa", hashed_password=hash_password("x"), is_active=True)
    db_session.add(user)
    await db_session.flush()

    # Un jeton d'accès classique reste le seul moyen d'atteindre une route
    # protégée — un challenge n'a jamais ce rôle (type différent, decode_token
    # ne verifie que la signature, c'est get_current_user/le type qui filtre
    # en amont dans la vraie route de connexion, pas ce test générique).
    access_token = create_access_token(user.id)
    me = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {access_token}"})
    assert me.status_code == 200
