# Multi-User Question Bank Platform Design

Date: 2026-06-26

## Goal

Transform the current single-file exam practice page into a production-oriented full-stack question bank platform. The platform will support user accounts, private question banks, PDF/docx imports, asynchronous AI-assisted question generation, draft review, practice sessions, wrong-question review, and configurable LLM credentials.

The first implementation should preserve the useful study flows from the existing `index.html`, but replace the single-file, embedded-data structure with a backend-driven multi-user architecture.

## Confirmed Direction

Use the production-oriented architecture option:

- Frontend: React, Vite, TypeScript.
- Backend API: FastAPI.
- Database: PostgreSQL as the primary database.
- Background jobs: Celery with Redis.
- File storage: local `storage/` for the first version, with an interface that can later move to object storage.
- LLM integration: OpenAI-compatible provider layer.
- LLM credentials: support both platform default keys from environment variables and per-user override keys.

## Existing Project Context

The repository currently contains:

- `index.html`: a large single-file web app with embedded styles, question data, quiz modes, wrong-question retry, fill-in practice, and memory-question flows.
- `README.md`: minimal project title text.

The existing file should be treated as a source of product behavior and seed data, not as the final application structure.

## Product Scope

### In Scope

- User registration and login.
- User-isolated question banks.
- Question bank CRUD.
- Question CRUD with support for single choice, multiple choice, true/false, fill-in, and short answer.
- PDF and docx upload.
- Asynchronous import jobs.
- Document text extraction and chunking.
- LLM-generated question drafts.
- Human review and editing before publishing generated questions.
- Practice sessions.
- Answer submission and scoring.
- Wrong-question tracking and retry.
- User-level LLM settings.
- Platform-level fallback LLM settings.

### Out Of Scope For First Implementation

- Payment, billing, or quota management.
- Organization/team collaboration.
- Public marketplace for shared question banks.
- Real-time collaborative editing.
- Full object-storage deployment.
- Advanced admin analytics.

## Architecture

### Frontend

The frontend is a React + Vite + TypeScript app with a workbench-style layout.

Main areas:

- Authentication pages.
- Dashboard.
- Question bank management.
- Question bank detail and editor.
- Document import flow.
- Import job detail and progress.
- Draft review and publishing.
- Practice setup and practice runner.
- Results and wrong-question review.
- User settings for model credentials.

The frontend should not call LLM providers directly. It only talks to the FastAPI backend.

### Backend API

FastAPI owns:

- Authentication and session/token handling.
- Authorization and user isolation.
- CRUD APIs.
- File upload.
- Import job creation and status.
- Draft publishing.
- Practice scoring.
- Wrong-question updates.
- LLM provider orchestration.

### Background Worker

Celery workers process long-running import work:

1. Parse uploaded file.
2. Extract text.
3. Split text into chunks.
4. Call LLM provider for structured question generation.
5. Validate and normalize generated output.
6. Save generated question drafts.
7. Update import job status and progress.

Redis is used as the broker and result backend.

### Database

PostgreSQL is the primary persistence layer. The implementation should keep database access behind repository/service boundaries so tests can target business logic without needing every test to hit the database.

### File Storage

The first version stores files under local `storage/`, with records in the database containing file metadata and paths. File handling should go through a storage service abstraction so MinIO, S3, OSS, or another object store can be added later.

## Data Model

### users

Stores account identity and role.

Fields:

- `id`
- `username`
- `email`
- `password_hash`
- `role`: `user` or `admin`
- `is_active`
- `created_at`
- `updated_at`

### user_model_settings

Stores optional per-user model settings.

Fields:

- `id`
- `user_id`
- `provider`
- `base_url`
- `model`
- `encrypted_api_key`
- `created_at`
- `updated_at`

Credential priority:

1. Use the user's active model settings if present and valid.
2. Otherwise use platform defaults from backend environment variables.
3. If neither exists, importing with LLM generation fails with a clear setup error.

### question_banks

Stores user-owned question banks.

Fields:

- `id`
- `owner_id`
- `name`
- `description`
- `visibility`: initially `private`; future values may include `shared` or `public`
- `created_at`
- `updated_at`

### questions

Stores published questions.

Fields:

- `id`
- `bank_id`
- `type`: `single_choice`, `multiple_choice`, `true_false`, `fill_blank`, `short_answer`
- `stem`
- `answer_text`
- `explanation`
- `difficulty`
- `tags`
- `source`
- `created_at`
- `updated_at`

### question_options

Stores selectable options for choice questions.

Fields:

- `id`
- `question_id`
- `label`
- `content`
- `is_correct`
- `sort_order`

### import_jobs

Tracks an uploaded document and generation workflow.

Fields:

- `id`
- `user_id`
- `bank_id`
- `original_filename`
- `stored_path`
- `mime_type`
- `status`: `pending`, `parsing`, `generating`, `reviewing`, `completed`, `failed`
- `progress`
- `error_message`
- `generation_config`
- `created_at`
- `updated_at`

### import_job_chunks

Stores parsed document chunks and generation state.

Fields:

- `id`
- `import_job_id`
- `chunk_index`
- `text`
- `status`
- `raw_model_output`
- `error_message`
- `created_at`
- `updated_at`

### imported_question_drafts

Stores LLM-generated questions before user approval.

Fields:

