# 101 Pro Question Bank Platform

101 Pro is a multi-user question bank application. Each account owns isolated question banks, can import PDF or DOCX documents, review LLM-generated drafts, practice questions, maintain a wrong-question list, and configure a personal OpenAI-compatible model provider.

## Stack

- Frontend: React, TypeScript, Vite, Vitest
- Backend: FastAPI, SQLAlchemy, Alembic, PostgreSQL
- Background jobs: Celery and Redis
- Document extraction: pypdf and python-docx

## Prerequisites

- Python 3.11+
- Node.js 20+
- Docker with Docker Compose

## Local Setup

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
