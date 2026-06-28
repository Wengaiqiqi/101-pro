from pathlib import Path
from types import SimpleNamespace

import pytest
from sqlalchemy import select

from app.models.import_job import ImportJob
from app.services import import_service
from tests.conftest import register_and_login


@pytest.fixture
def two_pending_imports(client, monkeypatch):
    from app.services import storage

    fixture_path = Path(__file__).with_name("fixtures") / "import_fixture.txt"
    monkeypatch.setattr(
        storage,
        "save_upload",
        lambda user_id, upload: (upload.filename, str(fixture_path)),
    )
    monkeypatch.setattr(import_service, "enqueue_import_job", lambda import_job_id: None)
    token = register_and_login(client, "local-worker", "local-worker@example.com")
    headers = {"Authorization": f"Bearer {token}"}
    bank_response = client.post(
        "/api/question-banks",
        headers=headers,
        json={"name": "Local worker bank", "description": ""},
    )
    bank_id = bank_response.json()["id"]
    for filename in ("first.txt", "second.txt"):
        response = client.post(
            "/api/import-jobs",
            headers=headers,
            data={"bank_id": str(bank_id), "question_count": "1"},
            files={"file": (filename, b"Local worker fixture", "text/plain")},
        )
        assert response.status_code == 201
    return client


def test_local_queue_mode_does_not_dispatch_to_celery(monkeypatch) -> None:
    from app.tasks import import_tasks

    dispatched: list[int] = []
    monkeypatch.setattr(
        import_service,
        "get_settings",
        lambda: SimpleNamespace(import_queue_mode="local"),
        raising=False,
    )
    monkeypatch.setattr(import_tasks.process_import_job_task, "delay", dispatched.append, raising=False)

    import_service.enqueue_import_job(42)

    assert dispatched == []


def test_local_worker_processes_oldest_pending_job(two_pending_imports) -> None:
    from app.tasks.local_worker import process_next_pending_job

    client = two_pending_imports
    session_local = client.app.state.testing_session_local
    db = session_local()
    try:
        jobs = list(db.scalars(select(ImportJob).order_by(ImportJob.id)))
        assert len(jobs) >= 2
        expected_id = jobs[0].id
    finally:
        db.close()

    processed: list[int] = []

    def fake_processor(session, import_job_id: int) -> None:
        processed.append(import_job_id)
        job = session.get(ImportJob, import_job_id)
        job.status = "reviewing"
        session.commit()

    assert process_next_pending_job(session_local, fake_processor) is True
    assert processed == [expected_id]
