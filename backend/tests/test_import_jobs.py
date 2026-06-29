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


def _set_job_status(client: TestClient, job_id: int, status: str) -> None:
    from app.models.import_job import ImportJob

    session_local = client.app.state.testing_session_local
    db = session_local()
    try:
        job = db.get(ImportJob, job_id)
        job.status = status
        db.commit()
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
    assert bob_create_response.status_code == 403


def test_publish_auto_approves_pending_drafts(client: TestClient, monkeypatch) -> None:
    """Publishing with no approved drafts auto-approves pending drafts."""
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

    # Auto-approves pending drafts and publishes
    assert publish_response.status_code == 200
    assert publish_response.json()["published_count"] == 1


def test_processing_is_idempotent_for_non_pending_jobs(client: TestClient, monkeypatch) -> None:
    _mock_import_generation(monkeypatch)
    token = register_and_login(client, "alice", "alice@example.com")
    headers = _headers(token)
    bank_id = _create_bank(client, token)
    create_response = client.post(
        "/api/import-jobs",
        headers=headers,
        data={"bank_id": str(bank_id), "question_count": "1"},
        files={"file": ("fixture.txt", b"Process once.", "text/plain")},
    )
    job_id = create_response.json()["id"]

    _process_job(client, job_id)
    _process_job(client, job_id)

    drafts_response = client.get(f"/api/import-jobs/{job_id}/drafts", headers=headers)
    assert drafts_response.status_code == 200
    assert len(drafts_response.json()) == 1


def test_retry_rejects_processing_job(client: TestClient, monkeypatch) -> None:
    _mock_import_generation(monkeypatch)
    token = register_and_login(client, "alice", "alice@example.com")
    headers = _headers(token)
    bank_id = _create_bank(client, token)
    create_response = client.post(
        "/api/import-jobs",
        headers=headers,
        data={"bank_id": str(bank_id), "question_count": "1"},
        files={"file": ("fixture.txt", b"Retry blocked.", "text/plain")},
    )
    job_id = create_response.json()["id"]
    _set_job_status(client, job_id, "processing")

    retry_response = client.post(f"/api/import-jobs/{job_id}/retry", headers=headers)

    assert retry_response.status_code == 400
    assert retry_response.json()["detail"] == "Import job is already processing"


