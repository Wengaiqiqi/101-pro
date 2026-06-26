from fastapi.testclient import TestClient

from app.models.practice import WrongQuestion
from app.services.practice_service import is_answer_correct, normalize_answer
from tests.conftest import register_and_login


class _Question:
    def __init__(self, type_: str, answer_text: str) -> None:
        self.type = type_
        self.answer_text = answer_text


def _headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _create_bank(client: TestClient, token: str, name: str = "Practice Bank") -> int:
    response = client.post(
        "/api/question-banks",
        headers=_headers(token),
        json={"name": name, "description": "Practice set"},
    )
    assert response.status_code == 201
    return int(response.json()["id"])


def _create_question(
    client: TestClient,
    token: str,
    bank_id: int,
    *,
    type_: str = "single_choice",
    answer_text: str = "B",
    stem: str = "Pick the right option",
) -> int:
    response = client.post(
        f"/api/question-banks/{bank_id}/questions",
        headers=_headers(token),
        json={
            "type": type_,
            "stem": stem,
            "answer_text": answer_text,
            "explanation": "Because it is correct.",
            "difficulty": "normal",
            "tags": ["practice"],
            "source": "manual",
            "options": [
                {"label": "A", "content": "First", "sort_order": 1},
                {"label": "B", "content": "Second", "is_correct": "B" in answer_text, "sort_order": 2},
                {"label": "C", "content": "Third", "is_correct": "C" in answer_text, "sort_order": 3},
            ],
        },
    )
    assert response.status_code == 201
    return int(response.json()["id"])


def test_normalize_answer_and_scoring() -> None:
    assert normalize_answer("  B ") == ["b"]
    assert normalize_answer([" B ", "a", " "]) == ["a", "b"]
    assert normalize_answer("A|B") == ["a|b"]
    assert is_answer_correct(_Question("single_choice", "B"), " b ") is True
    assert is_answer_correct(_Question("single_choice", "B"), "A") is False

    assert is_answer_correct(_Question("multiple_choice", "A|C"), ["c", " a "]) is True
    assert is_answer_correct(_Question("multiple_choice", "A C"), ["c", " a "]) is True
    assert is_answer_correct(_Question("multiple_choice", "A,C"), "C|A") is True
    assert is_answer_correct(_Question("multiple_choice", "A|C"), "A") is False

    assert is_answer_correct(_Question("fill_blank", "New York|NYC"), "  new   york ") is True
    assert is_answer_correct(_Question("short_answer", "New York|NYC"), "nyc") is True
    assert is_answer_correct(_Question("fill_blank", "New York|NYC"), "Boston") is False


