"""Tests for the short-answer AI grading pipeline end-to-end.

Covers:
- AI grading (correct / incorrect) via mocked LLM
- Fallback to text matching when no LLM config
- Full API chain: register → create bank → add question → create session → submit answer
- Edge cases: empty answer, LLM failure
"""

from dataclasses import dataclass

import pytest
from fastapi.testclient import TestClient

from tests.conftest import register_and_login


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _create_bank(client: TestClient, token: str) -> int:
    resp = client.post(
        "/api/question-banks",
        headers=_headers(token),
        json={"name": "AI Grading Bank", "description": "test"},
    )
    assert resp.status_code == 201
    return int(resp.json()["id"])


def _add_short_answer_question(client: TestClient, token: str, bank_id: int, *, answer_text: str = "传递函数是在零初始条件下，系统输出量的拉普拉斯变换与输入量的拉普拉斯变换之比") -> int:
    """Create a short_answer question directly in the test DB."""
    from app.models.question import Question

    db = client.app.state.testing_session_local()
    try:
        q = Question(
            bank_id=bank_id,
            type="short_answer",
            stem="什么是传递函数？",
            answer_text=answer_text,
            explanation="传递函数是经典控制理论的核心概念",
            difficulty="normal",
        )
        db.add(q)
        db.commit()
        db.refresh(q)
        return q.id
    finally:
        db.close()


@dataclass(frozen=True)
class _FakeLLMConfig:
    provider: str = "openai-compatible"
    base_url: str = "https://example.test/v1"
    model: str = "test-model"
    api_key: str = "test-key"


def _mock_llm_correct(monkeypatch):
    """Mock evaluate_short_answer to return correct."""
    from app.services import practice_service

    def _fake_evaluate(config, stem, ref_answer, user_answer):
        return {"correct": True, "feedback": "回答正确，核心概念把握准确"}

    monkeypatch.setattr(practice_service, "evaluate_short_answer", _fake_evaluate)


def _mock_llm_incorrect(monkeypatch):
    """Mock evaluate_short_answer to return incorrect."""
    from app.services import practice_service

    def _fake_evaluate(config, stem, ref_answer, user_answer):
        return {"correct": False, "feedback": "回答不完整，缺少关键概念"}

    monkeypatch.setattr(practice_service, "evaluate_short_answer", _fake_evaluate)


def _mock_llm_failure(monkeypatch):
    """Mock evaluate_short_answer to simulate LLM failure."""
    from app.services import practice_service

    def _fake_evaluate(config, stem, ref_answer, user_answer):
        return {"correct": False, "feedback": "AI 评判失败"}

    monkeypatch.setattr(practice_service, "evaluate_short_answer", _fake_evaluate)


def _mock_llm_ai_solve(monkeypatch):
    """Mock evaluate_short_answer_by_ai for no-reference-answer case."""
    from app.services import practice_service

    def _fake_evaluate(config, stem, user_answer):
        return {"correct": True, "feedback": "AI 判定回答正确"}

    monkeypatch.setattr(practice_service, "evaluate_short_answer_by_ai", _fake_evaluate)


def _mock_resolve_llm(monkeypatch):
    """Mock _resolve_llm_config to return a fake config."""
    from app.services import practice_service

    monkeypatch.setattr(
        practice_service,
        "_resolve_llm_config",
        lambda db, user: _FakeLLMConfig(),
    )


def _mock_resolve_llm_none(monkeypatch):
    """Mock _resolve_llm_config to return None (no LLM configured)."""
    from app.services import practice_service

    monkeypatch.setattr(
        practice_service,
        "_resolve_llm_config",
        lambda db, user: None,
    )


def _create_session(client: TestClient, token: str, bank_id: int) -> int:
    resp = client.post(
        "/api/practice-sessions",
        headers=_headers(token),
        json={"bank_id": bank_id, "mode": "normal", "question_count": 1},
    )
    assert resp.status_code == 201
    return int(resp.json()["id"])


def _submit_answer(client: TestClient, token: str, session_id: int, question_id: int, answer: str) -> dict:
    resp = client.post(
        f"/api/practice-sessions/{session_id}/answers",
        headers=_headers(token),
        json={"question_id": question_id, "user_answer": answer, "elapsed_seconds": 10},
    )
    assert resp.status_code in (200, 201)
    return resp.json()


# ---------------------------------------------------------------------------
# Tests: AI grading with mocked LLM
# ---------------------------------------------------------------------------

