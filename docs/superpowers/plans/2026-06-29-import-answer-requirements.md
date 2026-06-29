# Import Answer Requirements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate and enforce answers for imported single-choice, multiple-choice, true/false, and fill-blank questions while allowing every other imported type to publish with an empty answer.

**Architecture:** Extend the existing page-level vision contract to solve objective questions in the same request, normalize provider answer variants at the LLM boundary, and validate required answers before page results become drafts. Reuse the same answer policy during publishing and in the draft editor so backend and frontend behavior remain consistent.

**Tech Stack:** Python 3.11, FastAPI, SQLAlchemy, httpx, pytest, React, TypeScript, Vitest.

---

## File Map

- Modify `backend/app/services/llm_client.py`: prompt contract and canonical answer normalization.
- Modify `backend/app/services/pdf_question_extraction.py`: shared required-answer policy and completeness checks.
- Modify `backend/app/services/import_service.py`: allow optional-answer drafts to publish with `answer_text=""`.
- Modify `backend/tests/test_pdf_question_extraction.py`: prompt, normalization, validation, and repair regressions.
- Modify `backend/tests/test_import_jobs.py`: publishing regressions for required and optional answers.
- Modify `frontend/src/features/imports/DraftReviewPage.tsx`: optional answer field for non-objective drafts.
- Modify `frontend/src/__tests__/import-flow.test.tsx`: editor requirement regression.

Production files already contain user-owned uncommitted changes. Implementation checkpoints must inspect scoped diffs but must not commit entire overlapping files without separate user authorization.

### Task 1: Require objective answers in the vision contract

**Files:**
- Modify: `backend/tests/test_pdf_question_extraction.py`
- Modify: `backend/app/services/llm_client.py`

- [ ] **Step 1: Write the failing prompt test**

```python
from app.services.llm_client import _build_page_transcription_prompt


def test_page_prompt_requires_objective_answers_and_allows_other_types_empty() -> None:
    prompt = _build_page_transcription_prompt(
        "source",
        1,
        {"question_types": ["single_choice", "multiple_choice", "true_false", "fill_blank", "short_answer"]},
    )

    assert "单选题必须返回且仅返回一个有效选项标签" in prompt
    assert "多选题必须返回一个或多个有效选项标签" in prompt
    assert "判断题必须返回正确或错误对应的选项标签" in prompt
    assert "填空题必须返回非空文本答案" in prompt
    assert "其他题型允许 answer 为空" in prompt
```

- [ ] **Step 2: Run the prompt test and verify RED**

Run: `cd backend; python -m pytest -p no:cacheprovider tests/test_pdf_question_extraction.py::test_page_prompt_requires_objective_answers_and_allows_other_types_empty -v`

Expected: FAIL because the existing prompt describes the answer field but does not require objective answers.

- [ ] **Step 3: Add the explicit answer contract**

Add this text to `_build_page_transcription_prompt` after the type rules:

```python
        "你还必须解答客观题：单选题必须返回且仅返回一个有效选项标签；"
        "多选题必须返回一个或多个有效选项标签；"
        "判断题必须返回正确或错误对应的选项标签；"
        "填空题必须返回非空文本答案。"
        "其他题型允许 answer 为空。"
        "选择/判断题使用 {\"label\":\"A\"} 或 {\"label\":[\"A\",\"C\"]}；"
        "填空题使用 {\"text\":\"答案\"}。"
```

- [ ] **Step 4: Run the prompt test and verify GREEN**

Run: `cd backend; python -m pytest -p no:cacheprovider tests/test_pdf_question_extraction.py::test_page_prompt_requires_objective_answers_and_allows_other_types_empty -v`

Expected: PASS.

- [ ] **Step 5: Inspect the scoped diff**

Run: `git diff --check -- backend/app/services/llm_client.py backend/tests/test_pdf_question_extraction.py`

Expected: no scoped whitespace errors. Do not stage the overlapping production file.

### Task 2: Normalize and validate required answers with page repair

