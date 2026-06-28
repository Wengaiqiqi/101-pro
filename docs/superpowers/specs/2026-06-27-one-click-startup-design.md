# One-Click Startup Design

## Goal

Provide a Windows-friendly double-click entry point that prepares and starts the complete local 101 Pro stack. A first run installs missing project dependencies; later runs reuse them and start quickly.

## User Interface

- `start.cmd` is the double-click entry point.
- `stop.cmd` stops only services started by this project.
- `scripts/start.ps1` performs setup and orchestration.
- `scripts/stop.ps1` performs PID-aware cleanup.
- The console reports each stage, actionable failures, log locations, and final URLs. The command wrapper pauses on failure so a double-clicked window does not disappear before the message can be read.
- On success, the default browser opens `http://localhost:5173` unless `-NoBrowser` is supplied to the PowerShell script.

## Startup Flow

1. Resolve the repository root from the script location so startup works from any current directory.
2. Verify that `docker`, Docker Compose, Python 3.11+, Node.js 20+, and npm are available.
3. Create `.run/logs` and clear stale PID records after verifying that recorded processes no longer exist.
4. Copy `backend/.env.example` to `backend/.env` only when `.env` is absent. Existing user configuration is never overwritten.
5. Hash `backend/pyproject.toml`. Install the backend with `python -m pip install -e ".[dev]"` when required imports are unavailable or the hash differs from the successful-install stamp in `.run`.
6. Hash `frontend/package.json`. Run `npm install` in `frontend` when the hash differs from its successful-install stamp, or when `frontend/node_modules/.bin/vite.cmd` is absent.
7. Start PostgreSQL and Redis with Docker Compose and wait until their ports are reachable.
8. Run `python -m alembic upgrade head` from `backend`.
9. Start FastAPI, Celery, and Vite as hidden background processes with stdout and stderr redirected to separate files under `.run/logs`.
10. Store process IDs and command ownership metadata in `.run/pids.json`.
11. Poll the backend health endpoint and frontend URL. If either fails, print the relevant log paths, stop processes started during this run, and exit nonzero.
12. Print the frontend, health, and OpenAPI URLs, then open the frontend in the default browser.

## Idempotency And Ownership

- If a recorded project process is still running and its expected endpoint is healthy, startup reuses it instead of creating a duplicate.
- If an application port is occupied by a process not recorded in `.run/pids.json`, startup fails with the port and remediation message. It never terminates an unknown process.
- PID records include FastAPI, Celery, and Vite only. Docker services are managed by Compose project service names.
- `stop.ps1` validates recorded process IDs before stopping them, removes stale records, and runs `docker compose stop postgres redis` by default.
- Missing processes and already-stopped Docker services are treated as successful cleanup.

## Error Handling

- Missing platform prerequisites fail before any installation or service mutation.
- Dependency installation, migration, or health-check failures return a nonzero exit code.
- Every background service has dedicated stdout and stderr logs.
- Startup cleanup affects only processes created during the current run or validated from this project's PID file. Docker services are stopped on failed startup only when this run started them.
- Secrets from `backend/.env` are never printed or copied into logs.

## Optional Flags

`scripts/start.ps1` supports:

- `-SkipInstall`: do not install missing Python or npm dependencies; fail if they are unavailable.
- `-NoBrowser`: do not open the frontend automatically.
- `-ResetLogs`: truncate existing service logs before startup.

`scripts/stop.ps1` supports:

- `-KeepInfrastructure`: stop application processes but leave PostgreSQL and Redis running.

## Verification

- Parse both PowerShell scripts without executing them.
- Verify command files resolve their PowerShell scripts relative to `%~dp0`.
- Run startup prerequisite checks in the current environment and confirm missing Docker produces a clear nonzero failure without creating background processes.
- Run existing backend and frontend test suites to ensure documentation and scripts do not affect application behavior.
- On a machine with Docker, execute `start.cmd`, verify all three URLs, then execute `stop.cmd` and verify recorded application processes are gone.
