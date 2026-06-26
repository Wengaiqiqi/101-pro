from dataclasses import dataclass
from io import BytesIO
from pathlib import Path
import shutil

import pytest
from fastapi import UploadFile
from fastapi.testclient import TestClient

from app.core.config import get_settings
from tests.conftest import register_and_login


@dataclass(frozen=True)
class _FakeModelConfig:
    provider: str = "openai-compatible"
    base_url: str = "https://example.test/v1"
    model: str = "test-model"
    api_key: str = "test-key"


def _headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _create_bank(client: TestClient, token: str, name: str = "Import Bank") -> int:
    response = client.post(
        "/api/question-banks",
        headers=_headers(token),
        json={"name": name, "description": "Imported material"},
    )
    assert response.status_code == 201
    return int(response.json()["id"])


def _mock_import_generation(monkeypatch) -> None:
    from app.services import import_service, llm_client, storage

    monkeypatch.setattr(import_service, "resolve_model_config", lambda db, user: _FakeModelConfig())
    monkeypatch.setattr(
        storage,
        "save_upload",
        lambda user_id, upload: (
            upload.filename,
            str(Path(__file__).with_name("fixtures").joinpath("import_fixture.txt")),
        ),
    )
    monkeypatch.setattr(
        llm_client,
        "generate_question_drafts",
        lambda config, text, generation_config: [
            {
                "type": "single_choice",
                "stem": "Which value is highlighted in the fixture?",
                "options": [
                    {"label": "A", "content": "Alpha", "is_correct": False, "sort_order": 1},
                    {"label": "B", "content": "Beta", "is_correct": True, "sort_order": 2},
                ],
                "answer": {"text": "B"},
                "explanation": "The fixture says Beta is the answer.",
                "difficulty": "easy",
                "tags": ["fixture", "import"],
            }
        ],
    )


def _process_job(client: TestClient, job_id: int) -> None:
    from app.services.import_service import process_import_job

    session_local = client.app.state.testing_session_local
    db = session_local()
    try:
        process_import_job(db, job_id)
    finally:
        db.close()


def test_import_job_upload_generates_draft_and_publishes_question(
    client: TestClient,
    monkeypatch,
) -> None:
    _mock_import_generation(monkeypatch)
    token = register_and_login(client, "alice", "alice@example.com")
    headers = _headers(token)
    bank_id = _create_bank(client, token)

    create_response = client.post(
        "/api/import-jobs",
        headers=headers,
        data={
            "bank_id": str(bank_id),
            "question_types": "single_choice",
            "question_count": "1",
            "difficulty": "easy",
            "language": "en",
            "with_explanations": "true",
        },
        files={"file": ("fixture.txt", b"Alpha and Beta. Beta is the answer.", "text/plain")},
    )

    assert create_response.status_code == 201
    job = create_response.json()
    assert job["bank_id"] == bank_id
    assert job["original_filename"] == "fixture.txt"
    assert job["status"] == "pending"
    job_id = job["id"]

    _process_job(client, job_id)

    list_response = client.get("/api/import-jobs", headers=headers)
    assert list_response.status_code == 200
    assert [item["id"] for item in list_response.json()] == [job_id]

    detail_response = client.get(f"/api/import-jobs/{job_id}", headers=headers)
    assert detail_response.status_code == 200
    assert detail_response.json()["id"] == job_id

    drafts_response = client.get(f"/api/import-jobs/{job_id}/drafts", headers=headers)
    assert drafts_response.status_code == 200
    drafts = drafts_response.json()
    assert len(drafts) == 1
    draft = drafts[0]
    assert draft["stem"] == "Which value is highlighted in the fixture?"
    assert draft["options_json"][1]["is_correct"] is True
    draft_id = draft["id"]

    update_response = client.put(
        f"/api/import-drafts/{draft_id}",
        headers=headers,
        json={"stem": "Which option is marked correct?", "status": "approved"},
    )
    assert update_response.status_code == 200
    assert update_response.json()["stem"] == "Which option is marked correct?"
    assert update_response.json()["status"] == "approved"

    publish_response = client.post(f"/api/import-jobs/{job_id}/publish", headers=headers)
    assert publish_response.status_code == 200
    published = publish_response.json()
    assert published["published_count"] == 1
    assert len(published["question_ids"]) == 1

    questions_response = client.get(f"/api/question-banks/{bank_id}/questions", headers=headers)
    assert questions_response.status_code == 200
    questions = questions_response.json()
    assert len(questions) == 1
    assert questions[0]["stem"] == "Which option is marked correct?"
    assert questions[0]["answer_text"] == "B"
    assert questions[0]["source"] == f"import_job:{job_id}"
    assert [option["label"] for option in questions[0]["options"]] == ["A", "B"]

    drafts_after_publish_response = client.get(f"/api/import-jobs/{job_id}/drafts", headers=headers)
    assert drafts_after_publish_response.status_code == 200
    assert drafts_after_publish_response.json()[0]["status"] == "published"