**Files:**
- Modify: `backend/tests/test_pdf_question_extraction.py`
- Modify: `backend/app/services/llm_client.py`
- Modify: `backend/app/services/pdf_question_extraction.py`

- [ ] **Step 1: Write failing normalization tests**

```python
def test_page_question_normalizes_choice_and_fill_answer_shapes() -> None:
    choice = _normalize_page_question({
        "type": "single_choice",
        "options": ["A. Alpha", "B. Beta"],
        "answer": {"text": "B"},
    })
    fill = _normalize_page_question({
        "type": "fill_blank",
        "options": [],
        "answer": {"answer_text": "42"},
    })

    assert choice["answer"] == {"label": "B"}
    assert choice["options"][1]["is_correct"] is True
    assert fill["answer"] == {"text": "42"}
```

- [ ] **Step 2: Run normalization test and verify RED**

Run: `cd backend; python -m pytest -p no:cacheprovider tests/test_pdf_question_extraction.py::test_page_question_normalizes_choice_and_fill_answer_shapes -v`

Expected: FAIL because answers are currently passed through unchanged.

- [ ] **Step 3: Implement canonical answer normalization**

```python
_OBJECTIVE_CHOICE_TYPES = {"single_choice", "multiple_choice", "true_false"}


def _answer_text_value(answer: object) -> str:
    if isinstance(answer, dict):
        value = answer.get("text") or answer.get("answer_text") or answer.get("answer")
    else:
        value = answer
    return str(value or "").strip()


def _normalize_page_answer(question_type: str, answer: object) -> dict[str, object]:
    if question_type in _OBJECTIVE_CHOICE_TYPES:
        labels = sorted(_page_answer_labels(answer))
        if not labels:
            return {"label": ""}
        return {"label": labels if question_type == "multiple_choice" else labels[0]}
    return {"text": _answer_text_value(answer)}
```

At the start of `_normalize_page_question`, assign:

```python
    question_type = str(question.get("type") or "")
    normalized["answer"] = _normalize_page_answer(question_type, question.get("answer"))
```

Use `normalized["answer"]` rather than the raw provider answer when marking correct options.

- [ ] **Step 4: Run normalization tests and verify GREEN**

Run: `cd backend; python -m pytest -p no:cacheprovider tests/test_pdf_question_extraction.py -k "normalizes_choice_and_fill or normalizes_string_options or true_false" -v`

Expected: all selected tests pass.

- [ ] **Step 5: Write failing required-answer validation tests**

```python
def test_validation_requires_objective_answers_but_allows_empty_short_answer() -> None:
    questions = [
        {**_choice(1), "answer": {"label": ""}, "logical_page_number": 1},
        {
            "section": "fill_blank", "source_number": 1, "type": "fill_blank",
            "stem": "填空 ____", "options": [], "answer": {"text": ""},
            "blank_count": 1, "logical_page_number": 2,
        },
        {
            "section": "short_answer", "source_number": 1, "type": "short_answer",
            "stem": "说明原因", "options": [], "answer": {"text": ""},
            "blank_count": 0, "logical_page_number": 3,
        },
    ]

    issues = validate_document_questions(
        questions,
        declared_counts={
            "single_choice": {"questions": 1},
            "fill_blank": {"blanks": 1},
            "short_answer": {"questions": 1},
        },
    )

    assert [(issue.logical_page_number, issue.code) for issue in issues] == [
        (1, "missing_answer"),
        (2, "missing_answer"),
    ]
```

Add a second test where a single-choice answer is `Z`; expect `invalid_answer_option` on its source page.

- [ ] **Step 6: Run validator tests and verify RED**

Run: `cd backend; python -m pytest -p no:cacheprovider tests/test_pdf_question_extraction.py -k "requires_objective_answers or invalid_answer_option" -v`

Expected: FAIL because answer completeness is not currently validated.

- [ ] **Step 7: Implement the shared answer policy and validation**

