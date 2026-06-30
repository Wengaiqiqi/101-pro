# Review Findings Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix every confirmed issue from the full repository review with regression coverage.

**Architecture:** Keep the existing FastAPI/SQLAlchemy and React structure. Add small validation and transport helpers at existing boundaries, shorten import transactions, and make practice/question data contracts explicit.

**Tech Stack:** Python 3.11, FastAPI, SQLAlchemy, Pytest, React 18, TypeScript, Vitest.

---

### Task 1: Backend security and correctness

**Files:** `backend/tests/test_security.py`, `backend/tests/test_question_banks.py`, `backend/tests/test_import_jobs.py`, `backend/app/main.py`, `backend/app/services/model_settings_service.py`, `backend/app/services/llm_client.py`, `backend/app/services/question_service.py`, `backend/app/services/import_service.py`

- [ ] Write tests proving production admin seeding rejects a missing password, private DNS targets are rejected, string booleans are not accepted, non-empty public banks fork successfully, and chunk progress is committed.
- [ ] Run the focused tests and confirm each fails for the expected current behavior.
- [ ] Implement the smallest boundary and transaction changes needed for those tests.
- [ ] Run focused tests until green.

### Task 2: Practice and frontend data flow

**Files:** `backend/app/api/routes/questions.py`, `backend/app/schemas/question.py`, `frontend/src/features/practice/PracticePage.tsx`, `frontend/src/hooks/useImports.ts`, `frontend/src/features/practice/WrongQuestionsPage.tsx`, `frontend/src/App.tsx`, `frontend/src/api/client.ts`, relevant tests under `frontend/src/__tests__`

- [ ] Write tests for multiple-choice confirmation, true/false controls, active-job polling, single wrong-question mutation, authenticated avatars, and paged question loading.
- [ ] Run the focused Vitest files and confirm expected failures.
- [ ] Implement explicit practice controls and reusable paged/authenticated fetch helpers.
- [ ] Run focused tests until green.

### Task 3: Regression suite cleanup and verification

**Files:** existing backend and frontend tests that currently fail due to stale fixtures or mocks.

- [ ] Update authentication assertions to current accessible names and mock the shared HTTP client at its real boundary.
- [ ] Make the optional PDF oracle test skip when its external fixture is absent.
- [ ] Run the complete backend and frontend suites.
- [ ] Run `npx tsc --noEmit --pretty false` and `npm run build`.
