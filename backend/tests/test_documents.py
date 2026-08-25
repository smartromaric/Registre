"""Téléversement de documents (cahier des charges §5.2). Test au niveau HTTP —
pas seulement au niveau service — car c'est justement la sérialisation de la
réponse (URL signée ajoutée à un objet ORM qui n'a pas cet attribut) qui a
été prise en défaut la première fois que ce chemin a tourné en conditions
réelles plutôt que dans un test qui partage une session.
"""

import uuid


async def _create_org_and_vehicle_record(client):
    signup = await client.post(
        "/api/v1/auth/signup",
        json={"email": f"{uuid.uuid4()}@example.com", "password": "correct-horse-battery", "full_name": "Awa"},
    )
    token = signup.json()["tokens"]["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    org = await client.post(
        "/api/v1/auth/organizations",
        json={"name": "Transports Awa", "country_code": "CM", "sector": "Transport"},
        headers=headers,
    )
    org_id = org.json()["id"]

    model = await client.post(f"/api/v1/organizations/{org_id}/templates/vehicle/activate", headers=headers)
    model_id = model.json()["id"]

    record = await client.post(
        f"/api/v1/organizations/{org_id}/model-definitions/{model_id}/records",
        json={"data": {"immatriculation": "CE 456 AB"}},
        headers=headers,
    )
    return org_id, record.json()["id"], headers


async def test_upload_document_returns_a_signed_url(client):
    org_id, record_id, headers = await _create_org_and_vehicle_record(client)

    response = await client.post(
        f"/api/v1/organizations/{org_id}/records/{record_id}/documents",
        headers=headers,
        files={"file": ("carte_grise.pdf", b"%PDF-1.4 contenu factice", "application/pdf")},
        data={"field_key": "carte_grise"},
    )

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["field_key"] == "carte_grise"
    assert body["filename"] == "carte_grise.pdf"
    assert body["url"], "une URL signée doit être renvoyée (§14.1)"