```python
ANSWER_REQUIRED_TYPES = {
    "single_choice",
    "multiple_choice",
    "true_false",
    "fill_blank",
}


def _answer_labels(answer: object) -> list[str]:
    if not isinstance(answer, dict):
        return []
    value = answer.get("label") or answer.get("labels") or answer.get("answer")
    if isinstance(value, list):
        return [str(item).strip().upper() for item in value if str(item).strip()]
    return [part.upper() for part in re.split(r"[,，\s]+", str(value or "").strip()) if part]


def _answer_text(answer: object) -> str:
    if not isinstance(answer, dict):
        return str(answer or "").strip()
    return str(
        answer.get("text")
        or answer.get("answer_text")
        or answer.get("answer")
        or ""
    ).strip()
```

Inside `validate_document_questions`, for each selected item:

```python
            question_type = str(item.get("type") or "")
            if question_type in ANSWER_REQUIRED_TYPES:
                if question_type == "fill_blank":
                    if not _answer_text(item.get("answer")):
                        issues.append(ValidationIssue(page, "missing_answer", "填空题答案不能为空"))
                else:
                    labels = _answer_labels(item.get("answer"))
                    option_labels = {
                        str(option.get("label") or "").upper()
                        for option in item.get("options", [])
                        if isinstance(option, dict)
                    }
                    if not labels:
                        issues.append(ValidationIssue(page, "missing_answer", "选择或判断题答案不能为空"))
                    elif any(label not in option_labels for label in labels):
                        issues.append(ValidationIssue(page, "invalid_answer_option", "答案引用了不存在的选项"))
                    elif question_type in {"single_choice", "true_false"} and len(labels) != 1:
                        issues.append(ValidationIssue(page, "invalid_answer_count", "该题型必须且只能有一个答案"))
```

- [ ] **Step 8: Verify validation and page repair**

Add a fake page generator that returns an empty answer on its first call and a valid answer when `repair_errors` is non-empty. Assert its page is called twice and the final answer is valid.

Run: `cd backend; python -m pytest -p no:cacheprovider tests/test_pdf_question_extraction.py -q`

Expected: all PDF answer and extraction tests pass.

- [ ] **Step 9: Inspect the scoped backend diff**

Run: `git diff --check -- backend/app/services/llm_client.py backend/app/services/pdf_question_extraction.py backend/tests/test_pdf_question_extraction.py`

Expected: no scoped whitespace errors.

### Task 3: Allow optional-answer drafts to publish and edit

**Files:**
- Modify: `backend/tests/test_import_jobs.py`
- Modify: `backend/app/services/import_service.py`
- Modify: `frontend/src/features/imports/DraftReviewPage.tsx`
- Modify: `frontend/src/__tests__/import-flow.test.tsx`

- [ ] **Step 1: Write failing backend publishing tests**

```python
def test_short_answer_without_answer_publishes_with_empty_answer_text() -> None:
    job = ImportJob(id=1, user_id=1, bank_id=7, original_filename="exam.pdf", stored_path="x", mime_type="application/pdf")
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

    question = _question_from_draft(job, draft)

    assert question.answer_text == ""


def test_fill_blank_without_answer_is_rejected_on_publish() -> None:
    job = ImportJob(id=1, user_id=1, bank_id=7, original_filename="exam.pdf", stored_path="x", mime_type="application/pdf")
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

    with pytest.raises(BadRequestError, match="答案不能为空"):
        _question_from_draft(job, draft)
```

- [ ] **Step 2: Run publishing tests and verify RED**

Run: `cd backend; python -m pytest -p no:cacheprovider tests/test_import_jobs.py -k "without_answer" -v`

Expected: short-answer test fails with `答案不能为空`; fill-blank test passes.

- [ ] **Step 3: Apply the shared policy during publishing**

Replace the unconditional answer check in `_question_from_draft` with:

```python
    if not answer_text and question_type in pdf_question_extraction.ANSWER_REQUIRED_TYPES:
        raise BadRequestError("答案不能为空")
```

Continue passing `answer_text` to `Question`; optional types store an empty string and require no schema migration.