def test_empty_options_get_placeholder_on_publish(client: TestClient, monkeypatch) -> None:
    """Choice questions with empty options get auto-generated placeholders and publish successfully."""
    _mock_import_generation(monkeypatch)
    token = register_and_login(client, "alice", "alice@example.com")
    headers = _headers(token)
    bank_id = _create_bank(client, token)
    create_response = client.post(
        "/api/import-jobs",
        headers=headers,
        data={"bank_id": str(bank_id), "question_count": "1"},
        files={"file": ("fixture.txt", b"Empty options draft.", "text/plain")},
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

    # Now publishes successfully with placeholder options
    assert publish_response.status_code == 200
    assert publish_response.json()["published_count"] == 1
    questions_response = client.get(f"/api/question-banks/{bank_id}/questions", headers=headers)
    assert len(questions_response.json()) == 1
    # Verify placeholder options were generated
    assert len(questions_response.json()[0]["options"]) >= 2


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


def test_import_job_accepts_auto_count_and_difficulty(client: TestClient, monkeypatch) -> None:
    """Verify that auto (0 count, 'auto' difficulty) are accepted and stored."""
    captured_config: list[dict] = []

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

    def _capture_drafts(config, text, generation_config):
        captured_config.append(generation_config)
        return [
            {
                "type": "single_choice",
                "stem": "Test question?",
                "options": [
                    {"label": "A", "content": "Yes", "is_correct": True, "sort_order": 1},
                    {"label": "B", "content": "No", "is_correct": False, "sort_order": 2},
                ],
                "answer": {"label": "A"},
                "explanation": "",
                "difficulty": "easy",
                "tags": [],
            }
        ]

    monkeypatch.setattr(llm_client, "generate_question_drafts", _capture_drafts)

    token = register_and_login(client, "alice_auto", "alice_auto@example.com")
    headers = _headers(token)
    bank_id = _create_bank(client, token, name="Auto Bank")

    # Send with auto defaults (question_count=0, difficulty=auto)
    create_response = client.post(
        "/api/import-jobs",
        headers=headers,
        data={
            "bank_id": str(bank_id),
            "question_types": "single_choice",
            "question_count": "0",
            "difficulty": "auto",
            "language": "zh-CN",
            "with_explanations": "true",
        },
        files={"file": ("exam.txt", b"Auto mode test.", "text/plain")},
    )
    assert create_response.status_code == 201
    job_id = create_response.json()["id"]

    _process_job(client, job_id)

    # Verify the generation_config was passed correctly
    assert len(captured_config) == 1
    assert captured_config[0]["question_count"] == 0
    assert captured_config[0]["difficulty"] == "auto"

    # Verify drafts were generated
    drafts = client.get(f"/api/import-jobs/{job_id}/drafts", headers=headers).json()
    assert len(drafts) == 1
    assert drafts[0]["stem"] == "Test question?"
    assert len(drafts[0]["options_json"]) == 2


def test_import_job_empty_question_types_means_all_types(
    client: TestClient,
    monkeypatch,
) -> None:
    from app.services import storage

    monkeypatch.setattr(
        storage,
        "save_upload",
        lambda user_id, upload: (
            upload.filename,
            str(Path(__file__).with_name("fixtures").joinpath("import_fixture.txt")),
        ),
    )
    token = register_and_login(
        client,
        "alice_all_types",
        "alice_all_types@example.com",
    )
    bank_id = _create_bank(client, token, name="All Types Bank")

    response = client.post(
        "/api/import-jobs",
        headers=_headers(token),
        data={
            "bank_id": str(bank_id),
            "question_types": "",
            "question_count": "0",
        },
        files={"file": ("exam.pdf", b"pdf", "application/pdf")},
    )

    assert response.status_code == 201
    assert response.json()["generation_config"]["question_types"] == []


def test_pdf_import_creates_chunks_and_drafts(
    client: TestClient,
    monkeypatch,
) -> None:
    from sqlalchemy import select

    from app.models.import_job import ImportJobChunk, ImportedQuestionDraft
    from app.services import document_extractors, import_service, llm_client, storage

    page_texts = [f"page {i}" for i in range(1, 5)]
    full_text = "\n\n".join(page_texts)
    monkeypatch.setattr(
        import_service,
        "resolve_model_config",
        lambda db, user: _FakeModelConfig(),
    )
    monkeypatch.setattr(
        storage,
        "save_upload",
        lambda user_id, upload: (
            upload.filename,
            str(Path(__file__).with_name("fixtures").joinpath("import_fixture.txt")),
        ),
    )
    monkeypatch.setattr(
        document_extractors,
        "extract_text",
        lambda path, mime, name: full_text,
    )
    monkeypatch.setattr(
        llm_client,
        "generate_question_drafts",
        lambda config, text, generation_config: [
            {
                "type": "short_answer",
                "stem": text,
                "options": [],
                "answer": {"text": "answer"},
                "explanation": "",
                "difficulty": "medium",
                "tags": [],
            }
        ],
    )

    token = register_and_login(client, "pdf_user", "pdf_user@example.com")
    bank_id = _create_bank(client, token, name="PDF Bank")
    response = client.post(
        "/api/import-jobs",
        headers=_headers(token),
        data={"bank_id": str(bank_id), "question_types": "short_answer"},
        files={"file": ("exam.pdf", b"pdf", "application/pdf")},
    )
    assert response.status_code == 201
    job_id = int(response.json()["id"])
    _process_job(client, job_id)

    db = client.app.state.testing_session_local()
    try:
        chunks = list(
            db.scalars(
                select(ImportJobChunk)
                .where(ImportJobChunk.import_job_id == job_id)
                .order_by(ImportJobChunk.chunk_index)
            )
        )
        drafts = list(
            db.scalars(
                select(ImportedQuestionDraft)
                .where(ImportedQuestionDraft.import_job_id == job_id)
                .order_by(ImportedQuestionDraft.id)
            )
        )
    finally:
        db.close()

    # Text short enough to fit in a single chunk
    assert len(chunks) == 1
    assert chunks[0].text == full_text
    # Each chunk produces one draft
    assert len(drafts) == 1
    assert drafts[0].source_chunk_id == chunks[0].id


def test_text_import_still_uses_generate_question_drafts(
    client: TestClient,
    monkeypatch,
) -> None:
    from app.services import import_service, llm_client, storage

    calls: list[str] = []
    monkeypatch.setattr(
        import_service,
        "resolve_model_config",
        lambda db, user: _FakeModelConfig(),
    )
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
        lambda config, text, generation_config: calls.append(text)
        or [
            {
                "type": "single_choice",
                "stem": "Which option is correct?",
                "options": [
                    {
                        "label": "A",
                        "content": "Alpha",
                        "is_correct": True,
                        "sort_order": 1,
                    },
                    {
                        "label": "B",
                        "content": "Beta",
                        "is_correct": False,
                        "sort_order": 2,
                    },
                ],
                "answer": {"label": "A"},
                "explanation": "",
                "difficulty": "easy",
                "tags": [],
            }
        ],
    )

    token = register_and_login(client, "text_user", "text_user@example.com")
    bank_id = _create_bank(client, token, name="Text Bank")
    response = client.post(
        "/api/import-jobs",
        headers=_headers(token),
        data={"bank_id": str(bank_id), "question_types": "single_choice"},
        files={"file": ("fixture.txt", b"fixture", "text/plain")},
    )
    assert response.status_code == 201
    _process_job(client, int(response.json()["id"]))

    assert calls == ["Alpha and Beta. Beta is the answer."]


def test_short_answer_without_answer_is_rejected_on_publish() -> None:
    from app.core.exceptions import BadRequestError
    from app.models.import_job import ImportJob, ImportedQuestionDraft
    from app.services.import_service import _question_from_draft

    job = ImportJob(
        id=1,
        user_id=1,
        bank_id=7,
        original_filename="exam.pdf",
        stored_path="x",
        mime_type="application/pdf",
    )
    draft = ImportedQuestionDraft(
        import_job_id=1,
        type="short_answer",
        stem="说明系统稳定的含义",
        options_json=[],
        answer_json={},
        explanation="",
        difficulty="medium",
        tags=[],
    )

    with pytest.raises(BadRequestError) as exc_info:
        _question_from_draft(job, draft)

    assert exc_info.value.detail == "Draft answer is required"


def test_fill_blank_without_answer_is_rejected_on_publish() -> None:
    from app.core.exceptions import BadRequestError
    from app.models.import_job import ImportJob, ImportedQuestionDraft
    from app.services.import_service import _question_from_draft

    job = ImportJob(
        id=1,
        user_id=1,
        bank_id=7,
        original_filename="exam.pdf",
        stored_path="x",
        mime_type="application/pdf",
    )
    draft = ImportedQuestionDraft(
        import_job_id=1,
        type="fill_blank",
        stem="系统型别是 ____",
        options_json=[],
        answer_json={"text": ""},
        explanation="",
        difficulty="medium",
        tags=[],
    )

    with pytest.raises(BadRequestError) as exc_info:
        _question_from_draft(job, draft)

    assert exc_info.value.detail == "Draft answer is required"