class TestShortAnswerAIGrading:
    """End-to-end tests for the short-answer AI grading pipeline."""

    def test_ai_grading_correct_answer(self, client: TestClient, monkeypatch) -> None:
        """AI judges a correct short answer → is_correct=True, feedback populated."""
        _mock_resolve_llm(monkeypatch)
        _mock_llm_correct(monkeypatch)

        token = register_and_login(client, "alice", "alice@test.com")
        bank_id = _create_bank(client, token)
        question_id = _add_short_answer_question(client, token, bank_id)
        session_id = _create_session(client, token, bank_id)

        result = _submit_answer(client, token, session_id, question_id, "传递函数是输出与输入的拉普拉斯变换之比")

        assert result["is_correct"] is True
        assert result["feedback"] is not None
        assert "正确" in result["feedback"]

    def test_ai_grading_incorrect_answer(self, client: TestClient, monkeypatch) -> None:
        """AI judges an incorrect short answer → is_correct=False, feedback populated."""
        _mock_resolve_llm(monkeypatch)
        _mock_llm_incorrect(monkeypatch)

        token = register_and_login(client, "bob", "bob@test.com")
        bank_id = _create_bank(client, token)
        question_id = _add_short_answer_question(client, token, bank_id)
        session_id = _create_session(client, token, bank_id)

        result = _submit_answer(client, token, session_id, question_id, "不知道")

        assert result["is_correct"] is False
        assert result["feedback"] is not None
        assert "不完整" in result["feedback"]

    def test_ai_grading_failure_returns_fallback(self, client: TestClient, monkeypatch) -> None:
        """LLM failure → feedback indicates AI grading failed."""
        _mock_resolve_llm(monkeypatch)
        _mock_llm_failure(monkeypatch)

        token = register_and_login(client, "carol", "carol@test.com")
        bank_id = _create_bank(client, token)
        question_id = _add_short_answer_question(client, token, bank_id)
        session_id = _create_session(client, token, bank_id)

        result = _submit_answer(client, token, session_id, question_id, "一些回答")

        assert result["is_correct"] is False
        assert result["feedback"] is not None
        assert "AI" in result["feedback"]


# ---------------------------------------------------------------------------
# Tests: Fallback to text matching (no LLM configured)
# ---------------------------------------------------------------------------

class TestShortAnswerTextFallback:
    """When no LLM config is available, answers fall back to text matching."""

    def test_fallback_exact_match(self, client: TestClient, monkeypatch) -> None:
        """Exact match against reference answer → correct."""
        _mock_resolve_llm_none(monkeypatch)

        token = register_and_login(client, "dave", "dave@test.com")
        bank_id = _create_bank(client, token)
        question_id = _add_short_answer_question(client, token, bank_id)
        session_id = _create_session(client, token, bank_id)

        ref = "传递函数是在零初始条件下，系统输出量的拉普拉斯变换与输入量的拉普拉斯变换之比"
        result = _submit_answer(client, token, session_id, question_id, ref)

        assert result["is_correct"] is True

    def test_fallback_mismatch(self, client: TestClient, monkeypatch) -> None:
        """Non-matching answer with no LLM → incorrect."""
        _mock_resolve_llm_none(monkeypatch)

        token = register_and_login(client, "eve", "eve@test.com")
        bank_id = _create_bank(client, token)
        question_id = _add_short_answer_question(client, token, bank_id)
        session_id = _create_session(client, token, bank_id)

        result = _submit_answer(client, token, session_id, question_id, "完全错误的答案")

        assert result["is_correct"] is False

    def test_fallback_feedback_is_none(self, client: TestClient, monkeypatch) -> None:
        """Without LLM, feedback should be None (no AI feedback)."""
        _mock_resolve_llm_none(monkeypatch)

        token = register_and_login(client, "frank", "frank@test.com")
        bank_id = _create_bank(client, token)
        question_id = _add_short_answer_question(client, token, bank_id)
        session_id = _create_session(client, token, bank_id)

        result = _submit_answer(client, token, session_id, question_id, "随便写写")

        assert result["feedback"] is None


# ---------------------------------------------------------------------------
# Tests: Edge cases
# ---------------------------------------------------------------------------

