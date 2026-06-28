# 101 Pro Question Bank Platform

101 Pro is a multi-user question bank application. Each account owns isolated question banks, can import PDF or DOCX documents, review LLM-generated drafts, practice questions, maintain a wrong-question list, and configure a personal OpenAI-compatible model provider.

## Stack

- Frontend: React, TypeScript, Vite, Vitest
- Backend: FastAPI, SQLAlchemy, Alembic, SQLite or PostgreSQL
- Background jobs: local import worker or Celery and Redis
- Document extraction: pypdf and python-docx

## Prerequisites

- Python 3.11+
- Node.js 20+

Docker Desktop with Docker Compose is optional and is needed only for PostgreSQL, Redis, and Celery mode.

## One-Click Start on Windows

Double-click `start.cmd` in the repository root. Default startup does not require Docker. The launcher will:

- verify Python, Node.js, and npm;
- create `backend/.env` from `.env.example` only when it does not already exist;
- install or refresh backend and frontend dependencies when their manifests change;
- initialize the persistent `.run/101-pro.db` SQLite database;
- launch FastAPI, the asynchronous local document-import worker, and Vite;
- wait for the health checks and open `http://127.0.0.1:5173`.

Double-click `stop.cmd` to stop the application processes. The SQLite database and uploaded files are preserved. Runtime PID state and logs are stored under `.run/`, which is ignored by Git.

Double-click `restart.cmd` to stop and restart the application in one step.

Advanced PowerShell options:

```powershell
# Keep existing logs, skip dependency installation, and do not open a browser.
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start.ps1 -SkipInstall -NoBrowser

# Clear old logs before startup.
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start.ps1 -ResetLogs

# Use PostgreSQL, Redis, and Celery through Docker instead of local SQLite.
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start.ps1 -UseDocker

# Stop application processes but leave PostgreSQL and Redis running.
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/stop.ps1 -KeepInfrastructure

# Force stop (shorter timeout, useful for stubborn processes).
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/stop.ps1 -Force

# Restart with all options.
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/restart.ps1 -NoBrowser -Force
```

If startup fails, inspect `.run/logs/`. The script stops only the processes and containers it started during that attempt.

SQLite and PostgreSQL contain separate data. Switching modes does not copy accounts, question banks, or import jobs between them.

## Optional Docker Setup

The following PostgreSQL and Redis workflow remains available for development and compatibility testing.

Start PostgreSQL and Redis from the repository root:

```powershell
docker compose up -d postgres redis
Copy-Item backend/.env.example backend/.env
```

Install and start the backend:

```powershell
cd backend
python -m pip install -e ".[dev]"
alembic upgrade head
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

For PDF and DOCX import processing, start a Celery worker in another terminal:

```powershell
cd backend
celery -A app.tasks.celery_app:celery_app worker --loglevel=info --pool=solo
```

Install and start the frontend in another terminal:

```powershell
cd frontend
npm install
npm run dev
```

Local URLs:

- Frontend: `http://localhost:5173`
- Backend health: `http://localhost:8000/api/health`
- OpenAPI documentation: `http://localhost:8000/docs`

The Vite development server proxies `/api` requests to the backend on port `8000`.

## Model Provider

The model settings page supports OpenAI-compatible providers. A user-level API key takes priority over the platform-level `MODEL_API_KEY` in `backend/.env`. Saved API keys are encrypted by the backend and are never returned to the frontend.

For a shared platform provider, set these values in `backend/.env`:

```dotenv
MODEL_PROVIDER=openai-compatible
MODEL_BASE_URL=https://api.openai.com/v1
MODEL_NAME=gpt-4.1-mini
MODEL_API_KEY=
API_KEY_ENCRYPTION_SECRET=replace-with-a-long-random-secret
```

## Tests

Run the complete backend suite:

```powershell
cd backend
pytest -v
```

Run the complete frontend suite and production build:

```powershell
cd frontend
npm test
npm run build
```

The root scripts provide the same common commands after installing the root development dependency:

```powershell
npm install
npm test
npm run build
npm run dev
```

## Manual Smoke Test

1. Open `http://localhost:5173` and register a new account.
2. Create a private question bank.
3. Add one single-choice question and mark its correct option.
4. Start a one-question practice session from that bank.
5. Answer the question and verify the result score and accuracy.
6. Answer incorrectly in another session and verify that the question appears in the wrong-question list.
7. Mark the wrong question as mastered and verify the status filter.
8. Upload a PDF or DOCX file from Document Import.
9. Wait for the import job to reach review, edit a draft, approve it, and publish it to the selected bank.
10. Open Model Settings, save a provider, Base URL, model, and personal API key.
11. Reload Model Settings and verify that the saved raw API key is not displayed.
12. Use Test Connection to verify the saved model configuration.