- [ ] **Step 4: Run publishing tests and verify GREEN**

Run: `cd backend; python -m pytest -p no:cacheprovider tests/test_import_jobs.py -k "without_answer or publishes_question" -v`

Expected: both new tests and the existing publish flow pass.

- [ ] **Step 5: Write the failing frontend editor test**

In `frontend/src/__tests__/import-flow.test.tsx`, render an answerless `short_answer` draft, enter edit mode, and assert:

```typescript
const answer = screen.getByRole('textbox', { name: '答案（可选）' });
expect(answer).not.toBeRequired();
```

Also render a `fill_blank` draft and assert its `答案` textbox remains required.

- [ ] **Step 6: Run the frontend test and verify RED**

Run: `cd frontend; npm test -- --run src/__tests__/import-flow.test.tsx`

Expected: FAIL because all non-choice answer fields currently use label `答案` and `required`.

- [ ] **Step 7: Make the answer field conditional**

Add these helpers near the component:

```typescript
const ANSWER_REQUIRED_TYPES = new Set(['single_choice', 'multiple_choice', 'true_false', 'fill_blank']);

function requiresAnswer(questionType: string): boolean {
  return ANSWER_REQUIRED_TYPES.has(questionType);
}
```

In the non-choice editor branch:

```tsx
const editingDraft = drafts.find((item) => item.id === editingId);
const answerRequired = editingDraft ? requiresAnswer(editingDraft.question_type) : true;

<Field
  label={answerRequired ? '答案' : '答案（可选）'}
  value={answerText}
  onChange={(event) => setAnswerText(event.target.value)}
  required={answerRequired}
/>
```

Keep choice and true/false correct-option controls unchanged.

- [ ] **Step 8: Run frontend tests and build**

Run: `cd frontend; npm test -- --run src/__tests__/import-flow.test.tsx`

Expected: targeted test passes.

Run: `cd frontend; npm run build`

Expected: exit code 0.

- [ ] **Step 9: Inspect the scoped publishing/UI diff**

Run: `git diff --check -- backend/app/services/import_service.py backend/tests/test_import_jobs.py frontend/src/features/imports/DraftReviewPage.tsx frontend/src/__tests__/import-flow.test.tsx`

Expected: no new scoped whitespace errors.

### Task 4: Final regression verification

**Files:**
- No production changes unless a new failing test demonstrates a defect.

- [ ] **Step 1: Run the complete answer/PDF/import regression group**

Run: `cd backend; python -m pytest -p no:cacheprovider tests/test_pdf_question_extraction.py tests/test_pdf_logical_pages.py tests/test_llm_prompt.py tests/test_import_jobs.py -k "not retry_rejects_processing_job" -q`

Expected: zero failures; the pre-existing translated retry-message assertion remains deselected.

- [ ] **Step 2: Run the complete backend suite with writable temp paths**

Run: `cd backend; python -m pytest -p no:cacheprovider -q`

Expected baseline: the same five unrelated failures already recorded in authentication, translated retry-message, and practice return-shape tests; no answer-generation or PDF failures.

- [ ] **Step 3: Run scoped syntax and diff checks**

Run:

```powershell
$env:PYTHONPYCACHEPREFIX='..\.run\pycache-answer-final'
python -m py_compile app\services\llm_client.py app\services\pdf_question_extraction.py app\services\import_service.py
git -C .. diff --check -- backend/app/services/llm_client.py backend/app/services/pdf_question_extraction.py backend/app/services/import_service.py backend/tests/test_pdf_question_extraction.py backend/tests/test_import_jobs.py frontend/src/features/imports/DraftReviewPage.tsx frontend/src/__tests__/import-flow.test.tsx
```

Expected: syntax compilation succeeds and the scoped diff has no new whitespace errors.

- [ ] **Step 4: Record final evidence**

Report required-answer prompt coverage, normalization shapes, page repair behavior, optional short-answer publishing, frontend editor behavior, targeted test totals, build status, and unchanged unrelated baseline failures.