def test_import_job_upload_does_not_run_llm_in_request(
    client: TestClient,
    monkeypatch,
) -> None:
    from app.services import import_service, llm_client, storage

    monkeypatch.setattr(
        storage,
        "save_upload",
        lambda user_id, upload: (
            upload.filename,
            str(Path(__file__).with_name("fixtures").joinpath("import_fixture.txt")),
        ),
    )
    monkeypatch.setattr(
        import_service,
        "resolve_model_config",
        lambda db, user: (_ for _ in ()).throw(AssertionError("model config should not be resolved")),
    )
    monkeypatch.setattr(
        llm_client,
        "generate_question_drafts",
        lambda config, text, generation_config: (_ for _ in ()).throw(AssertionError("LLM should not run")),
    )

    token = register_and_login(client, "alice", "alice@example.com")
    bank_id = _create_bank(client, token)
    response = client.post(
        "/api/import-jobs",
        headers=_headers(token),
        data={
            "bank_id": str(bank_id),
            "question_types": "single_choice",
            "question_count": "1",
            "difficulty": "easy",
            "language": "en",
            "with_explanations": "true",
        },
        files={"file": ("fixture.txt", b"Do not process inline.", "text/plain")},
    )

    assert response.status_code == 201
    assert response.json()["status"] == "pending"


def test_import_jobs_and_drafts_are_owner_scoped(
    client: TestClient,
    monkeypatch,
) -> None:
    _mock_import_generation(monkeypatch)
    alice_token = register_and_login(client, "alice", "alice@example.com")
    bob_token = register_and_login(client, "bob", "bob@example.com")
    alice_headers = _headers(alice_token)
    bob_headers = _headers(bob_token)
    bank_id = _create_bank(client, alice_token, name="Alice Imports")

    create_response = client.post(
        "/api/import-jobs",
        headers=alice_headers,
        data={
            "bank_id": str(bank_id),
            "question_types": "single_choice",
            "question_count": "1",
            "difficulty": "easy",
            "language": "en",
            "with_explanations": "true",
        },
        files={"file": ("fixture.txt", b"Only Alice should see this.", "text/plain")},
    )
    assert create_response.status_code == 201
    job_id = create_response.json()["id"]

    _process_job(client, job_id)

    drafts_response = client.get(f"/api/import-jobs/{job_id}/drafts", headers=alice_headers)
    assert drafts_response.status_code == 200
    draft_id = drafts_response.json()[0]["id"]

    assert client.get(f"/api/import-jobs/{job_id}", headers=bob_headers).status_code == 404
    assert client.get(f"/api/import-jobs/{job_id}/drafts", headers=bob_headers).status_code == 404
    assert client.put(f"/api/import-drafts/{draft_id}", headers=bob_headers, json={"status": "approved"}).status_code == 404
    assert client.post(f"/api/import-jobs/{job_id}/publish", headers=bob_headers).status_code == 404
    assert client.get("/api/import-jobs", headers=bob_headers).json() == []

    bob_create_response = client.post(
        "/api/import-jobs",
        headers=bob_headers,
        data={
            "bank_id": str(bank_id),
            "question_types": "single_choice",
            "question_count": "1",
            "difficulty": "easy",
            "language": "en",
            "with_explanations": "true",
        },
        files={"file": ("fixture.txt", b"Bob cannot import into Alice bank.", "text/plain")},
    )
    assert bob_create_response.status_code == 404


def test_publish_requires_approved_draft(client: TestClient, monkeypatch) -> None:
    _mock_import_generation(monkeypatch)
    token = register_and_login(client, "alice", "alice@example.com")
    headers = _headers(token)
    bank_id = _create_bank(client, token)
    create_response = client.post(
        "/api/import-jobs",
        headers=headers,
        data={"bank_id": str(bank_id), "question_count": "1"},
        files={"file": ("fixture.txt", b"Pending draft.", "text/plain")},
    )
    job_id = create_response.json()["id"]
    _process_job(client, job_id)

    publish_response = client.post(f"/api/import-jobs/{job_id}/publish", headers=headers)

    assert publish_response.status_code == 400
    assert publish_response.json()["detail"] == "No approved drafts to publish"


