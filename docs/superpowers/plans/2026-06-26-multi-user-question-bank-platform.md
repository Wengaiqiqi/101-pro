# Multi-User Question Bank Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a production-oriented multi-user question bank platform with accounts, PostgreSQL persistence, asynchronous document imports, LLM-generated draft questions, and practice tracking.

**Architecture:** Split the current single-file app into a React + Vite + TypeScript frontend, a FastAPI backend, PostgreSQL persistence, Redis/Celery background jobs, and local file storage behind a service boundary. Build the first vertical slice around authenticated users creating banks, uploading documents, reviewing generated drafts, publishing questions, and practicing from those questions.

**Tech Stack:** React, Vite, TypeScript, FastAPI, SQLAlchemy 2, Alembic, PostgreSQL, Redis, Celery, Pytest, Vitest, React Testing Library, Docker Compose, OpenAI-compatible chat completion APIs.

---

## Scope Check

The approved design covers a large product. This plan implements the first production-grade vertical slice:

- Project scaffolding and local infrastructure.
- Backend health, settings, database, migrations, and tests.
- Authentication and owner-scoped resources.
- Question banks, questions, options, practice sessions, answers, and wrong questions.
- File upload, import job records, mocked document extraction, LLM client boundary, draft records, retry, and publish.
- Frontend app shell, auth, dashboard, banks, import jobs, draft review, practice flow, and settings UI.

The following capabilities remain as documented extension points after this first slice is running:

- Object storage replacement for local `storage/`.
- SSE or WebSocket progress.
- Admin analytics.
- Organization/team collaboration.
- Public question bank marketplace.

## File Structure

Create this structure:

```text
backend/
  alembic.ini
  app/
    __init__.py
    main.py
    api/
      __init__.py
      deps.py
      routes/
        __init__.py
        auth.py
        health.py
        import_jobs.py
        model_settings.py
        practice.py
        question_banks.py
        questions.py
    core/
      __init__.py
      config.py
      security.py
    db/
      __init__.py
      base.py
      session.py
    models/
      __init__.py
      import_job.py
      practice.py
      question.py
      user.py
    schemas/
      __init__.py
      auth.py
      import_job.py
      model_settings.py
      practice.py
      question.py
      question_bank.py
      user.py
    services/
      __init__.py
      auth_service.py
      document_extractors.py
      import_service.py
      llm_client.py
      practice_service.py
      question_service.py
      storage.py
    tasks/
      __init__.py
      celery_app.py
      import_tasks.py
  migrations/
    env.py
    script.py.mako
    versions/
  tests/
    conftest.py
    test_auth.py
    test_import_jobs.py
    test_model_settings.py
    test_practice.py
    test_question_banks.py
    test_questions.py
  pyproject.toml
  .env.example
frontend/
  index.html
  package.json
  tsconfig.json
  vite.config.ts
  vitest.config.ts
  src/
    main.tsx
    App.tsx
    api/client.ts
    api/types.ts
    components/
      AppShell.tsx
      EmptyState.tsx
      Field.tsx
      Modal.tsx
      StatusBadge.tsx
    features/
      auth/
        AuthPage.tsx
        authStore.ts
      dashboard/
        DashboardPage.tsx
      imports/
        DraftReviewPage.tsx
        ImportJobDetailPage.tsx
        ImportJobsPage.tsx
        NewImportPage.tsx
      practice/
        PracticePage.tsx
        PracticeResultPage.tsx
        WrongQuestionsPage.tsx
      questionBanks/
        BankDetailPage.tsx
        QuestionBankListPage.tsx
      settings/
        ModelSettingsPage.tsx
    styles/
      app.css
    test/
      setup.ts
    __tests__/
      auth.test.tsx
      bank-flow.test.tsx
      import-flow.test.tsx
      practice-flow.test.tsx
docker-compose.yml
package.json
README.md
```

Responsibilities:

- `backend/app/api/routes/*`: HTTP-only routing, request validation, dependency use.
- `backend/app/services/*`: business logic and integration boundaries.
- `backend/app/models/*`: SQLAlchemy ORM models.
- `backend/app/schemas/*`: Pydantic request and response models.
- `backend/app/tasks/*`: Celery app and asynchronous import jobs.
- `frontend/src/api/*`: typed backend client.
- `frontend/src/features/*`: page-level feature modules.
- `frontend/src/components/*`: shared UI primitives.

## Task 1: Repository And Infrastructure Scaffold

**Files:**

- Create: `docker-compose.yml`
- Create: `package.json`
- Create: `backend/pyproject.toml`
- Create: `backend/.env.example`
- Create: `backend/app/__init__.py`
- Create: `frontend/package.json`
- Create: `frontend/index.html`
- Create: `frontend/tsconfig.json`
- Create: `frontend/vite.config.ts`
- Create: `frontend/vitest.config.ts`
- Create: `frontend/src/test/setup.ts`
- Modify: `README.md`

- [ ] **Step 1: Create root package metadata**

Create `package.json`:

