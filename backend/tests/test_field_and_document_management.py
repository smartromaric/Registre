"""Gestion des champs après création (modifier, supprimer, réordonner) et
relecture des documents déjà téléversés — deux lacunes signalées en testant le
frontend contre le backend réel : le constructeur de modèles ne pouvait éditer
que le prochain champ à ajouter, jamais un champ existant, et un document
téléversé ne pouvait plus jamais être retrouvé une fois son URL signée expirée.
"""

import uuid


async def _create_org_and_model(client):
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
    return org_id, model.json(), headers


async def test_update_field_changes_label_but_keeps_key_and_type(client):
    org_id, model, headers = await _create_org_and_model(client)
    field = next(f for f in model["field_definitions"] if f["key"] == "marque")

    response = await client.patch(
        f"/api/v1/organizations/{org_id}/model-definitions/{model['id']}/fields/{field['id']}",
        headers=headers,
        json={"label": "Marque du véhicule", "show_in_list": False},
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["label"] == "Marque du véhicule"
    assert body["key"] == "marque"
    assert body["field_type"] == "text_short"
    assert body["show_in_list"] is False


async def test_delete_field_removes_it_but_not_the_title_field(client):
    org_id, model, headers = await _create_org_and_model(client)
    marque = next(f for f in model["field_definitions"] if f["key"] == "marque")
    title_field = next(f for f in model["field_definitions"] if f["key"] == model["title_field_key"])

    ok = await client.delete(
        f"/api/v1/organizations/{org_id}/model-definitions/{model['id']}/fields/{marque['id']}", headers=headers
    )
    assert ok.status_code == 204

    blocked = await client.delete(
        f"/api/v1/organizations/{org_id}/model-definitions/{model['id']}/fields/{title_field['id']}", headers=headers
    )
    assert blocked.status_code == 409

    refreshed = await client.get(f"/api/v1/organizations/{org_id}/model-definitions/{model['id']}", headers=headers)
    keys = {f["key"] for f in refreshed.json()["field_definitions"]}
    assert "marque" not in keys
    assert model["title_field_key"] in keys


async def test_reorder_fields(client):
    org_id, model, headers = await _create_org_and_model(client)
    ids = [f["id"] for f in model["field_definitions"]]
    reversed_ids = list(reversed(ids))

    response = await client.put(
        f"/api/v1/organizations/{org_id}/model-definitions/{model['id']}/fields/reorder",
        headers=headers,
        json={"field_ids": reversed_ids},
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert [f["id"] for f in body] == reversed_ids
    assert [f["position"] for f in body] == list(range(len(body)))


async def test_list_and_refetch_documents(client):
    org_id, model, headers = await _create_org_and_model(client)
    record = await client.post(
        f"/api/v1/organizations/{org_id}/model-definitions/{model['id']}/records",
        headers=headers,
        json={"data": {"immatriculation": "CE 456 AB"}},
    )
    record_id = record.json()["id"]

    upload = await client.post(
        f"/api/v1/organizations/{org_id}/records/{record_id}/documents",
        headers=headers,
        files={"file": ("carte_grise.pdf", b"contenu factice", "application/pdf")},
        data={"field_key": "carte_grise"},
    )
    document_id = upload.json()["id"]

    listing = await client.get(f"/api/v1/organizations/{org_id}/records/{record_id}/documents", headers=headers)
    assert listing.status_code == 200
    assert len(listing.json()) == 1
    assert listing.json()[0]["id"] == document_id

    refetched = await client.get(
        f"/api/v1/organizations/{org_id}/records/{record_id}/documents/{document_id}", headers=headers
    )
    assert refetched.status_code == 200
    assert refetched.json()["url"], "une URL signée fraîche doit être renvoyée même après le téléversement initial"
