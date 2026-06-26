from fastapi.testclient import TestClient

from tests.conftest import register_and_login


def _create_bank(client: TestClient, token: str, name: str = "Exam Bank") -> int:
    response = client.post(
        "/api/question-banks",
        headers={"Authorization": f"Bearer {token}"},
        json={"name": name, "description": "Question set"},
    )
    assert response.status_code == 201
    return int(response.json()["id"])


def _single_choice_payload(stem: str = "What is 2 + 2?") -> dict[str, object]:
    return {
        "type": "single_choice",
        "stem": stem,
        "answer_text": "B",
        "explanation": "2 + 2 equals 4.",
        "difficulty": "normal",
        "tags": ["math", "arithmetic"],
        "source": "manual",
        "options": [
            {"label": "A", "content": "3", "is_correct": False, "sort_order": 1},
            {"label": "B", "content": "4", "is_correct": True, "sort_order": 2},
            {"label": "C", "content": "5", "is_correct": False, "sort_order": 3},
            {"label": "D", "content": "6", "is_correct": False, "sort_order": 4},
        ],
    }


def test_question_crud_for_owner(client: TestClient) -> None:
    token = register_and_login(client, "alice", "alice@example.com")
    headers = {"Authorization": f"Bearer {token}"}
    bank_id = _create_bank(client, token)

    create_response = client.post(
        f"/api/question-banks/{bank_id}/questions",
        headers=headers,
        json=_single_choice_payload(),
    )
    assert create_response.status_code == 201
    created = create_response.json()
    question_id = created["id"]
    assert created["bank_id"] == bank_id
    assert created["stem"] == "What is 2 + 2?"
    assert len(created["options"]) == 4

    list_response = client.get(f"/api/question-banks/{bank_id}/questions", headers=headers)
    assert list_response.status_code == 200
    listed = list_response.json()
    assert len(listed) == 1
    assert listed[0]["id"] == question_id
    assert listed[0]["options"][1]["is_correct"] is True

    update_response = client.put(
        f"/api/questions/{question_id}",
        headers=headers,
        json={"stem": "What is 3 + 3?"},
    )
    assert update_response.status_code == 200
    assert update_response.json()["stem"] == "What is 3 + 3?"

    delete_response = client.delete(f"/api/questions/{question_id}", headers=headers)
    assert delete_response.status_code == 204

    list_after_delete_response = client.get(f"/api/question-banks/{bank_id}/questions", headers=headers)
    assert list_after_delete_response.status_code == 200
    assert list_after_delete_response.json() == []

    delete_again_response = client.delete(f"/api/questions/{question_id}", headers=headers)
    assert delete_again_response.status_code == 404


def test_non_owner_cannot_access_or_modify_questions(client: TestClient) -> None:
    alice_token = register_and_login(client, "alice", "alice@example.com")
    bob_token = register_and_login(client, "bob", "bob@example.com")
    alice_headers = {"Authorization": f"Bearer {alice_token}"}
    bob_headers = {"Authorization": f"Bearer {bob_token}"}
    bank_id = _create_bank(client, alice_token, name="Alice Bank")

    create_response = client.post(
        f"/api/question-banks/{bank_id}/questions",
        headers=alice_headers,
        json=_single_choice_payload(),
    )
    assert create_response.status_code == 201
    question_id = create_response.json()["id"]

    assert client.get(f"/api/question-banks/{bank_id}/questions", headers=bob_headers).status_code == 404
    assert (
        client.post(
            f"/api/question-banks/{bank_id}/questions",
            headers=bob_headers,
            json=_single_choice_payload("Bob tries to add one"),
        ).status_code
        == 404
    )
    assert client.put(f"/api/questions/{question_id}", headers=bob_headers, json={"stem": "Not yours"}).status_code == 404
    assert client.delete(f"/api/questions/{question_id}", headers=bob_headers).status_code == 404


def test_duplicate_question_option_labels_return_400(client: TestClient) -> None:
    token = register_and_login(client, "alice", "alice@example.com")
    headers = {"Authorization": f"Bearer {token}"}
    bank_id = _create_bank(client, token)
    payload = _single_choice_payload()
    payload["options"] = [
        {"label": "A", "content": "3", "sort_order": 1},
        {"label": "A", "content": "4", "is_correct": True, "sort_order": 2},
    ]

    response = client.post(f"/api/question-banks/{bank_id}/questions", headers=headers, json=payload)

    assert response.status_code == 400