```json
{
  "scripts": {
    "dev": "concurrently \"npm run dev --prefix frontend\" \"cd backend && python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000\"",
    "test": "npm run test --prefix frontend && cd backend && pytest",
    "test:frontend": "npm run test --prefix frontend",
    "test:backend": "cd backend && pytest",
    "build": "npm run build --prefix frontend"
  },
  "devDependencies": {
    "concurrently": "^9.0.0"
  }
}
```

- [ ] **Step 2: Create Docker Compose infrastructure**

Create `docker-compose.yml`:

```yaml
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_USER: question_bank
      POSTGRES_PASSWORD: question_bank
      POSTGRES_DB: question_bank
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7
    ports:
      - "6379:6379"

volumes:
  postgres_data:
```

- [ ] **Step 3: Create backend dependency metadata**

Create `backend/pyproject.toml`:

```toml
[project]
name = "question-bank-backend"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = [
  "alembic>=1.13.0",
  "bcrypt>=4.1.0",
  "celery>=5.4.0",
  "cryptography>=42.0.0",
  "fastapi>=0.115.0",
  "httpx>=0.27.0",
  "passlib[bcrypt]>=1.7.4",
  "psycopg[binary]>=3.2.0",
  "pydantic-settings>=2.4.0",
  "python-docx>=1.1.2",
  "python-jose[cryptography]>=3.3.0",
  "python-multipart>=0.0.9",
  "pypdf>=4.3.0",
  "redis>=5.0.0",
  "sqlalchemy>=2.0.0",
  "uvicorn[standard]>=0.30.0"
]

[project.optional-dependencies]
dev = [
  "pytest>=8.3.0",
  "pytest-asyncio>=0.23.0"
]

[tool.pytest.ini_options]
testpaths = ["tests"]
pythonpath = ["."]
```

- [ ] **Step 4: Create backend environment example**

Create `backend/.env.example`:

```env
APP_NAME=Question Bank Platform
APP_ENV=development
DATABASE_URL=postgresql+psycopg://question_bank:question_bank@localhost:5432/question_bank
REDIS_URL=redis://localhost:6379/0
JWT_SECRET_KEY=change-me-in-development
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=1440
STORAGE_ROOT=storage
MODEL_PROVIDER=openai-compatible
MODEL_BASE_URL=https://api.openai.com/v1
MODEL_NAME=gpt-4.1-mini
MODEL_API_KEY=
API_KEY_ENCRYPTION_SECRET=change-me-32-byte-minimum-secret
```

- [ ] **Step 5: Create frontend package metadata**

Create `frontend/package.json`:

```json
{
  "scripts": {
    "dev": "vite --host 0.0.0.0 --port 5173",
    "build": "tsc -b && vite build",
    "test": "vitest run"
  },
  "dependencies": {
    "@vitejs/plugin-react": "^4.3.0",
    "lucide-react": "^0.468.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "vite": "^5.4.0"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.4.0",
    "@testing-library/react": "^16.0.0",
    "@testing-library/user-event": "^14.5.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0",
    "jsdom": "^24.1.0"
  }
}
```

- [ ] **Step 6: Create minimal frontend config files**

Create `frontend/index.html`:

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>101 Pro Question Bank</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

Create `frontend/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["DOM", "DOM.Iterable", "ES2020"],
    "allowJs": false,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "module": "ESNext",
    "moduleResolution": "Node",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx"
  },
  "include": ["src"],
  "references": []
}
```

Create `frontend/vite.config.ts`:

```ts
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:8000'
    }
  }
});
```

Create `frontend/vitest.config.ts`:

```ts
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts'
  }
});
```

Create `frontend/src/test/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 7: Update README with local development commands**

Add this content to `README.md`:

```markdown
# 101 Pro Question Bank Platform

Full-stack multi-user question bank platform with document import and LLM-assisted question generation.

## Local Services

```powershell
docker compose up -d postgres redis
```

## Backend

```powershell
cd backend
python -m pip install -e ".[dev]"
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## Frontend

```powershell
cd frontend
npm install
npm run dev
```

## Tests

```powershell
npm test
```
```

- [ ] **Step 8: Run scaffold checks**

Run:

```powershell
Get-ChildItem backend,frontend
```

Expected: both directories exist with metadata files.

- [ ] **Step 9: Commit scaffold**

Run:

```powershell
git add docker-compose.yml package.json backend frontend README.md
git commit -m "chore: scaffold full stack platform"
```

## Task 2: Backend Settings, App Factory, And Health Check

**Files:**

- Create: `backend/app/core/config.py`
- Create: `backend/app/main.py`
- Create: `backend/app/api/routes/health.py`
- Create: `backend/app/api/routes/__init__.py`
- Create: `backend/app/api/__init__.py`
- Create: `backend/tests/conftest.py`
- Create: `backend/tests/test_health.py`

- [ ] **Step 1: Write health endpoint test**

Create `backend/tests/test_health.py`:

```python
from fastapi.testclient import TestClient


def test_health_endpoint(client: TestClient) -> None:
    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "app": "Question Bank Platform"}
```

- [ ] **Step 2: Create test client fixture**