def test_invalid_draft_does_not_publish_question(client: TestClient, monkeypatch) -> None:
    _mock_import_generation(monkeypatch)
    token = register_and_login(client, "alice", "alice@example.com")
    headers = _headers(token)
    bank_id = _create_bank(client, token)
    create_response = client.post(
        "/api/import-jobs",
        headers=headers,
        data={"bank_id": str(bank_id), "question_count": "1"},
        files={"file": ("fixture.txt", b"Invalid draft.", "text/plain")},
    )
    job_id = create_response.json()["id"]
    _process_job(client, job_id)
    drafts = client.get(f"/api/import-jobs/{job_id}/drafts", headers=headers).json()
    draft_id = drafts[0]["id"]
    client.put(
        f"/api/import-drafts/{draft_id}",
        headers=headers,
        json={"status": "approved", "options_json": []},
    )

    publish_response = client.post(f"/api/import-jobs/{job_id}/publish", headers=headers)

    assert publish_response.status_code == 400
    questions_response = client.get(f"/api/question-banks/{bank_id}/questions", headers=headers)
    assert questions_response.json() == []


def test_multiple_choice_answer_list_is_published_canonically(client: TestClient, monkeypatch) -> None:
    from app.services import import_service, llm_client, storage

    monkeypatch.setattr(import_service, "resolve_model_config", lambda db, user: _FakeModelConfig())
    monkeypatch.setattr(
        storage,
        "save_upload",
        lambda user_id, upload: (
            upload.filename,
            str(Path(__file__).with_name("fixtures").joinpath("import_fixture.txt")),
        ),
    )
    monkeypatch.setattr(
        llm_client,
        "generate_question_drafts",
        lambda config, text, generation_config: [
            {
                "type": "multiple_choice",
                "stem": "Which letters are correct?",
                "options": [
                    {"label": "A", "content": "Alpha", "is_correct": True, "sort_order": 1},
                    {"label": "B", "content": "Beta", "is_correct": False, "sort_order": 2},
                    {"label": "C", "content": "Gamma", "is_correct": True, "sort_order": 3},
                ],
                "answer": {"label": ["C", "A"]},
                "explanation": "",
                "difficulty": "easy",
                "tags": [],
            }
        ],
    )

    token = register_and_login(client, "alice", "alice@example.com")
    headers = _headers(token)
    bank_id = _create_bank(client, token)
    create_response = client.post(
        "/api/import-jobs",
        headers=headers,
        data={"bank_id": str(bank_id), "question_count": "1"},
        files={"file": ("fixture.txt", b"Multiple choice.", "text/plain")},
    )
    job_id = create_response.json()["id"]
    _process_job(client, job_id)
    draft_id = client.get(f"/api/import-jobs/{job_id}/drafts", headers=headers).json()[0]["id"]
    client.put(f"/api/import-drafts/{draft_id}", headers=headers, json={"status": "approved"})

    publish_response = client.post(f"/api/import-jobs/{job_id}/publish", headers=headers)
    assert publish_response.status_code == 200
    questions = client.get(f"/api/question-banks/{bank_id}/questions", headers=headers).json()
    assert questions[0]["answer_text"] == "A C"
    assert [option["label"] for option in questions[0]["options"] if option["is_correct"]] == ["A", "C"]


def test_save_upload_sanitizes_filename_and_stays_inside_storage_root(monkeypatch) -> None:
    from app.services.storage import save_upload

    settings = get_settings()
    storage_root = Path(__file__).with_name(".tmp_storage")
    if storage_root.exists():
        shutil.rmtree(storage_root)
    monkeypatch.setattr(settings, "storage_root", str(storage_root))
    upload = UploadFile(filename="../evil.txt", file=BytesIO(b"safe content"))

    try:
        try:
            original_filename, stored_path = save_upload(42, upload)
        except PermissionError:
            pytest.skip("sandbox blocked runtime storage directory creation")

        assert original_filename == "evil.txt"
        stored = Path(stored_path)
        assert stored.read_bytes() == b"safe content"
        assert stored.parent == storage_root.resolve() / "42"
        assert stored.name.endswith("_evil.txt")
    finally:
        if storage_root.exists():
            shutil.rmtree(storage_root)