- `id`
- `import_job_id`
- `source_chunk_id`
- `type`
- `stem`
- `options_json`
- `answer_json`
- `explanation`
- `difficulty`
- `tags`
- `status`: `pending`, `approved`, `rejected`, `published`
- `created_at`
- `updated_at`

### practice_sessions

Stores a user's practice run.

Fields:

- `id`
- `user_id`
- `bank_id`
- `mode`
- `question_count`
- `started_at`
- `finished_at`
- `score`
- `accuracy`

### practice_answers

Stores answer records for each practice question.

Fields:

- `id`
- `session_id`
- `question_id`
- `user_answer_json`
- `is_correct`
- `elapsed_seconds`
- `created_at`

### wrong_questions

Tracks per-user wrong-question state.

Fields:

- `id`
- `user_id`
- `question_id`
- `wrong_count`
- `last_wrong_at`
- `mastery_status`: `unmastered`, `reviewing`, `mastered`
- `created_at`
- `updated_at`

## Backend API

### Authentication

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/auth/logout`

### Model Settings

- `GET /api/model-settings`
- `PUT /api/model-settings`
- `POST /api/model-settings/test`

### Question Banks

- `GET /api/question-banks`
- `POST /api/question-banks`
- `GET /api/question-banks/{id}`
- `PUT /api/question-banks/{id}`
- `DELETE /api/question-banks/{id}`

All question bank APIs must enforce owner-based access unless an admin capability is explicitly implemented.

### Questions

- `GET /api/question-banks/{id}/questions`
- `POST /api/question-banks/{id}/questions`
- `PUT /api/questions/{id}`
- `DELETE /api/questions/{id}`

### Import Jobs

- `POST /api/import-jobs`
- `GET /api/import-jobs`
- `GET /api/import-jobs/{id}`
- `POST /api/import-jobs/{id}/retry`
- `GET /api/import-jobs/{id}/drafts`
- `PUT /api/import-drafts/{id}`
- `POST /api/import-jobs/{id}/publish`

The first version can use frontend polling for job progress. The backend should not block the upload request while parsing or generating questions.

### Practice

- `POST /api/practice-sessions`
- `GET /api/practice-sessions/{id}`
- `POST /api/practice-sessions/{id}/answers`
- `POST /api/practice-sessions/{id}/finish`
- `GET /api/wrong-questions`
- `POST /api/wrong-questions/{id}/mastered`

## LLM Import Flow

1. User selects a target question bank and uploads a PDF or docx.
2. Backend stores the file and creates an `import_jobs` record.
3. Backend enqueues a Celery task.
4. Worker extracts text using file-type-specific extractors.
5. Worker chunks the text by length and semantic boundaries where practical.
6. Worker resolves model credentials:
   - user settings first,
   - platform settings second.
7. Worker calls an OpenAI-compatible chat completion API.
8. Worker requests strict JSON output for generated questions.
9. Worker validates the output schema.
10. Worker saves drafts into `imported_question_drafts`.
11. Job status becomes `reviewing`.
12. User edits, approves, rejects, or publishes drafts.
13. Publishing writes approved drafts to `questions` and `question_options`.

## Frontend User Flows

### Main Flow

Register or log in, create a question bank, upload a document, wait for the import task, review generated drafts, publish questions, start practice, review results, then revisit wrong questions.

### Import Flow

The document import page collects:

- target question bank,
- file,
- desired question types,
- approximate question count,
- difficulty,
- language,
- whether explanations should be generated.

After submission, the user is redirected to an import job detail page. The page polls the job status until it reaches `reviewing`, `completed`, or `failed`.

### Practice Flow

The practice setup page lets users choose:

- question bank,
- question types,
- number of questions,
- random or sequential order,
- normal practice or wrong-question practice.

The runner supports answer selection/input, submission, scoring, and result review.

### Settings Flow

Users can configure:

- provider,
- base URL,
- model,
- API key.

The API key is sent only to the backend. The frontend should display whether a personal key is configured, but must not display the raw saved key after saving.

## Security And Privacy

- Passwords must be hashed with a strong password hashing algorithm.
- Raw API keys must never be returned to the frontend after storage.
- User API keys should be encrypted before database storage.
- File access must be scoped to the owning user.
- All user-owned resources must enforce authorization checks.
- LLM requests should be made from the backend or worker only.
- Uploads should validate file type and size.

## Testing Strategy

Backend:

- Unit tests for scoring, answer normalization, credential resolution, and LLM response validation.
- API tests for authentication, question bank ownership, import job creation, and draft publishing.
- Worker-level tests for mocked document extraction and mocked LLM output.

Frontend:

- Component tests for key forms and review/edit components.
- Integration tests for login, question bank creation, import job polling, draft publishing, and practice submission.

End-to-end:

- A smoke path that registers a user, creates a bank, uploads a small fixture document, receives mocked generated drafts, publishes them, and completes a practice session.

## Migration From Current Single File

The existing `index.html` should be used as reference material for:

- existing question bank seed data,
- practice modes,
- wrong-question retry behavior,
- fill-in question behavior,
- memory-question behavior.

The migration should not keep the final app as a large single file. Data should move into backend seed scripts or import fixtures, and UI should move into React components.

## Open Implementation Notes

- Use PostgreSQL from the start for the selected production-oriented architecture.
- Use local storage abstraction for uploaded files in the first version.
- Use polling for import status first; SSE or WebSocket can be added later.
- Keep the first UI workbench practical and dense rather than marketing-oriented.
- Build the core vertical slice before adding admin dashboards or sharing features.

