"""Téléversement repris par morceaux (cahier des charges §11.3 : « Les photos
partent en arrière-plan, compressées, et reprennent après coupure sans
repartir de zéro. »). Test au niveau HTTP : c'est la séquence complète
(ouverture, morceaux, reprise, finalisation) qui prouve la propriété, pas un
appel de service isolé.
"""

import uuid

import pytest


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


async def test_resumed_upload_assembles_identical_bytes(client):
    org_id, record_id, headers = await _create_org_and_vehicle_record(client)
    base = f"/api/v1/organizations/{org_id}/records/{record_id}/documents/uploads"

    chunk_a = b"A" * 10
    chunk_b = b"B" * 7
    original = chunk_a + chunk_b
    session_id = str(uuid.uuid4())

    create = await client.post(
        base,
        headers=headers,
        json={
            "id": session_id, "field_key": "carte_grise", "filename": "photo.jpg",
            "content_type": "image/jpeg", "total_bytes": len(original), "chunk_size": 10,
        },
    )
    assert create.status_code == 201, create.text
    assert create.json()["chunks_received"] == []

    first_chunk = await client.put(f"{base}/{session_id}/chunks/0", headers=headers, content=chunk_a)
    assert first_chunk.status_code == 200, first_chunk.text
    assert first_chunk.json()["chunks_received"] == [0]

    # "Coupure" : le client revient plus tard et interroge l'état avant de reprendre.
    status_check = await client.get(f"{base}/{session_id}", headers=headers)
    assert status_check.json()["chunks_received"] == [0], "le morceau déjà reçu ne doit pas être redemandé"

    second_chunk = await client.put(f"{base}/{session_id}/chunks/1", headers=headers, content=chunk_b)
    assert second_chunk.status_code == 200, second_chunk.text
    assert sorted(second_chunk.json()["chunks_received"]) == [0, 1]

    complete = await client.post(f"{base}/{session_id}/complete", headers=headers)
    assert complete.status_code == 200, complete.text
    body = complete.json()
    assert body["filename"] == "photo.jpg"
    assert body["url"]

    # Le contenu assemblé doit être exactement la concaténation dans l'ordre —
    # vérifié en re-téléchargeant via l'URL signée plutôt qu'en inspectant le disque.
    download = await client.get(body["url"])
    assert download.content == original


async def test_complete_without_all_chunks_fails(client):
    org_id, record_id, headers = await _create_org_and_vehicle_record(client)
    base = f"/api/v1/organizations/{org_id}/records/{record_id}/documents/uploads"
    session_id = str(uuid.uuid4())

    await client.post(
        base, headers=headers,
        json={"id": session_id, "filename": "x.jpg", "content_type": "image/jpeg", "total_bytes": 20, "chunk_size": 10},
    )
    await client.put(f"{base}/{session_id}/chunks/0", headers=headers, content=b"0" * 10)
    # chunk 1 jamais envoyé

    complete = await client.post(f"{base}/{session_id}/complete", headers=headers)
    assert complete.status_code == 400
    assert "manquant" in complete.json()["detail"].lower()


async def test_complete_is_idempotent_on_resubmission(client):
    org_id, record_id, headers = await _create_org_and_vehicle_record(client)
    base = f"/api/v1/organizations/{org_id}/records/{record_id}/documents/uploads"
    session_id = str(uuid.uuid4())

    await client.post(
        base, headers=headers,
        json={"id": session_id, "filename": "x.jpg", "content_type": "image/jpeg", "total_bytes": 5, "chunk_size": 5},
    )
    await client.put(f"{base}/{session_id}/chunks/0", headers=headers, content=b"hello")

    first = await client.post(f"{base}/{session_id}/complete", headers=headers)
    second = await client.post(f"{base}/{session_id}/complete", headers=headers)
    assert first.status_code == 200 and second.status_code == 200
    assert first.json()["id"] == second.json()["id"], "une resoumission ne doit jamais créer un second document"


async def test_reopening_an_existing_session_id_resumes_instead_of_duplicating(client):
    org_id, record_id, headers = await _create_org_and_vehicle_record(client)
    base = f"/api/v1/organizations/{org_id}/records/{record_id}/documents/uploads"
    session_id = str(uuid.uuid4())
    payload = {
        "id": session_id, "filename": "x.jpg", "content_type": "image/jpeg", "total_bytes": 5, "chunk_size": 5,
    }

    await client.post(base, headers=headers, json=payload)
    await client.put(f"{base}/{session_id}/chunks/0", headers=headers, content=b"hello")

    # Le client rouvre l'app après une coupure et "recrée" la même session (même id).
    reopened = await client.post(base, headers=headers, json=payload)
    assert reopened.status_code == 201
    assert reopened.json()["chunks_received"] == [0], "la reprise retrouve le morceau déjà envoyé, pas une session vide"


@pytest.mark.parametrize("chunk_size", [6 * 1024 * 1024])
async def test_chunk_size_above_limit_is_rejected(client, chunk_size):
    org_id, record_id, headers = await _create_org_and_vehicle_record(client)
    base = f"/api/v1/organizations/{org_id}/records/{record_id}/documents/uploads"

    create = await client.post(
        base, headers=headers,
        json={
            "id": str(uuid.uuid4()), "filename": "x.jpg", "content_type": "image/jpeg",
            "total_bytes": chunk_size, "chunk_size": chunk_size,
        },
    )
    assert create.status_code == 400