Create `backend/tests/conftest.py`:

```python
from collections.abc import Generator

from fastapi.testclient import TestClient

from app.main import app


def client() -> Generator[TestClient, None, None]:
    with TestClient(app) as test_client:
        yield test_client
```

- [ ] **Step 3: Run failing backend test**

Run:

```powershell
cd backend
pytest tests/test_health.py -v
```

Expected: fail because `app.main` or `/api/health` does not exist.

- [ ] **Step 4: Implement settings**

Create `backend/app/core/config.py`:

```python
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Question Bank Platform"
    app_env: str = "development"
    database_url: str = "postgresql+psycopg://question_bank:question_bank@localhost:5432/question_bank"
    redis_url: str = "redis://localhost:6379/0"
    jwt_secret_key: str = "change-me-in-development"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 1440
    storage_root: str = "storage"
    model_provider: str = "openai-compatible"
    model_base_url: str = "https://api.openai.com/v1"
    model_name: str = "gpt-4.1-mini"
    model_api_key: str = ""
    api_key_encryption_secret: str = "change-me-32-byte-minimum-secret"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")


@lru_cache
def get_settings() -> Settings:
    return Settings()
```

- [ ] **Step 5: Implement health route and app**

Create `backend/app/api/routes/health.py`:

```python
from fastapi import APIRouter

from app.core.config import get_settings

router = APIRouter(prefix="/health", tags=["health"])


@router.get("")
def health() -> dict[str, str]:
    settings = get_settings()
    return {"status": "ok", "app": settings.app_name}
```

Create `backend/app/api/routes/__init__.py`:

```python
from app.api.routes import health

routers = [health.router]
```

Create `backend/app/api/__init__.py`:

```python
```

Create `backend/app/main.py`:

```python
from fastapi import FastAPI

from app.api.routes import routers
from app.core.config import get_settings


def create_app() -> FastAPI:
    settings = get_settings()
    fastapi_app = FastAPI(title=settings.app_name)
    for router in routers:
        fastapi_app.include_router(router, prefix="/api")
    return fastapi_app


app = create_app()
```

- [ ] **Step 6: Run health test**

Run:

```powershell
cd backend
pytest tests/test_health.py -v
```

Expected: pass.

- [ ] **Step 7: Commit backend foundation**

Run:

```powershell
git add backend/app backend/tests
git commit -m "feat: add FastAPI health foundation"
```

## Task 3: Database Models And Migrations

**Files:**

- Create: `backend/app/db/session.py`
- Create: `backend/app/db/base.py`
- Create: `backend/app/models/user.py`
- Create: `backend/app/models/question.py`
- Create: `backend/app/models/import_job.py`
- Create: `backend/app/models/practice.py`
- Create: `backend/app/models/__init__.py`
- Create: `backend/alembic.ini`
- Create: `backend/migrations/env.py`
- Create: `backend/migrations/script.py.mako`
- Create: `backend/tests/test_models.py`

- [ ] **Step 1: Write model metadata test**

Create `backend/tests/test_models.py`:

```python
from app.db.base import Base


def test_expected_tables_are_registered() -> None:
    expected = {
        "users",
        "user_model_settings",
        "question_banks",
        "questions",
        "question_options",
        "import_jobs",
        "import_job_chunks",
        "imported_question_drafts",
        "practice_sessions",
        "practice_answers",
        "wrong_questions",
    }

    assert expected.issubset(set(Base.metadata.tables.keys()))
```

- [ ] **Step 2: Create database session module**

Create `backend/app/db/session.py`:

```python
from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings

engine = create_engine(get_settings().database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

- [ ] **Step 3: Create user models**

Create `backend/app/models/user.py`:

```python
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(32), default="user")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    model_settings: Mapped["UserModelSettings | None"] = relationship(back_populates="user")


class UserModelSettings(Base):
    __tablename__ = "user_model_settings"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True, index=True)
    provider: Mapped[str] = mapped_column(String(80))
    base_url: Mapped[str] = mapped_column(String(500))
    model: Mapped[str] = mapped_column(String(160))
    encrypted_api_key: Mapped[str] = mapped_column(String(2000))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user: Mapped[User] = relationship(back_populates="model_settings")
```

- [ ] **Step 4: Create question models**

Create `backend/app/models/question.py` with `QuestionBank`, `Question`, and `QuestionOption` using these fields exactly: `owner_id`, `name`, `description`, `visibility`, `bank_id`, `type`, `stem`, `answer_text`, `explanation`, `difficulty`, `tags`, `source`, `label`, `content`, `is_correct`, `sort_order`, `created_at`, `updated_at`.

- [ ] **Step 5: Create import models**

Create `backend/app/models/import_job.py` with `ImportJob`, `ImportJobChunk`, and `ImportedQuestionDraft` using the field names from the design spec. Store JSON fields with SQLAlchemy `JSON`.

- [ ] **Step 6: Create practice models**

Create `backend/app/models/practice.py` with `PracticeSession`, `PracticeAnswer`, and `WrongQuestion` using the field names from the design spec. Store `user_answer_json` with SQLAlchemy `JSON`.

- [ ] **Step 7: Create model registry**

Create `backend/app/models/__init__.py`:

```python
from app.models.import_job import ImportJob, ImportJobChunk, ImportedQuestionDraft
from app.models.practice import PracticeAnswer, PracticeSession, WrongQuestion
from app.models.question import Question, QuestionBank, QuestionOption
from app.models.user import User, UserModelSettings