def test_practice_session_api_flow_and_owner_scope(client: TestClient) -> None:
    alice_token = register_and_login(client, "alice", "alice@example.com")
    bob_token = register_and_login(client, "bob", "bob@example.com")
    alice_headers = _headers(alice_token)
    bob_headers = _headers(bob_token)

    bank_id = _create_bank(client, alice_token)
    wrong_question_id = _create_question(client, alice_token, bank_id, answer_text="B", stem="Single choice")
    correct_question_id = _create_question(
        client,
        alice_token,
        bank_id,
        type_="multiple_choice",
        answer_text="A|C",
        stem="Multiple choice",
    )
    extra_question_id = _create_question(client, alice_token, bank_id, answer_text="C", stem="Extra question")

    create_response = client.post(
        "/api/practice-sessions",
        headers=alice_headers,
        json={"bank_id": bank_id, "mode": "normal", "question_count": 2},
    )
    assert create_response.status_code == 201
    session = create_response.json()
    session_id = session["id"]
    assert session["user_id"] != 0
    assert session["bank_id"] == bank_id
    assert session["question_count"] == 2
    assert session["answers"] == []

    get_response = client.get(f"/api/practice-sessions/{session_id}", headers=alice_headers)
    assert get_response.status_code == 200
    assert get_response.json()["id"] == session_id
    assert get_response.json()["answers"] == []

    wrong_answer_response = client.post(
        f"/api/practice-sessions/{session_id}/answers",
        headers=alice_headers,
        json={"question_id": wrong_question_id, "user_answer": "A", "elapsed_seconds": 5},
    )
    assert wrong_answer_response.status_code == 201
    wrong_answer = wrong_answer_response.json()
    assert wrong_answer["session_id"] == session_id
    assert wrong_answer["question_id"] == wrong_question_id
    assert wrong_answer["user_answer_json"] == {"value": "A"}
    assert wrong_answer["is_correct"] is False

    wrong_answer_update_response = client.post(
        f"/api/practice-sessions/{session_id}/answers",
        headers=alice_headers,
        json={"question_id": wrong_question_id, "user_answer": "C", "elapsed_seconds": 7},
    )
    assert wrong_answer_update_response.status_code == 200
    assert wrong_answer_update_response.json()["id"] == wrong_answer["id"]
    assert wrong_answer_update_response.json()["elapsed_seconds"] == 7

    correct_answer_response = client.post(
        f"/api/practice-sessions/{session_id}/answers",
        headers=alice_headers,
        json={"question_id": correct_question_id, "user_answer": ["C", "A"], "elapsed_seconds": 3},
    )
    assert correct_answer_response.status_code == 201
    assert correct_answer_response.json()["is_correct"] is True

    wrong_questions_response = client.get("/api/wrong-questions", headers=alice_headers)
    assert wrong_questions_response.status_code == 200
    wrong_questions = wrong_questions_response.json()
    assert len(wrong_questions) == 1
    assert wrong_questions[0]["question_id"] == wrong_question_id
    assert wrong_questions[0]["wrong_count"] == 1
    assert wrong_questions[0]["mastery_status"] == "unmastered"
    wrong_question_row_id = wrong_questions[0]["id"]

    over_limit_response = client.post(
        f"/api/practice-sessions/{session_id}/answers",
        headers=alice_headers,
        json={"question_id": extra_question_id, "user_answer": "C", "elapsed_seconds": 3},
    )
    assert over_limit_response.status_code == 400
    assert over_limit_response.json()["detail"] == "Practice session question limit reached"

    finish_response = client.post(f"/api/practice-sessions/{session_id}/finish", headers=alice_headers)
    assert finish_response.status_code == 200
    finished = finish_response.json()
    assert finished["finished_at"] is not None
    assert finished["score"] == 1
    assert finished["accuracy"] == 50
    assert len(finished["answers"]) == 2

    answer_after_finish_response = client.post(
        f"/api/practice-sessions/{session_id}/answers",
        headers=alice_headers,
        json={"question_id": wrong_question_id, "user_answer": "B", "elapsed_seconds": 5},
    )
    assert answer_after_finish_response.status_code == 400
    assert answer_after_finish_response.json()["detail"] == "Practice session is already finished"

    mastered_response = client.post(f"/api/wrong-questions/{wrong_question_row_id}/mastered", headers=alice_headers)
    assert mastered_response.status_code == 200
    assert mastered_response.json()["mastery_status"] == "mastered"

    assert client.get(f"/api/practice-sessions/{session_id}", headers=bob_headers).status_code == 404
    assert (
        client.post(
            f"/api/practice-sessions/{session_id}/answers",
            headers=bob_headers,
            json={"question_id": wrong_question_id, "user_answer": "B"},
        ).status_code
        == 404
    )
    assert client.post(f"/api/practice-sessions/{session_id}/finish", headers=bob_headers).status_code == 404
    assert client.post(f"/api/wrong-questions/{wrong_question_row_id}/mastered", headers=bob_headers).status_code == 404
    assert client.get("/api/wrong-questions", headers=bob_headers).json() == []

    db = client.app.state.testing_session_local()
    try:
        rows = db.query(WrongQuestion).all()
        assert len(rows) == 1
        assert rows[0].question_id == wrong_question_id
    finally:
        db.close()