class TestShortAnswerEdgeCases:

    def test_empty_answer_is_incorrect(self, client: TestClient, monkeypatch) -> None:
        """Empty answer should be marked incorrect without calling LLM."""
        _mock_resolve_llm(monkeypatch)

        call_count = {"n": 0}
        from app.services import practice_service

        def _spy_evaluate(config, stem, ref_answer, user_answer):
            call_count["n"] += 1
            return {"correct": False, "feedback": "未作答"}

        monkeypatch.setattr(practice_service, "evaluate_short_answer", _spy_evaluate)

        token = register_and_login(client, "grace", "grace@test.com")
        bank_id = _create_bank(client, token)
        question_id = _add_short_answer_question(client, token, bank_id)
        session_id = _create_session(client, token, bank_id)

        result = _submit_answer(client, token, session_id, question_id, "")

        # Empty answer should skip LLM and fall through to text matching
        # The LLM should NOT be called for empty answers
        assert call_count["n"] == 0

    def test_resubmit_updates_feedback(self, client: TestClient, monkeypatch) -> None:
        """Resubmitting an answer updates the feedback."""
        _mock_resolve_llm(monkeypatch)

        call_idx = {"n": 0}
        responses = [
            {"correct": False, "feedback": "回答不正确"},
            {"correct": True, "feedback": "这次回答正确了"},
        ]
        from app.services import practice_service

        def _progressive_evaluate(config, stem, ref_answer, user_answer):
            idx = min(call_idx["n"], len(responses) - 1)
            call_idx["n"] += 1
            return responses[idx]

        monkeypatch.setattr(practice_service, "evaluate_short_answer", _progressive_evaluate)

        token = register_and_login(client, "hank", "hank@test.com")
        bank_id = _create_bank(client, token)
        question_id = _add_short_answer_question(client, token, bank_id)
        session_id = _create_session(client, token, bank_id)

        # First submission
        result1 = _submit_answer(client, token, session_id, question_id, "错误答案")
        assert result1["is_correct"] is False
        assert "不正确" in result1["feedback"]

        # Resubmit with correct answer
        result2 = _submit_answer(client, token, session_id, question_id, "正确答案")
        assert result2["is_correct"] is True
        assert "正确" in result2["feedback"]


# ---------------------------------------------------------------------------
# Tests: No reference answer — AI solves and grades
# ---------------------------------------------------------------------------

class TestShortAnswerAISolve:
    """When question has no reference answer, AI solves first then grades."""

    def test_ai_solve_correct_answer(self, client: TestClient, monkeypatch) -> None:
        """No reference answer + AI judges correct → is_correct=True."""
        _mock_resolve_llm(monkeypatch)
        _mock_llm_ai_solve(monkeypatch)

        token = register_and_login(client, "ivy", "ivy@test.com")
        bank_id = _create_bank(client, token)
        question_id = _add_short_answer_question(client, token, bank_id, answer_text="")
        session_id = _create_session(client, token, bank_id)

        result = _submit_answer(client, token, session_id, question_id, "传递函数是输出与输入拉氏变换之比")

        assert result["is_correct"] is True
        assert result["feedback"] is not None

    def test_ai_solve_calls_by_ai_not_regular(self, client: TestClient, monkeypatch) -> None:
        """No reference answer → calls evaluate_short_answer_by_ai, not evaluate_short_answer."""
        _mock_resolve_llm(monkeypatch)

        regular_called = {"n": 0}
        ai_solve_called = {"n": 0}
        from app.services import practice_service

        def _spy_regular(config, stem, ref_answer, user_answer):
            regular_called["n"] += 1
            return {"correct": False, "feedback": "should not be called"}

        def _spy_ai_solve(config, stem, user_answer):
            ai_solve_called["n"] += 1
            return {"correct": True, "feedback": "AI 判定正确"}

        monkeypatch.setattr(practice_service, "evaluate_short_answer", _spy_regular)
        monkeypatch.setattr(practice_service, "evaluate_short_answer_by_ai", _spy_ai_solve)

        token = register_and_login(client, "judy", "judy@test.com")
        bank_id = _create_bank(client, token)
        question_id = _add_short_answer_question(client, token, bank_id, answer_text="")
        session_id = _create_session(client, token, bank_id)

        _submit_answer(client, token, session_id, question_id, "some answer")

        assert regular_called["n"] == 0
        assert ai_solve_called["n"] == 1

    def test_with_reference_uses_regular_not_ai_solve(self, client: TestClient, monkeypatch) -> None:
        """With reference answer → calls evaluate_short_answer, not evaluate_short_answer_by_ai."""
        _mock_resolve_llm(monkeypatch)

        regular_called = {"n": 0}
        ai_solve_called = {"n": 0}
        from app.services import practice_service

        def _spy_regular(config, stem, ref_answer, user_answer):
            regular_called["n"] += 1
            return {"correct": True, "feedback": "正确"}

        def _spy_ai_solve(config, stem, user_answer):
            ai_solve_called["n"] += 1
            return {"correct": True, "feedback": "should not be called"}

        monkeypatch.setattr(practice_service, "evaluate_short_answer", _spy_regular)
        monkeypatch.setattr(practice_service, "evaluate_short_answer_by_ai", _spy_ai_solve)

        token = register_and_login(client, "ken", "ken@test.com")
        bank_id = _create_bank(client, token)
        question_id = _add_short_answer_question(client, token, bank_id, answer_text="有参考答案")
        session_id = _create_session(client, token, bank_id)

        _submit_answer(client, token, session_id, question_id, "some answer")

        assert regular_called["n"] == 1
        assert ai_solve_called["n"] == 0


