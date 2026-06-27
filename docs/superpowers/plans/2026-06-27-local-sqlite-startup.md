# Local SQLite Startup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `start.cmd` launch the complete application with persistent SQLite and a dedicated local import worker by default, while retaining PostgreSQL, Redis, and Celery behind `-UseDocker`.

**Architecture:** The launcher selects a runtime mode and injects environment variables without rewriting `backend/.env`. SQLite uses a shared engine factory with WAL, foreign keys, and lock waiting; a serial polling process consumes pending import jobs through the existing atomic `process_import_job` service. Docker mode keeps the existing Compose and Celery path.

**Tech Stack:** PowerShell, Python 3.11, FastAPI, SQLAlchemy 2, Alembic, SQLite, Celery, pytest

---

## File Map

- Create `backend/tests/test_sqlite_runtime.py`: SQLite engine and Alembic compatibility coverage.
- Modify `backend/app/db/session.py`: central database engine factory and SQLite pragmas.
- Modify `backend/migrations/versions/20260626_0001_initial_schema.py`: cross-dialect timestamp and JSON defaults.
- Create `backend/tests/test_local_worker.py`: local dispatch and worker polling behavior.
- Create `backend/app/tasks/local_worker.py`: serial pending-job polling process.
- Modify `backend/app/core/config.py`: `import_queue_mode` runtime setting.
- Modify `backend/app/services/import_service.py`: select local polling or Celery dispatch.
- Modify `backend/.env.example`: document the Celery default outside launcher overrides.
- Modify `scripts/Test-OneClickScripts.ps1`: executable contract for local-default and optional Docker startup.
- Modify `scripts/start.ps1`: mode selection, local environment, worker selection, and conditional infrastructure.
- Modify `scripts/stop.ps1`: mode-aware infrastructure shutdown.
- Modify `README.md`: default local startup and optional Docker instructions.

### Task 1: SQLite Runtime And Portable Migration

**Files:**
- Create: `backend/tests/test_sqlite_runtime.py`
- Modify: `backend/app/db/session.py`
- Modify: `backend/migrations/versions/20260626_0001_initial_schema.py`

- [ ] **Step 1: Write failing SQLite engine tests**

Create `backend/tests/test_sqlite_runtime.py` with tests that call a wished-for `create_database_engine` API and run the real Alembic migration:

```python
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import inspect, text

from app.core.config import get_settings
from app.db.session import create_database_engine


def _sqlite_url(path: Path) -> str:
    return f"sqlite:///{path.as_posix()}"


def test_sqlite_engine_enables_concurrency_pragmas(tmp_path: Path) -> None:
    engine = create_database_engine(_sqlite_url(tmp_path / "runtime.db"))
    try:
        with engine.connect() as connection:
            foreign_keys = connection.execute(text("PRAGMA foreign_keys")).scalar_one()
            journal_mode = connection.execute(text("PRAGMA journal_mode")).scalar_one()
            busy_timeout = connection.execute(text("PRAGMA busy_timeout")).scalar_one()

        assert foreign_keys == 1
        assert str(journal_mode).lower() == "wal"
        assert int(busy_timeout) >= 30_000
    finally:
        engine.dispose()


def test_initial_migration_upgrades_new_sqlite_database(tmp_path: Path, monkeypatch) -> None:
    database_path = tmp_path / "migrated.db"
    monkeypatch.setenv("DATABASE_URL", _sqlite_url(database_path))
    get_settings.cache_clear()
    try:
        config = Config("alembic.ini")
        command.upgrade(config, "head")
        engine = create_database_engine(_sqlite_url(database_path))
        try:
            tables = set(inspect(engine).get_table_names())
        finally:
            engine.dispose()
    finally:
        get_settings.cache_clear()

    assert {"alembic_version", "users", "question_banks", "import_jobs"} <= tables
```

- [ ] **Step 2: Run the tests and verify RED**

Run from `backend`:

```powershell
python -m pytest tests/test_sqlite_runtime.py -v
```

Expected: collection fails because `create_database_engine` does not exist.

- [ ] **Step 3: Implement the SQLite-aware engine factory**