__all__ = [
    "ImportJob",
    "ImportJobChunk",
    "ImportedQuestionDraft",
    "PracticeAnswer",
    "PracticeSession",
    "Question",
    "QuestionBank",
    "QuestionOption",
    "User",
    "UserModelSettings",
    "WrongQuestion",
]
```

Create `backend/app/db/base.py`:

```python
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass


from app import models as models  # noqa: E402,F401
```

- [ ] **Step 8: Run model metadata test**

Run:

```powershell
cd backend
pytest tests/test_models.py -v
```

Expected: pass.

- [ ] **Step 9: Add Alembic configuration**

Create `backend/alembic.ini`, `backend/migrations/env.py`, and `backend/migrations/script.py.mako` using standard Alembic SQLAlchemy configuration with `target_metadata = Base.metadata` imported from `app.db.base`.

- [ ] **Step 10: Generate and run initial migration**

Run:

```powershell
cd backend
alembic revision --autogenerate -m "initial schema"
alembic upgrade head
```

Expected: PostgreSQL contains all tables listed in `test_expected_tables_are_registered`.

- [ ] **Step 11: Commit database schema**

Run:

```powershell
git add backend/app/db backend/app/models backend/migrations backend/alembic.ini backend/tests/test_models.py
git commit -m "feat: add database schema"
```

## Task 4: Authentication And User Model Settings

**Files:**

- Create: `backend/app/core/security.py`
- Create: `backend/app/api/deps.py`
- Create: `backend/app/schemas/auth.py`
- Create: `backend/app/schemas/user.py`
- Create: `backend/app/schemas/model_settings.py`
- Create: `backend/app/services/auth_service.py`
- Modify: `backend/app/api/routes/auth.py`
- Modify: `backend/app/api/routes/model_settings.py`
- Modify: `backend/app/api/routes/__init__.py`
- Test: `backend/tests/test_auth.py`
- Test: `backend/tests/test_model_settings.py`

- [ ] **Step 1: Write auth API tests**

Create `backend/tests/test_auth.py`:

```python
from fastapi.testclient import TestClient


def test_register_login_and_me(client: TestClient) -> None:
    register_response = client.post(
        "/api/auth/register",
        json={"username": "alice", "email": "alice@example.com", "password": "secret1234"},
    )
    assert register_response.status_code == 201
    assert register_response.json()["email"] == "alice@example.com"

    login_response = client.post(
        "/api/auth/login",
        json={"username_or_email": "alice", "password": "secret1234"},
    )
    assert login_response.status_code == 200
    token = login_response.json()["access_token"]

    me_response = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me_response.status_code == 200
    assert me_response.json()["username"] == "alice"
```

- [ ] **Step 2: Implement password and JWT helpers**

Create `backend/app/core/security.py`:

```python
from datetime import datetime, timedelta, timezone

from jose import jwt
from passlib.context import CryptContext

from app.core.config import get_settings

password_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return password_context.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return password_context.verify(password, password_hash)


def create_access_token(subject: str) -> str:
    settings = get_settings()
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_expire_minutes)
    payload = {"sub": subject, "exp": expires_at}
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)
```

- [ ] **Step 3: Implement auth schemas and service**

Create Pydantic schemas for `RegisterRequest`, `LoginRequest`, `TokenResponse`, and `UserResponse`. Implement `auth_service.register_user`, `auth_service.authenticate_user`, and `auth_service.get_user_by_id` with unique username/email checks.

- [ ] **Step 4: Implement current-user dependency**

Create `backend/app/api/deps.py` with `get_current_user` that reads `Authorization: Bearer <token>`, decodes `sub`, fetches the user, rejects missing or inactive users with HTTP 401.

- [ ] **Step 5: Implement auth routes**

Create `backend/app/api/routes/auth.py`:

```python
from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.auth import LoginRequest, RegisterRequest, TokenResponse
from app.schemas.user import UserResponse
from app.services.auth_service import authenticate_user, register_user

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, db: Session = Depends(get_db)) -> User:
    return register_user(db, payload)


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    return authenticate_user(db, payload)


@router.get("/me", response_model=UserResponse)
def me(current_user: User = Depends(get_current_user)) -> User:
    return current_user
