"""Modifier ou archiver une fiche, et modifier une organisation, renvoyaient une
erreur 500 (`MissingGreenlet`) : `TimestampMixin.updated_at` utilisait un
`onupdate` calculé côté SQL (`func.now()`), qui laisse la colonne "expirée"
après l'UPDATE — sa relecture dans la même requête (pour sérialiser la réponse
JSON) déclenchait un rechargement hors du flux async attendu par SQLAlchemy.
Trouvé en testant le frontend contre le backend réel, jamais par les tests
existants (qui partagent une session et ne retraversent jamais cette
expiration). Ce fichier teste le chemin HTTP complet, comme les autres bugs de
ce type découverts dans ce projet (voir test_documents.py, test_search_and_io.py).
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
    return org_id, model_id, record.json()["id"], headers


async def test_update_record_returns_200_with_fresh_updated_at(client):
    org_id, _model_id, record_id, headers = await _create_org_and_vehicle_record(client)

    response = await client.patch(
        f"/api/v1/organizations/{org_id}/records/{record_id}",
        headers=headers,
        json={"data": {"marque": "Toyota"}},
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["data"]["marque"] == "Toyota"
    assert body["updated_at"]


async def test_archive_record_returns_200_with_fresh_updated_at(client):
    org_id, _model_id, record_id, headers = await _create_org_and_vehicle_record(client)

    response = await client.post(f"/api/v1/organizations/{org_id}/records/{record_id}/archive", headers=headers)

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["is_archived"] is True
    assert body["archived_at"]


async def test_update_organization_returns_200_with_fresh_updated_at(client):
    org_id, _model_id, _record_id, headers = await _create_org_and_vehicle_record(client)

    response = await client.patch(
        f"/api/v1/organizations/{org_id}",
        headers=headers,
        json={"sector": "Logistique"},
    )

    assert response.status_code == 200, response.text
    assert response.json()["sector"] == "Logistique"