Replace direct engine construction in `backend/app/db/session.py` with:

```python
from collections.abc import Generator

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings


def create_database_engine(database_url: str) -> Engine:
    engine_kwargs: dict[str, object] = {"pool_pre_ping": True}
    if database_url.startswith("sqlite"):
        engine_kwargs["connect_args"] = {"check_same_thread": False, "timeout": 30}

    database_engine = create_engine(database_url, **engine_kwargs)
    if database_url.startswith("sqlite"):

        @event.listens_for(database_engine, "connect")
        def configure_sqlite(dbapi_connection, connection_record) -> None:
            del connection_record
            cursor = dbapi_connection.cursor()
            try:
                cursor.execute("PRAGMA foreign_keys=ON")
                cursor.execute("PRAGMA busy_timeout=30000")
                cursor.execute("PRAGMA journal_mode=WAL")
            finally:
                cursor.close()

    return database_engine


engine = create_database_engine(get_settings().database_url)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
```

Keep the existing `get_db` generator unchanged below this block.

- [ ] **Step 4: Run the focused tests and expose the migration incompatibility**

```powershell
python -m pytest tests/test_sqlite_runtime.py -v
```

Expected: `test_sqlite_engine_enables_concurrency_pragmas` passes and `test_initial_migration_upgrades_new_sqlite_database` fails on a PostgreSQL-specific default such as `now()` or `::json`.

- [ ] **Step 5: Make the initial migration cross-dialect**

In `backend/migrations/versions/20260626_0001_initial_schema.py`, replace every `sa.text("now()")` with `sa.text("CURRENT_TIMESTAMP")`. Replace PostgreSQL JSON casts as follows:

```python
sa.text("'[]'::json")  ->  sa.text("'[]'")
sa.text("'{}'::json")  ->  sa.text("'{}'")
```

Do not change table names, columns, indexes, constraints, or the revision ID.

- [ ] **Step 6: Run focused and full backend tests**

```powershell
python -m pytest tests/test_sqlite_runtime.py -v
python -m pytest -q
```

Expected: both SQLite runtime tests pass; the complete suite reports all existing tests passing with only the existing sandbox storage skip.

- [ ] **Step 7: Commit the database unit**

```powershell
git add backend/tests/test_sqlite_runtime.py backend/app/db/session.py backend/migrations/versions/20260626_0001_initial_schema.py
git commit -m "feat: support persistent SQLite runtime"
```

### Task 2: Local Import Queue And Worker

**Files:**
- Create: `backend/tests/test_local_worker.py`
- Create: `backend/app/tasks/local_worker.py`
- Modify: `backend/app/core/config.py`
- Modify: `backend/app/services/import_service.py`
- Modify: `backend/.env.example`

- [ ] **Step 1: Write failing queue-mode tests**

Create `backend/tests/test_local_worker.py`:

```python
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
    monkeypatch.setattr(import_tasks.process_import_job_task, "delay", dispatched.append)

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
```

- [ ] **Step 2: Verify the worker tests fail for missing behavior**

```powershell
python -m pytest tests/test_local_worker.py -v
```

Expected: FAIL because `get_settings` and `_dispatch_celery_job` are not exposed by `import_service`, and `app.tasks.local_worker` does not exist.

- [ ] **Step 3: Add queue mode and explicit dispatch**

Add to `Settings` in `backend/app/core/config.py`:

```python
import_queue_mode: str = "celery"
```

In `backend/app/services/import_service.py`, import `logging` and `get_settings`, create `logger = logging.getLogger(__name__)`, and replace `enqueue_import_job` with:

```python
def _dispatch_celery_job(import_job_id: int) -> None:
    from app.tasks.import_tasks import process_import_job_task

    process_import_job_task.delay(import_job_id)


def enqueue_import_job(import_job_id: int) -> None:
    if get_settings().import_queue_mode == "local":
        return
    try:
        _dispatch_celery_job(import_job_id)
    except Exception:
        logger.exception("Could not dispatch import job %s to Celery", import_job_id)
```

