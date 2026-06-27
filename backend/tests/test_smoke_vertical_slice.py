from fastapi.testclient import TestClient

from tests.conftest import register_and_login


def test_vertical_slice_register_bank_question_and_practice(client: TestClient) -> None:
    token = register_and_login(client, "smoke", "smoke@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    bank_response = client.post(
        "/api/question-banks",
        headers=headers,
        json={"name": "Smoke Bank", "description": ""},
    )
    assert bank_response.status_code == 201
    bank_id = bank_response.json()["id"]

    question_response = client.post(
        f"/api/question-banks/{bank_id}/questions",
        headers=headers,
        json={
            "type": "single_choice",
            "stem": "Which option is correct?",
            "answer_text": "A",
            "explanation": "A is marked correct.",
            "difficulty": "easy",
            "tags": ["smoke"],
            "options": [
                {"label": "A", "content": "Correct", "is_correct": True, "sort_order": 1},
                {"label": "B", "content": "Wrong", "is_correct": False, "sort_order": 2},
            ],
        },
    )
    assert question_response.status_code == 201
    question_id = question_response.json()["id"]

    session_response = client.post(
        "/api/practice-sessions",
        headers=headers,
        json={"bank_id": bank_id, "mode": "normal", "question_count": 1},
    )
    assert session_response.status_code == 201
    session_id = session_response.json()["id"]

    answer_response = client.post(
        f"/api/practice-sessions/{session_id}/answers",
        headers=headers,
        json={"question_id": question_id, "user_answer": "A", "elapsed_seconds": 3},
    )
    assert answer_response.status_code == 201
    assert answer_response.json()["is_correct"] is True

    finish_response = client.post(f"/api/practice-sessions/{session_id}/finish", headers=headers)
    assert finish_response.status_code == 200
    assert finish_response.json()["score"] == 1
    assert finish_response.json()["accuracy"] == 100
