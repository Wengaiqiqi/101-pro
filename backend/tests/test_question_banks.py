from fastapi.testclient import TestClient

from tests.conftest import register_and_login


def test_users_only_see_their_own_question_banks(client: TestClient) -> None:
    alice_token = register_and_login(client, "alice", "alice@example.com")
    bob_token = register_and_login(client, "bob", "bob@example.com")

    create_response = client.post(
        "/api/question-banks",
        headers={"Authorization": f"Bearer {alice_token}"},
        json={"name": "Alice Bank", "description": "Private AI notes"},
    )
    assert create_response.status_code == 201

    bob_response = client.get("/api/question-banks", headers={"Authorization": f"Bearer {bob_token}"})
    assert bob_response.status_code == 200
    assert bob_response.json() == []


def test_question_bank_owner_can_update_and_delete(client: TestClient) -> None:
    token = register_and_login(client, "alice", "alice@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    create_response = client.post(
        "/api/question-banks",
        headers=headers,
        json={"name": "Original Bank", "description": "Draft"},
    )
    assert create_response.status_code == 201
    bank_id = create_response.json()["id"]

    update_response = client.put(
        f"/api/question-banks/{bank_id}",
        headers=headers,
        json={"name": "Updated Bank", "description": "Ready", "visibility": "private"},
    )
    assert update_response.status_code == 200
    updated = update_response.json()
    assert updated["name"] == "Updated Bank"
    assert updated["description"] == "Ready"

    delete_response = client.delete(f"/api/question-banks/{bank_id}", headers=headers)
    assert delete_response.status_code == 204

    get_response = client.get(f"/api/question-banks/{bank_id}", headers=headers)
    assert get_response.status_code == 404


def test_question_bank_update_rejects_null_name_and_preserves_existing_data(client: TestClient) -> None:
    token = register_and_login(client, "alice", "alice@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    create_response = client.post(
        "/api/question-banks",
        headers=headers,
        json={"name": "Original Bank", "description": "Draft"},
    )
    assert create_response.status_code == 201
    bank_id = create_response.json()["id"]

    update_response = client.put(f"/api/question-banks/{bank_id}", headers=headers, json={"name": None})
    assert update_response.status_code == 422

    get_response = client.get(f"/api/question-banks/{bank_id}", headers=headers)
    assert get_response.status_code == 200
    persisted = get_response.json()
    assert persisted["name"] == "Original Bank"
    assert persisted["description"] == "Draft"


def test_non_owner_get_update_and_delete_question_bank_returns_403(client: TestClient) -> None:
    alice_token = register_and_login(client, "alice", "alice@example.com")
    bob_token = register_and_login(client, "bob", "bob@example.com")

    create_response = client.post(
        "/api/question-banks",
        headers={"Authorization": f"Bearer {alice_token}"},
        json={"name": "Alice Bank"},
    )
    assert create_response.status_code == 201
    bank_id = create_response.json()["id"]
    bob_headers = {"Authorization": f"Bearer {bob_token}"}

    assert client.get(f"/api/question-banks/{bank_id}", headers=bob_headers).status_code == 403
    assert client.put(f"/api/question-banks/{bank_id}", headers=bob_headers, json={"name": "Mine"}).status_code == 403
    assert client.delete(f"/api/question-banks/{bank_id}", headers=bob_headers).status_code == 403


def test_user_can_fork_non_empty_public_bank(client: TestClient) -> None:
    owner_token = register_and_login(client, "owner", "owner@example.com")
    forker_token = register_and_login(client, "forker", "forker@example.com")
    owner_headers = {"Authorization": f"Bearer {owner_token}"}
    forker_headers = {"Authorization": f"Bearer {forker_token}"}

    bank_response = client.post(
        "/api/question-banks",
        headers=owner_headers,
        json={"name": "Shared Bank"},
    )
    bank_id = bank_response.json()["id"]
    assert client.put(
        f"/api/question-banks/{bank_id}",
        headers=owner_headers,
        json={"visibility": "public"},
    ).status_code == 200
    assert client.post(
        f"/api/question-banks/{bank_id}/questions",
        headers=owner_headers,
        json={
            "type": "fill_blank",
            "stem": "2 + 2 = ?",
            "answer_text": "4",
            "options": [],
        },
    ).status_code == 201

    fork_response = client.post(f"/api/question-banks/{bank_id}/fork", headers=forker_headers)

    assert fork_response.status_code == 201
    forked_id = fork_response.json()["id"]
    questions = client.get(f"/api/question-banks/{forked_id}/questions", headers=forker_headers).json()
    assert [(item["stem"], item["answer_text"]) for item in questions] == [("2 + 2 = ?", "4")]