This preserves a committed `pending` job on dispatch failure while making the failure observable.

- [ ] **Step 4: Implement one-job polling and the worker loop**

Create `backend/app/tasks/local_worker.py`:

```python
import logging
import time
from collections.abc import Callable

from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from app.db.session import SessionLocal
from app.models.import_job import ImportJob
from app.services.import_service import process_import_job

logger = logging.getLogger(__name__)


def process_next_pending_job(
    session_factory: sessionmaker = SessionLocal,
    processor: Callable[[Session, int], object] = process_import_job,
) -> bool:
    db = session_factory()
    try:
        import_job_id = db.scalar(
            select(ImportJob.id)
            .where(ImportJob.status == "pending")
            .order_by(ImportJob.id)
            .limit(1)
        )
        if import_job_id is None:
            return False
        processor(db, int(import_job_id))
        return True
    finally:
        db.close()


def run_worker(poll_interval_seconds: float = 1.0) -> None:
    logger.info("Local import worker started")
    while True:
        try:
            processed = process_next_pending_job()
        except Exception:
            logger.exception("Local import worker iteration failed")
            processed = False
        if not processed:
            time.sleep(poll_interval_seconds)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    run_worker()
```

- [ ] **Step 5: Document the backend default and verify GREEN**

Add `IMPORT_QUEUE_MODE=celery` after `REDIS_URL` in `backend/.env.example`.

Run:

```powershell
python -m pytest tests/test_local_worker.py -v
python -m pytest -q
```

Expected: local queue and oldest-job tests pass; the complete backend suite stays green.

- [ ] **Step 6: Commit the worker unit**

```powershell
git add backend/tests/test_local_worker.py backend/app/tasks/local_worker.py backend/app/core/config.py backend/app/services/import_service.py backend/.env.example
git commit -m "feat: add SQLite import worker"
```

### Task 3: Default Local Startup And Mode-Aware Shutdown

**Files:**
- Modify: `scripts/Test-OneClickScripts.ps1`
- Modify: `scripts/start.ps1`
- Modify: `scripts/stop.ps1`

- [ ] **Step 1: Extend the PowerShell contract test first**

Add assertions to `scripts/Test-OneClickScripts.ps1` after loading `$startScript` and `$stopScript`:

```powershell
if ($startScript -notmatch "\[switch\]\s*\`$UseDocker") {
    throw "scripts/start.ps1 is missing -UseDocker"
}
if ($startScript -notmatch [regex]::Escape('$env:IMPORT_QUEUE_MODE = "local"')) {
    throw "Local startup must select the local import queue"
}
if ($startScript -notmatch 'Start-TrackedProcess\s+-Name\s+"local-worker"') {
    throw "Local startup must launch the local import worker"
}
$dockerGuardIndex = $startScript.IndexOf('if ($UseDocker)')
$dockerLookupIndex = $startScript.IndexOf('Assert-CommandAvailable -Name "docker"')
if ($dockerGuardIndex -lt 0 -or $dockerLookupIndex -lt $dockerGuardIndex) {
    throw "Docker must only be required inside the -UseDocker branch"
}
if ($stopScript -notmatch [regex]::Escape('startup-mode.txt')) {
    throw "Shutdown must read the recorded startup mode"
}
if ($stopScript -notmatch '\$startupMode\s+-eq\s+"docker"') {
    throw "Shutdown must stop infrastructure only for Docker mode"
}
```