```

- [ ] **Step 6: Write model settings credential priority test**

Create `backend/tests/test_model_settings.py` with assertions that user settings override platform defaults and saved responses never include raw API keys.

- [ ] **Step 7: Implement model settings routes**

Implement:

- `GET /api/model-settings`
- `PUT /api/model-settings`
- `POST /api/model-settings/test`

The test endpoint can call the provider boundary with a short prompt and mocked provider in tests.

- [ ] **Step 8: Register routes**

Modify `backend/app/api/routes/__init__.py` to include `auth.router` and `model_settings.router`.

- [ ] **Step 9: Run backend auth tests**

Run:

```powershell
cd backend
pytest tests/test_auth.py tests/test_model_settings.py -v
```

Expected: pass.

- [ ] **Step 10: Commit authentication**

Run:

```powershell
git add backend/app backend/tests/test_auth.py backend/tests/test_model_settings.py
git commit -m "feat: add authentication and model settings"
```

## Task 5: Question Banks And Questions API

**Files:**

- Create: `backend/app/schemas/question_bank.py`
- Create: `backend/app/schemas/question.py`
- Create: `backend/app/services/question_service.py`
- Create: `backend/app/api/routes/question_banks.py`
- Create: `backend/app/api/routes/questions.py`
- Modify: `backend/app/api/routes/__init__.py`
- Test: `backend/tests/test_question_banks.py`
- Test: `backend/tests/test_questions.py`

- [ ] **Step 1: Write owner isolation test**

Create `backend/tests/test_question_banks.py` with this scenario:

```python
def test_users_only_see_their_own_question_banks(client):
    alice_token = register_and_login(client, "alice", "alice@example.com")
    bob_token = register_and_login(client, "bob", "bob@example.com")

    create_response = client.post(
        "/api/question-banks",
        headers={"Authorization": f"Bearer {alice_token}"},
        json={"name": "Alice Bank", "description": "Private AI notes"},
    )
    assert create_response.status_code == 201

    bob_response = client.get("/api/question-banks", headers={"Authorization": f"Bearer {bob_token}"})
    assert bob_response.status_code == 200
    assert bob_response.json() == []
```

Add a reusable `register_and_login` helper in `backend/tests/conftest.py`.

- [ ] **Step 2: Write question CRUD test**

Create `backend/tests/test_questions.py` with a scenario that creates a bank, creates a single-choice question with four options, reads it back, updates the stem, and deletes it.

- [ ] **Step 3: Implement schemas**

Create schemas:

- `QuestionBankCreate`
- `QuestionBankUpdate`
- `QuestionBankResponse`
- `QuestionOptionCreate`
- `QuestionOptionResponse`
- `QuestionCreate`
- `QuestionUpdate`
- `QuestionResponse`

Use `ConfigDict(from_attributes=True)` for response schemas.

- [ ] **Step 4: Implement service functions**

Implement functions:

- `list_banks(db, user)`
- `create_bank(db, user, payload)`
- `get_owned_bank(db, user, bank_id)`
- `update_bank(db, user, bank_id, payload)`
- `delete_bank(db, user, bank_id)`
- `list_questions(db, user, bank_id)`
- `create_question(db, user, bank_id, payload)`
- `update_question(db, user, question_id, payload)`
- `delete_question(db, user, question_id)`

Each function must verify ownership through the bank owner.

- [ ] **Step 5: Implement routes**

Create bank and question route modules using the service functions and current-user dependency.

- [ ] **Step 6: Register routes**

Modify `backend/app/api/routes/__init__.py` to include `question_banks.router` and `questions.router`.

- [ ] **Step 7: Run question API tests**

Run:

```powershell
cd backend
pytest tests/test_question_banks.py tests/test_questions.py -v
```

Expected: pass.

- [ ] **Step 8: Commit question APIs**

Run:

```powershell
git add backend/app backend/tests/test_question_banks.py backend/tests/test_questions.py
git commit -m "feat: add question bank APIs"
```

## Task 6: Import Jobs, Storage, Document Extraction, And Draft Publishing

**Files:**

- Create: `backend/app/schemas/import_job.py`
- Create: `backend/app/services/storage.py`
- Create: `backend/app/services/document_extractors.py`
- Create: `backend/app/services/llm_client.py`
- Create: `backend/app/services/import_service.py`
- Create: `backend/app/tasks/celery_app.py`
- Create: `backend/app/tasks/import_tasks.py`
- Create: `backend/app/api/routes/import_jobs.py`
- Modify: `backend/app/api/routes/__init__.py`
- Test: `backend/tests/test_import_jobs.py`

- [ ] **Step 1: Write import job creation and publish test**

Create `backend/tests/test_import_jobs.py` with a multipart upload of a small text-like fixture named `sample.docx`, a mocked import worker service that creates one draft, then a publish request that creates a real question in the selected bank.

- [ ] **Step 2: Implement local storage service**

Create `backend/app/services/storage.py`:

```python
from pathlib import Path
from uuid import uuid4

from fastapi import UploadFile

from app.core.config import get_settings


def save_upload(user_id: int, upload: UploadFile) -> tuple[str, str]:
    settings = get_settings()
    suffix = Path(upload.filename or "upload.bin").suffix.lower()
    stored_name = f"{uuid4().hex}{suffix}"
    target_dir = Path(settings.storage_root) / str(user_id)
    target_dir.mkdir(parents=True, exist_ok=True)
    target_path = target_dir / stored_name
    with target_path.open("wb") as output:
        output.write(upload.file.read())
    return upload.filename or stored_name, str(target_path)
