# Local SQLite Startup Design

## Goal

Allow Windows users to start the complete 101 Pro development application without Docker, PostgreSQL, Redis, or a separately installed task queue. Double-clicking `start.cmd` must launch a persistent local database, the API, asynchronous document import processing, and the frontend.

The existing PostgreSQL, Redis, and Celery workflow remains available as an explicit compatibility mode.

## User Experience

### Default local mode

`start.cmd` and `scripts/start.ps1` use local mode by default.

Local mode requires only:

- Python 3.11 or newer;
- Node.js 20 or newer;
- npm.

The launcher installs stale or missing dependencies, initializes the SQLite schema, starts FastAPI, starts a dedicated local import worker, starts Vite, waits for health checks, and opens the frontend. Docker is not inspected or required.

The SQLite database is stored at `.run/101-pro.db`. Normal shutdown and log reset operations must not remove it. Existing uploaded files also remain intact.

### Optional Docker mode

Running `scripts/start.ps1 -UseDocker` preserves the PostgreSQL, Redis, and Celery workflow. Docker and Docker Compose are checked only in this mode. Existing `backend/.env` values remain the source of the PostgreSQL and Redis connection settings.

`stop.cmd` reads the startup mode recorded in `.run/startup-mode.txt`. It stops PostgreSQL and Redis only when the recorded mode is Docker and `-KeepInfrastructure` is not supplied. Missing or stale mode state must result in application-process cleanup without an unnecessary Docker error.

## Architecture

### Runtime configuration

Add an `import_queue_mode` backend setting with `celery` as the normal configured default. The launcher overrides runtime environment variables without rewriting a user's `backend/.env`:

- Local mode sets `DATABASE_URL` to the absolute SQLite file URL and `IMPORT_QUEUE_MODE=local`.
- Docker mode sets `IMPORT_QUEUE_MODE=celery` and leaves the configured database and Redis URLs unchanged.

Environment variables take precedence over `.env`, so switching modes does not destroy user configuration.

### SQLite database support

The SQLAlchemy engine factory detects SQLite URLs and applies SQLite-specific connection behavior:

- allow sessions from the API's worker threads;
- wait for transient locks instead of failing immediately;
- enable foreign-key enforcement;
- enable WAL journal mode for API and worker concurrency.

The initial Alembic migration uses defaults accepted by both SQLite and PostgreSQL, including `CURRENT_TIMESTAMP` and portable JSON string defaults. Local startup still uses `alembic upgrade head`, so schema history remains managed rather than bypassing migrations with `create_all`.

### Local import worker

Local mode starts a dedicated Python process instead of Celery. The worker polls the SQLite database for pending import jobs and invokes the existing `process_import_job` service with its own SQLAlchemy session.

Only one local worker is launched by the startup script. The existing atomic transition from `pending` to `processing` remains the claim boundary, preventing duplicate processing. Jobs left in `pending` state survive restarts and are discovered when the worker starts again.

When `IMPORT_QUEUE_MODE=local`, `enqueue_import_job` leaves the committed job pending for the local worker. When set to `celery`, it continues calling the Celery task. Queue dispatch failures must be logged rather than silently changing a committed job into a false success state.

The local worker processes jobs serially. This is intentional for a local single-user machine: it avoids SQLite write contention and uncontrolled concurrent model requests while preserving asynchronous UI behavior.

## Process Lifecycle

PID tracking continues to use `.run/pids.json` and process start times. Local mode tracks:

- `backend`;
- `local-worker`;
- `frontend`.

Docker mode tracks:

- `backend`;
- `celery`;
- `frontend`.

Starting in a different mode stops an incompatible tracked worker before launching the selected one. Startup failure cleans up only processes and infrastructure created by that attempt. `stop.ps1` terminates tracked process trees and preserves the SQLite database.

Logs remain under `.run/logs/`, with separate files for the backend, local worker or Celery worker, and frontend.

## Error Handling

- Missing Python, Node.js, or npm produces a direct installation message before any service starts.
- Missing Docker produces an error only when `-UseDocker` is supplied.
- Migration failure prevents the API and worker from starting.
- A local worker exception is logged; the import service records the affected job as failed using its existing failure path.
- Occupied API or frontend ports retain the existing guarded failure behavior.
- A stale PID or mode file is repaired during the next start or stop operation.

## Compatibility And Data

Local SQLite and Docker PostgreSQL are separate databases. Switching modes does not copy data between them. The UI and API behavior are otherwise identical.

The SQLite file, runtime mode file, PID file, generated logs, and verification artifacts remain ignored by Git. Source-controlled configuration examples document both modes without embedding machine-specific absolute paths.

## Testing

Implementation follows test-first development.

Automated coverage must verify:

- SQLite engine options and connection pragmas;
- portable Alembic migration against a new SQLite database;
- local queue dispatch leaves jobs pending without contacting Celery;
- the local worker discovers and processes pending jobs through the existing service boundary;
- startup script validation confirms local mode is the default and Docker is conditional on `-UseDocker`;
- stop behavior does not require Docker after a local-mode run;
- the existing backend and frontend suites remain green.

Manual verification must confirm that local startup reaches the API and frontend health endpoints, a PDF or DOCX import progresses asynchronously, shutdown leaves `.run/101-pro.db` intact, and `-UseDocker` still follows the previous infrastructure path when Docker is available.

## Out Of Scope

- Automatic migration of data between SQLite and PostgreSQL;
- multiple concurrent local workers;
- production deployment on SQLite;
- packaging Python or Node.js with the repository;
- replacing Celery in Docker or production deployments.