- [ ] **Step 2: Run the contract and verify RED**

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/Test-OneClickScripts.ps1
```

Expected: FAIL with `scripts/start.ps1 is missing -UseDocker`.

- [ ] **Step 3: Add startup mode selection before dependency installation**

Add `[switch]$UseDocker` to the `scripts/start.ps1` parameter block and define:

```powershell
$modeFile = Join-Path $runRoot "startup-mode.txt"
$startupMode = if ($UseDocker) { "docker" } else { "local" }
```

Keep Python, Node.js, npm, and version checks unconditional. Move Docker lookup and Compose version checks into:

```powershell
if ($UseDocker) {
    $dockerCommand = Assert-CommandAvailable -Name "docker" -InstallHint "Install and start Docker Desktop."
    Invoke-CheckedCommand -FilePath $dockerCommand.Source -Arguments @("compose", "version") -WorkingDirectory $repoRoot -Description "Docker Compose check"
}
```

After `.run` exists, configure local mode with an absolute slash-normalized path:

```powershell
if ($UseDocker) {
    $env:IMPORT_QUEUE_MODE = "celery"
}
else {
    $sqlitePath = (Join-Path $runRoot "101-pro.db").Replace("\", "/")
    $env:DATABASE_URL = "sqlite:///$sqlitePath"
    $env:IMPORT_QUEUE_MODE = "local"
}
```

- [ ] **Step 4: Make infrastructure conditional and select one worker**

Move the existing contiguous infrastructure block, starting at `Push-Location $repoRoot` and ending after `Wait-TcpPort -HostName "127.0.0.1" -Port 6379 -TimeoutSeconds 60`, inside `if ($UseDocker)`. Do not move dependency installation or the Alembic invocation into this branch; both modes install dependencies and migrate.

After loading valid PID records, read the previous mode. If it differs from the selected mode, stop every tracked application process before migration so a backend connected to PostgreSQL is never reused for SQLite, or vice versa:

```powershell
$previousMode = Read-TextFile -Path $modeFile
if ($previousMode -and $previousMode -ne $startupMode) {
    Write-StartupStep "Switching runtime mode from $previousMode to $startupMode..."
    foreach ($record in $records) {
        if (Test-TrackedProcess -Record $record) {
            Stop-TrackedProcessTree -Record $record
        }
    }
    $records = @()
    Save-TrackedProcesses -PidFile $pidFile -Processes $records
}
```

When the mode is unchanged, stop and remove only the incompatible worker record:

```powershell
$incompatibleWorkerName = if ($UseDocker) { "local-worker" } else { "celery" }
$incompatibleWorker = $records | Where-Object { $_.name -eq $incompatibleWorkerName } | Select-Object -First 1
if ($null -ne $incompatibleWorker -and (Test-TrackedProcess -Record $incompatibleWorker)) {
    Stop-TrackedProcessTree -Record $incompatibleWorker
}
$records = @($records | Where-Object { $_.name -ne $incompatibleWorkerName })
Save-TrackedProcesses -PidFile $pidFile -Processes $records
```

Then use this branch:

```powershell
if ($UseDocker) {
    $workerName = "celery"
    $workerLabel = "Celery worker"
    $workerArguments = @("-m", "celery", "-A", "app.tasks.celery_app:celery_app", "worker", "--loglevel=info", "--pool=solo")
}
else {
    $workerName = "local-worker"
    $workerLabel = "local import worker"
    $workerArguments = @("-m", "app.tasks.local_worker")
}

$workerRecord = $records | Where-Object { $_.name -eq $workerName } | Select-Object -First 1
if ($null -eq $workerRecord) {
    Write-StartupStep "Starting $workerLabel..."
    $workerRecord = Start-TrackedProcess -Name $workerName -FilePath $pythonCommand.Source -Arguments $workerArguments -WorkingDirectory $backendRoot -LogDirectory $logRoot
    Add-ProjectRecord -Record $workerRecord
}
```

After both health checks pass, persist mode using `Write-TextFile -Path $modeFile -Value $startupMode` and print `Runtime mode: $startupMode` in the success summary.

- [ ] **Step 5: Make shutdown use recorded mode**

In `scripts/stop.ps1`, add `$modeFile = Join-Path $runRoot "startup-mode.txt"`, read it with `Read-TextFile`, and replace unconditional Docker shutdown with:

```powershell
$startupMode = Read-TextFile -Path $modeFile
if ($startupMode -eq "docker" -and -not $KeepInfrastructure) {
    $dockerCommand = Get-Command "docker" -ErrorAction SilentlyContinue
    if ($null -eq $dockerCommand) {
        Write-Warning "Docker was not found; PostgreSQL and Redis could not be stopped."
    }
    else {
        Write-StartupStep "Stopping PostgreSQL and Redis..."
        Invoke-CheckedCommand -FilePath $dockerCommand.Source -Arguments @("compose", "stop", "postgres", "redis") -WorkingDirectory $repoRoot -Description "Infrastructure shutdown"
    }
}
```

Initialize `$infrastructureStopped = $false` before the Docker branch and set it to true immediately after successful Compose shutdown. Remove the mode file with this exact condition; never remove `.run/101-pro.db`:

```powershell
if (($startupMode -ne "docker" -or $infrastructureStopped) -and (Test-Path -LiteralPath $modeFile -PathType Leaf)) {
    Remove-Item -LiteralPath $modeFile -Force
}
```

This retains the Docker marker when `-KeepInfrastructure` was supplied or Docker was unavailable, so a later stop can still clean up those containers.

- [ ] **Step 6: Verify the PowerShell contract and no-Docker preflight**

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/Test-OneClickScripts.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start.ps1 -SkipInstall -NoBrowser
```

Expected: contract PASS. The startup command must advance beyond platform prerequisites without a Docker error; if workspace frontend dependencies are unavailable, its failure must mention dependencies rather than Docker.

- [ ] **Step 7: Commit startup orchestration**

```powershell
git add scripts/Test-OneClickScripts.ps1 scripts/start.ps1 scripts/stop.ps1
git commit -m "feat: make local SQLite the default startup mode"
```

### Task 4: Documentation And End-To-End Verification

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add a failing documentation assertion**

Extend `scripts/Test-OneClickScripts.ps1` to load `README.md` and assert:

```powershell
$readme = Get-Content -LiteralPath (Join-Path $repoRoot "README.md") -Raw
if ($readme -notmatch "does not require Docker") {
    throw "README must state that default startup does not require Docker"
}
if ($readme -notmatch [regex]::Escape("scripts/start.ps1 -UseDocker")) {
    throw "README must document optional Docker startup"
}
```

Run the contract and expect failure on the first README assertion.

- [ ] **Step 2: Rewrite startup documentation**

Update README sections to state:

- prerequisites for default startup are Python 3.11+, Node.js 20+, and npm;
- double-clicking `start.cmd` uses persistent `.run/101-pro.db` and does not require Docker;
- the local worker processes PDF and DOCX imports asynchronously;
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start.ps1 -UseDocker` selects PostgreSQL, Redis, and Celery;
- SQLite and PostgreSQL data are separate and mode switching does not migrate data;
- `stop.cmd` preserves the SQLite file.

Retain the manual Docker development workflow under a clearly labeled optional section.

- [ ] **Step 3: Run all automated verification**

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/Test-OneClickScripts.ps1
python -m pytest -q
npm.cmd test -- --reporter=dot
npm.cmd run build
git diff --check
```

Run backend commands from `backend` and frontend commands from `frontend` or the existing ignored workspace verification mirror when sandbox restrictions block `frontend/node_modules`.

Expected: PowerShell contract passes; backend suite passes with only the known sandbox storage skip; four frontend tests pass; Vite production build succeeds; `git diff --check` exits zero.

- [ ] **Step 4: Perform local-mode smoke test**

Run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start.ps1 -NoBrowser
```

Verify:

```powershell
Invoke-WebRequest http://127.0.0.1:8000/api/health -UseBasicParsing
Invoke-WebRequest http://127.0.0.1:5173 -UseBasicParsing
Get-Content .run/startup-mode.txt
Test-Path .run/101-pro.db
```

Expected: both requests return HTTP 200, mode output is `local`, and the database path is `True`. Run `scripts/stop.ps1`, then verify `.run/101-pro.db` still exists and no Docker warning was emitted.

- [ ] **Step 5: Commit documentation**

```powershell
git add README.md scripts/Test-OneClickScripts.ps1
git commit -m "docs: explain local and Docker startup modes"
```

- [ ] **Step 6: Final repository check**

```powershell
git status --short --branch
git log -6 --oneline
```

Expected: clean working tree on `codex/multi-user-question-bank-platform`, with separate commits for SQLite runtime, local worker, startup orchestration, and documentation.