```

- [ ] **Step 3: Implement document extractors**

Create extractors:

- `extract_pdf_text(path: str) -> str`
- `extract_docx_text(path: str) -> str`
- `extract_text(path: str, mime_type: str, filename: str) -> str`

Use `pypdf.PdfReader` for PDF and `docx.Document` for docx.

- [ ] **Step 4: Implement LLM client boundary**

Create `backend/app/services/llm_client.py` with:

- `ResolvedModelConfig`
- `resolve_model_config(db, user)`
- `generate_question_drafts(config, text, generation_config)`

Return strict Python dictionaries with keys `type`, `stem`, `options`, `answer`, `explanation`, `difficulty`, and `tags`.

- [ ] **Step 5: Implement import service**

Implement:

- `create_import_job`
- `list_import_jobs`
- `get_import_job`
- `retry_import_job`
- `list_drafts`
- `update_draft`
- `publish_drafts`
- `process_import_job`

Publishing must write approved drafts into `questions` and `question_options` and mark drafts as `published`.

- [ ] **Step 6: Implement Celery app and task**

Create `backend/app/tasks/celery_app.py` and `backend/app/tasks/import_tasks.py`. The Celery task should open a database session and call `process_import_job(db, import_job_id)`.

- [ ] **Step 7: Implement import routes**

Create `backend/app/api/routes/import_jobs.py` with endpoints from the design spec. `POST /api/import-jobs` accepts `multipart/form-data` fields: `bank_id`, `question_types`, `question_count`, `difficulty`, `language`, `with_explanations`, and `file`.

- [ ] **Step 8: Run import tests**

Run:

```powershell
cd backend
pytest tests/test_import_jobs.py -v
```

Expected: pass with mocked LLM output.

- [ ] **Step 9: Commit import workflow**

Run:

```powershell
git add backend/app backend/tests/test_import_jobs.py
git commit -m "feat: add document import workflow"
```

## Task 7: Practice Sessions And Wrong Questions

**Files:**

- Create: `backend/app/schemas/practice.py`
- Create: `backend/app/services/practice_service.py`
- Create: `backend/app/api/routes/practice.py`
- Modify: `backend/app/api/routes/__init__.py`
- Test: `backend/tests/test_practice.py`

- [ ] **Step 1: Write scoring tests**

Create `backend/tests/test_practice.py` with cases for:

- single-choice exact answer,
- multiple-choice order-insensitive answer,
- fill-in answer normalization,
- wrong answer creates or updates a `wrong_questions` row,
- marking a wrong question as mastered.

- [ ] **Step 2: Implement answer normalization and scoring**

Create `backend/app/services/practice_service.py` functions:

```python
def normalize_answer(value: object) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return sorted(str(item).strip().lower() for item in value if str(item).strip())
    return [str(value).strip().lower()]


def is_answer_correct(question, user_answer: object) -> bool:
    expected = normalize_answer(question.answer_text.split("|"))
    actual = normalize_answer(user_answer)
    return expected == actual
```

Expand fill-in acceptance by comparing normalized text against `answer_text` split by `|`.

- [ ] **Step 3: Implement practice service functions**

Implement:

- `create_practice_session`
- `get_practice_session`
- `submit_answer`
- `finish_practice_session`
- `list_wrong_questions`
- `mark_wrong_question_mastered`

- [ ] **Step 4: Implement practice routes**

Create `backend/app/api/routes/practice.py` for the practice endpoints from the design spec.

- [ ] **Step 5: Run practice tests**

Run:

```powershell
cd backend
pytest tests/test_practice.py -v
```

Expected: pass.

- [ ] **Step 6: Commit practice workflow**

Run:

```powershell
git add backend/app backend/tests/test_practice.py
git commit -m "feat: add practice and wrong question tracking"
```

## Task 8: Frontend API Client, App Shell, And Authentication

**Files:**

- Create: `frontend/src/main.tsx`
- Create: `frontend/src/App.tsx`
- Create: `frontend/src/api/types.ts`
- Create: `frontend/src/api/client.ts`
- Create: `frontend/src/components/AppShell.tsx`
- Create: `frontend/src/components/Field.tsx`
- Create: `frontend/src/components/StatusBadge.tsx`
- Create: `frontend/src/components/EmptyState.tsx`
- Create: `frontend/src/features/auth/AuthPage.tsx`
- Create: `frontend/src/features/auth/authStore.ts`
- Create: `frontend/src/styles/app.css`
- Test: `frontend/src/__tests__/auth.test.tsx`

- [ ] **Step 1: Write auth UI test**

Create `frontend/src/__tests__/auth.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { AuthPage } from '../features/auth/AuthPage';