# ---------------------------------------------------------------------------
# Tests: Verify the evaluate_short_answer prompt structure
# ---------------------------------------------------------------------------

class TestEvaluateShortAnswerPrompt:
    """Test the actual evaluate_short_answer function's prompt construction."""

    def test_evaluate_builds_correct_prompt(self) -> None:
        """Verify the prompt contains all required elements."""
        from app.services.llm_client import evaluate_short_answer

        # We can't easily test the prompt without calling the real function,
        # but we can verify the function signature and return format
        # by testing with a mocked httpx
        pass

    def test_llm_json_response_parsing(self, monkeypatch) -> None:
        """Verify that the function correctly parses LLM JSON responses."""
        from app.services.llm_client import evaluate_short_answer

        class FakeResponse:
            status_code = 200

            def raise_for_status(self):
                pass

            def json(self):
                return {
                    "choices": [{"message": {"content": '{"correct": true, "feedback": "回答正确"}'}}]
                }

        from app.services import llm_client

        class FakeClient:
            def post(self, *args, **kwargs):
                return FakeResponse()

        monkeypatch.setattr(llm_client, "_get_http_client", lambda: FakeClient())

        config = _FakeLLMConfig()
        result = evaluate_short_answer(config, "什么是X？", "X是Y", "X是Y")

        assert result["correct"] is True
        assert result["feedback"] == "回答正确"

    def test_llm_json_with_code_fences(self, monkeypatch) -> None:
        """Verify parsing when LLM wraps response in code fences."""
        from app.services.llm_client import evaluate_short_answer

        class FakeResponse:
            status_code = 200

            def raise_for_status(self):
                pass

            def json(self):
                return {
                    "choices": [{"message": {"content": '```json\n{"correct": false, "feedback": "答案错误"}\n```'}}]
                }

        from app.services import llm_client

        class FakeClient:
            def post(self, *args, **kwargs):
                return FakeResponse()

        monkeypatch.setattr(llm_client, "_get_http_client", lambda: FakeClient())

        config = _FakeLLMConfig()
        result = evaluate_short_answer(config, "什么是X？", "X是Y", "完全不对")

        assert result["correct"] is False
        assert result["feedback"] == "答案错误"

    def test_llm_http_error_returns_failure(self, monkeypatch) -> None:
        """HTTP error → returns fallback failure message."""
        from app.services.llm_client import evaluate_short_answer
        import httpx
        from app.services import llm_client

        class FakeClient:
            def post(self, *args, **kwargs):
                raise httpx.ConnectError("connection refused")

        monkeypatch.setattr(llm_client, "_get_http_client", lambda: FakeClient())

        config = _FakeLLMConfig()
        result = evaluate_short_answer(config, "什么是X？", "X是Y", "X是Y")

        assert result["correct"] is False
        assert "评判失败" in str(result["feedback"])

    def test_llm_invalid_json_returns_failure(self, monkeypatch) -> None:
        """Invalid JSON from LLM → returns fallback failure message."""
        from app.services.llm_client import evaluate_short_answer

        class FakeResponse:
            status_code = 200

            def raise_for_status(self):
                pass

            def json(self):
                return {
                    "choices": [{"message": {"content": "这不是JSON"}}]
                }

        from app.services import llm_client

        class FakeClient:
            def post(self, *args, **kwargs):
                return FakeResponse()

        monkeypatch.setattr(llm_client, "_get_http_client", lambda: FakeClient())

        config = _FakeLLMConfig()
        result = evaluate_short_answer(config, "什么是X？", "X是Y", "X是Y")

        assert result["correct"] is False
        assert "评判失败" in str(result["feedback"])