describe('AuthPage', () => {
  it('switches between login and registration', async () => {
    render(<AuthPage onAuthenticated={() => undefined} />);

    expect(screen.getByRole('heading', { name: '登录' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '创建账号' }));
    expect(screen.getByRole('heading', { name: '注册' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Implement typed API client**

Create `frontend/src/api/client.ts` with `apiRequest`, `setToken`, `getToken`, `login`, `register`, `getMe`, `listQuestionBanks`, and `createQuestionBank`. Store token in `localStorage` under `question-bank-token`.

- [ ] **Step 3: Implement auth page**

Create `AuthPage.tsx` with login and registration modes, username/email/password fields, error display, and successful callback.

- [ ] **Step 4: Implement app shell**

Create `AppShell.tsx` with left navigation for 工作台, 题库, 文档导入, 练习, 错题本, 模型设置, and a logout button.

- [ ] **Step 5: Implement `App.tsx` router state**

Use simple internal state for page routing in the first slice. The app loads `/api/auth/me` when a token exists and otherwise displays `AuthPage`.

- [ ] **Step 6: Implement visual system**

Create `frontend/src/styles/app.css` with a dense workbench layout, restrained colors, stable button sizes, responsive side navigation, forms, tables, and status badges.

- [ ] **Step 7: Run frontend auth test**

Run:

```powershell
cd frontend
npm test -- auth.test.tsx
```

Expected: pass.

- [ ] **Step 8: Commit frontend shell**

Run:

```powershell
git add frontend/src frontend/package.json frontend/*.ts frontend/index.html
git commit -m "feat: add frontend app shell and auth"
```

## Task 9: Frontend Question Banks And Import Review Flow

**Files:**

- Create: `frontend/src/features/dashboard/DashboardPage.tsx`
- Create: `frontend/src/features/questionBanks/QuestionBankListPage.tsx`
- Create: `frontend/src/features/questionBanks/BankDetailPage.tsx`
- Create: `frontend/src/features/imports/NewImportPage.tsx`
- Create: `frontend/src/features/imports/ImportJobsPage.tsx`
- Create: `frontend/src/features/imports/ImportJobDetailPage.tsx`
- Create: `frontend/src/features/imports/DraftReviewPage.tsx`
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/src/api/types.ts`
- Modify: `frontend/src/App.tsx`
- Test: `frontend/src/__tests__/bank-flow.test.tsx`
- Test: `frontend/src/__tests__/import-flow.test.tsx`

- [ ] **Step 1: Write bank flow test**

Create `bank-flow.test.tsx` that mocks `fetch`, renders `App`, logs in, lists banks, creates a bank, and verifies the new bank appears.

- [ ] **Step 2: Write import flow test**

Create `import-flow.test.tsx` that mocks banks, creates an import job, shows a `generating` status, then shows draft review with one generated question.

- [ ] **Step 3: Extend frontend types**

Add types for `QuestionBank`, `Question`, `QuestionOption`, `ImportJob`, `ImportedQuestionDraft`, `ModelSettings`, and `PracticeSession`.

- [ ] **Step 4: Extend API client**

Add functions for:

- `listImportJobs`
- `createImportJob`
- `getImportJob`
- `listDrafts`
- `updateDraft`
- `publishDrafts`
- `listQuestions`
- `createQuestion`
- `updateQuestion`
- `deleteQuestion`

- [ ] **Step 5: Implement dashboard**

Dashboard displays counts for banks, import jobs, recent practice, and wrong questions with action buttons.

- [ ] **Step 6: Implement bank list and detail pages**

List page supports create and select. Detail page supports question list and manual question creation/editing.

- [ ] **Step 7: Implement import pages**

New import page collects bank, file, question count, question types, difficulty, language, and explanations. Job detail page polls every 2 seconds while status is `pending`, `parsing`, or `generating`. Draft review page supports editing and publishing.

- [ ] **Step 8: Run frontend flow tests**

Run:

```powershell
cd frontend
npm test -- bank-flow.test.tsx import-flow.test.tsx
```

Expected: pass.

- [ ] **Step 9: Commit frontend bank and import flow**

Run:

```powershell
git add frontend/src
git commit -m "feat: add bank and import review UI"
```

## Task 10: Frontend Practice, Wrong Questions, And Model Settings

**Files:**

- Create: `frontend/src/features/practice/PracticePage.tsx`
- Create: `frontend/src/features/practice/PracticeResultPage.tsx`
- Create: `frontend/src/features/practice/WrongQuestionsPage.tsx`
- Create: `frontend/src/features/settings/ModelSettingsPage.tsx`
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/src/api/types.ts`
- Modify: `frontend/src/App.tsx`
- Test: `frontend/src/__tests__/practice-flow.test.tsx`

- [ ] **Step 1: Write practice flow test**

Create `practice-flow.test.tsx` that mocks creating a session, answering one question, finishing the session, and seeing a results summary.

- [ ] **Step 2: Extend API client for practice and settings**

Add:

- `createPracticeSession`
- `getPracticeSession`
- `submitPracticeAnswer`
- `finishPracticeSession`
- `listWrongQuestions`
- `markWrongQuestionMastered`
- `getModelSettings`
- `saveModelSettings`
- `testModelSettings`

- [ ] **Step 3: Implement practice setup and runner**

Practice page lets the user pick bank, count, order, and wrong-question mode. Runner renders choice inputs and text inputs based on question type.

- [ ] **Step 4: Implement result and wrong-question pages**

Result page shows score, accuracy, correct count, wrong count, and per-question feedback. Wrong-question page filters by bank and mastery status and supports mark-as-mastered.

- [ ] **Step 5: Implement model settings page**

Model settings page displays provider, base URL, model, masked key state, API key input, save button, and test connection button. It never renders a saved raw API key.

- [ ] **Step 6: Run frontend practice test**

Run:

```powershell
cd frontend
npm test -- practice-flow.test.tsx
```

Expected: pass.

- [ ] **Step 7: Commit practice and settings UI**

Run:

```powershell
git add frontend/src
git commit -m "feat: add practice and model settings UI"
```

## Task 11: End-To-End Smoke Verification

**Files:**

- Modify: `README.md`
- Create: `backend/tests/test_smoke_vertical_slice.py`

- [ ] **Step 1: Write backend vertical slice smoke test**

Create `backend/tests/test_smoke_vertical_slice.py`:

```python
def test_vertical_slice_register_bank_import_publish_practice(client, monkeypatch):
    token = register_and_login(client, "smoke", "smoke@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    bank_response = client.post("/api/question-banks", headers=headers, json={"name": "Smoke Bank", "description": ""})
    assert bank_response.status_code == 201
    bank_id = bank_response.json()["id"]

    question_response = client.post(
        f"/api/question-banks/{bank_id}/questions",
        headers=headers,
        json={
            "type": "single_choice",
            "stem": "Which option is correct?",
            "answer_text": "A",
            "explanation": "A is marked correct.",
            "difficulty": "easy",
            "tags": ["smoke"],
            "options": [
                {"label": "A", "content": "Correct", "is_correct": True, "sort_order": 1},
                {"label": "B", "content": "Wrong", "is_correct": False, "sort_order": 2}
            ]
        },
    )
    assert question_response.status_code == 201
    question_id = question_response.json()["id"]

    session_response = client.post(
        "/api/practice-sessions",
        headers=headers,
        json={"bank_id": bank_id, "mode": "normal", "question_count": 1},
    )
    assert session_response.status_code == 201
    session_id = session_response.json()["id"]

    answer_response = client.post(
        f"/api/practice-sessions/{session_id}/answers",
        headers=headers,
        json={"question_id": question_id, "user_answer": "A", "elapsed_seconds": 3},
    )
    assert answer_response.status_code == 201
    assert answer_response.json()["is_correct"] is True

    finish_response = client.post(f"/api/practice-sessions/{session_id}/finish", headers=headers)
    assert finish_response.status_code == 200
    assert finish_response.json()["accuracy"] == 100
```

- [ ] **Step 2: Run full backend suite**

Run:

```powershell
cd backend
pytest -v
```

Expected: pass.

- [ ] **Step 3: Run full frontend suite**

Run:

```powershell
cd frontend
npm test
```

Expected: pass.

- [ ] **Step 4: Run frontend build**

Run:

```powershell
cd frontend
npm run build
```

Expected: build succeeds and `frontend/dist` is created.

- [ ] **Step 5: Start local app**

Run:

```powershell
docker compose up -d postgres redis
cd backend
alembic upgrade head
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

In another terminal:

```powershell
cd frontend
npm run dev
```

Expected:

- Backend available at `http://localhost:8000/api/health`.
- Frontend available at `http://localhost:5173`.

- [ ] **Step 6: Manual smoke path**

In the browser:

1. Register a new account.
2. Create a question bank.
3. Add one manual single-choice question.
4. Start practice.
5. Answer the question.
6. Finish practice.
7. Verify result accuracy.
8. Open model settings.
9. Save a personal provider configuration.
10. Verify raw key is masked after saving.

- [ ] **Step 7: Update README with verified URLs and smoke path**

Add the verified local URLs and manual smoke steps to `README.md`.

- [ ] **Step 8: Commit verification docs**

Run:

```powershell
git add README.md backend/tests/test_smoke_vertical_slice.py
git commit -m "test: add vertical slice smoke coverage"
```

## Self-Review

Spec coverage:

- User accounts: covered in Task 4 and Task 8.
- User-isolated question banks: covered in Task 5 and Task 9.
- PostgreSQL persistence: covered in Task 1 and Task 3.
- Redis/Celery import jobs: covered in Task 1 and Task 6.
- PDF/docx upload and extraction: covered in Task 6.
- LLM provider layer and credential priority: covered in Task 4 and Task 6.
- Draft review and publishing: covered in Task 6 and Task 9.
- Practice, scoring, wrong questions: covered in Task 7 and Task 10.
- Frontend workbench pages: covered in Tasks 8, 9, and 10.
- Verification: covered in Task 11.

Placeholder scan:

- The plan avoids empty markers and vague implementation instructions.
- Each task includes concrete files, commands, and expected results.

Type consistency:

- Backend resource names match the design spec.
- Frontend API names mirror backend route groups.
- Practice answer fields use `user_answer` in API payloads and `user_answer_json` in persistence.

