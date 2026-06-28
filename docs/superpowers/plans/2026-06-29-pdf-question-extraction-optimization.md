# PDF Question Extraction Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract all original question stems, options, and image-based formulas from imposed PDFs in source order while reducing model wait time through page-level concurrency and isolated retries.

**Architecture:** Convert each PDF into ordered logical-page records containing cropped text and PNG bytes. Send formula-bearing logical pages to a vision-capable OpenAI-compatible model with a transcription-first contract, validate the complete document deterministically, retry only pages implicated by validation failures, then persist results through the existing import-job models.

**Tech Stack:** Python 3.11, pdfplumber/pypdfium2/Pillow, httpx, concurrent.futures, FastAPI, SQLAlchemy, pytest.

---

## File Map

- Modify `backend/app/services/document_extractors.py`: logical-page detection, crop extraction, and in-memory PNG rendering; retain existing non-PDF extractors.
- Modify `backend/app/services/llm_client.py`: multimodal request building, Xiaomi vision-model routing, shared-client support, and strict transcription prompt.
- Create `backend/app/services/pdf_question_extraction.py`: section/count parsing, completeness validation, bounded page concurrency, and page-specific repair retries.
- Modify `backend/app/services/import_service.py`: choose the PDF page pipeline, persist one chunk per logical page, and leave non-PDF processing unchanged.
- Create `backend/tests/test_pdf_logical_pages.py`: fixture-backed logical-page and rendering regression tests.
- Create `backend/tests/test_pdf_question_extraction.py`: multimodal payload, routing, validation, retry, and concurrency tests.
- Modify `backend/tests/test_import_jobs.py`: import-service integration tests for PDF page results and non-PDF compatibility.
- Modify `backend/tests/test_llm_prompt.py`: update stale prompt assertions and retain text-import prompt coverage.

### Task 1: Extract ordered logical pages from imposed PDFs

**Files:**
- Modify: `backend/app/services/document_extractors.py`
- Create: `backend/tests/test_pdf_logical_pages.py`

- [ ] **Step 1: Write failing tests for split detection and fixture ordering**

```python
from pathlib import Path

from app.services.document_extractors import (
    _should_split_pdf_page,
    extract_pdf_pages,
)

PDF_PATH = Path(__file__).resolve().parents[2] / "期中考试试题.pdf"


def test_split_requires_wide_page_and_two_page_markers() -> None:
    assert _should_split_pdf_page(
        width=1190,
        height=842,
        left_text="第 1 页，共 4 页",
        right_text="第 2 页，共 4 页",
    )
    assert not _should_split_pdf_page(
        width=1190,
        height=842,
        left_text="课程期中试卷",
        right_text="",
    )
    assert not _should_split_pdf_page(
        width=595,
        height=842,
        left_text="第 1 页，共 1 页",
        right_text="",
    )


def test_exam_pdf_becomes_four_ordered_logical_pages() -> None:
    pages = extract_pdf_pages(str(PDF_PATH), resolution=120)

    assert len(pages) == 4
    assert [page.logical_page_number for page in pages] == [1, 2, 3, 4]
    assert "单项选择题" in pages[0].text
    assert "10. 线性系统渐近稳定" in pages[1].text
    assert "三、判断题" in pages[2].text
    assert "第 4 页，共 4 页" in pages[3].text
    assert "单项选择题" not in pages[3].text
    assert all(page.image_png.startswith(b"\x89PNG\r\n\x1a\n") for page in pages)
```

- [ ] **Step 2: Run the tests and verify RED**

Run: `cd backend; pytest tests/test_pdf_logical_pages.py -v`

Expected: collection fails because `_should_split_pdf_page` and `extract_pdf_pages` do not exist.

- [ ] **Step 3: Implement logical-page records, split evidence, crops, and rendering**

Add this public record and entry point while preserving `extract_pdf_text()` for callers outside the new pipeline:

```python
from dataclasses import dataclass
from io import BytesIO


@dataclass(frozen=True)
class PDFLogicalPage:
    logical_page_number: int
    physical_page_number: int
    crop_box: tuple[float, float, float, float]
    text: str
    image_png: bytes
    embedded_image_count: int


_PAGE_MARKER = re.compile(r"第\s*(\d+)\s*页\s*[，,]\s*共\s*(\d+)\s*页")


def _should_split_pdf_page(*, width: float, height: float, left_text: str, right_text: str) -> bool:
    if width / max(height, 1) < 1.30:
        return False
    left = _PAGE_MARKER.search(left_text)
    right = _PAGE_MARKER.search(right_text)
    return bool(left and right and left.group(1) != right.group(1))


def _render_pdf_crop(page, crop_box: tuple[float, float, float, float], resolution: int) -> bytes:
    cropped = page.crop(crop_box)
    image = cropped.to_image(resolution=resolution, antialias=True).original
    output = BytesIO()
    image.save(output, format="PNG", optimize=True)
    return output.getvalue()


def extract_pdf_pages(path: str, *, resolution: int = 144) -> list[PDFLogicalPage]:
    import pdfplumber

    logical_pages: list[PDFLogicalPage] = []
    with pdfplumber.open(path) as pdf:
        for physical_index, page in enumerate(pdf.pages, start=1):
            midpoint = page.width / 2
            left_box = (0.0, 0.0, midpoint, page.height)
            right_box = (midpoint, 0.0, page.width, page.height)
            left_text = _clean_extracted_text(page.crop(left_box).extract_text() or "")
            right_text = _clean_extracted_text(page.crop(right_box).extract_text() or "")
            boxes = (left_box, right_box) if _should_split_pdf_page(
                width=page.width,
                height=page.height,
                left_text=left_text,
                right_text=right_text,
            ) else ((0.0, 0.0, page.width, page.height),)
            for box in boxes:
                crop = page.crop(box)
                text = _clean_extracted_text(crop.extract_text() or "")
                marker = _PAGE_MARKER.search(text)
                logical_number = int(marker.group(1)) if marker else len(logical_pages) + 1
                image_count = sum(
                    1 for image in page.images
                    if box[0] <= float(image.get("x0", -1)) < box[2]
                )
                logical_pages.append(PDFLogicalPage(
                    logical_page_number=logical_number,
                    physical_page_number=physical_index,
                    crop_box=box,
                    text=text,
                    image_png=_render_pdf_crop(page, box, resolution),
                    embedded_image_count=image_count,
                ))
    return sorted(logical_pages, key=lambda item: item.logical_page_number)
```

Remove the unconditional `page.extract_tables()` pass from `_try_pdfplumber`; it duplicates visible text and is not needed by this exam pipeline.

- [ ] **Step 4: Run focused extraction tests and verify GREEN**

Run: `cd backend; pytest tests/test_pdf_logical_pages.py tests/test_llm_prompt.py::TestPDFTextExtraction -v`

Expected: all selected tests pass; the fixture produces four PNG-backed logical pages.

- [ ] **Step 5: Commit the extraction unit**

```powershell
git add backend/app/services/document_extractors.py backend/tests/test_pdf_logical_pages.py
git commit -m "feat: extract ordered logical PDF pages"
```

### Task 2: Add a transcription-first multimodal model request

**Files:**
- Modify: `backend/app/services/llm_client.py`
- Create: `backend/tests/test_pdf_question_extraction.py`

- [ ] **Step 1: Write failing payload, prompt, and model-routing tests**

```python
import base64
import json

import httpx

from app.services.llm_client import LLMConfig, generate_page_question_drafts


def test_page_request_sends_image_text_and_uses_xiaomi_full_modal_model() -> None:
    captured: dict[str, object] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured.update(json.loads(request.content))
        return httpx.Response(200, json={
            "choices": [{"message": {"content": json.dumps({
                "questions": [{
                    "section": "single_choice",
                    "source_number": 1,
                    "type": "single_choice",
                    "stem": "题干 $G(s)$",
                    "options": [
                        {"label": label, "content": label, "is_correct": label == "A", "sort_order": index}
                        for index, label in enumerate("ABCD", start=1)
                    ],
                    "answer": {"label": "A"},
                    "blank_count": 0,
                    "explanation": "",
                    "difficulty": "medium",
                    "tags": [],
                }]
            }, ensure_ascii=False)}}]
        })

    config = LLMConfig(
        provider="openai-compatible",
        base_url="https://token-plan-cn.xiaomimimo.com/v1",
        model="mimo-v2.5-pro",
        api_key="secret",
    )
    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        questions = generate_page_question_drafts(
            config,
            page_text="第 1 页",
            image_png=b"\x89PNG\r\n\x1a\ncontent",
            logical_page_number=1,
            generation_config={"question_types": ["single_choice"]},
            client=client,
        )

    assert captured["model"] == "mimo-v2.5"
    content = captured["messages"][0]["content"]
    assert [part["type"] for part in content] == ["text", "image_url"]
    assert content[1]["image_url"]["url"].startswith("data:image/png;base64,")
    assert base64.b64decode(content[1]["image_url"]["url"].split(",", 1)[1]).startswith(b"\x89PNG")
    assert questions[0]["source_number"] == 1
```

- [ ] **Step 2: Run the multimodal test and verify RED**

Run: `cd backend; pytest tests/test_pdf_question_extraction.py::test_page_request_sends_image_text_and_uses_xiaomi_full_modal_model -v`

Expected: FAIL because `generate_page_question_drafts` does not exist.

- [ ] **Step 3: Implement vision routing and strict page transcription**

```python
import base64
from collections.abc import Sequence


def _vision_model(config: LLMConfig) -> str:
    host = config.base_url.lower()
    if "xiaomimimo.com" in host and config.model == "mimo-v2.5-pro":
        return "mimo-v2.5"
    return config.model


def _build_page_transcription_prompt(
    page_text: str,
    logical_page_number: int,
    generation_config: dict[str, object],
    repair_errors: Sequence[str] = (),
) -> str:
    allowed = generation_config.get("question_types") or [
        "single_choice", "multiple_choice", "true_false", "fill_blank", "short_answer"
    ]
    repair = "\n".join(f"- {error}" for error in repair_errors)
    return (
        "你是考试原题转录器，不是出题器。只转录图片中真实可见的题目，禁止新增、改写或省略。\n"
        f"逻辑页：{logical_page_number}\n允许题型：{', '.join(map(str, allowed))}\n"
        "保留原题号、A-D选项、空格数量和全部公式；公式转为LaTeX。"
        "每题返回section、source_number、type、stem、options、answer、blank_count、"
        "explanation、difficulty、tags。严格返回{\"questions\": [...]}。\n"
        f"修复要求：\n{repair or '- 首次转录'}\n本地辅助文本：\n{page_text}"
    )


def generate_page_question_drafts(
    config: LLMConfig,
    *,
    page_text: str,
    image_png: bytes,
    logical_page_number: int,
    generation_config: dict[str, object],
    client=None,
    repair_errors: Sequence[str] = (),
) -> list[dict[str, object]]:
    import httpx

    owns_client = client is None
    http = client or httpx.Client(timeout=httpx.Timeout(180.0, connect=15.0))
    try:
        encoded = base64.b64encode(image_png).decode("ascii")
        response = http.post(
            f"{config.base_url.rstrip('/')}/chat/completions",
            headers={"Authorization": f"Bearer {config.api_key}"},
            json={
                "model": _vision_model(config),
                "messages": [{"role": "user", "content": [
                    {"type": "text", "text": _build_page_transcription_prompt(
                        page_text, logical_page_number, generation_config, repair_errors
                    )},
                    {"type": "image_url", "image_url": {
                        "url": f"data:image/png;base64,{encoded}", "detail": "high"
                    }},
                ]}],
                "temperature": 0,
            },
        )
        response.raise_for_status()
        parsed = _safe_json_loads(_strip_code_fences(response.json()["choices"][0]["message"]["content"]))
        questions = parsed if isinstance(parsed, list) else parsed.get("questions", [])
        if not isinstance(questions, list):
            raise RuntimeError(f"第 {logical_page_number} 页返回结果缺少 questions 数组")
        return [question for question in questions if isinstance(question, dict)]
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 400:
            raise RuntimeError("当前模型不支持图片输入，请配置视觉模型") from exc
        raise
    finally:
        if owns_client:
            http.close()
```

- [ ] **Step 4: Run request tests and verify GREEN**

Run: `cd backend; pytest tests/test_pdf_question_extraction.py::test_page_request_sends_image_text_and_uses_xiaomi_full_modal_model -v`

Expected: PASS and no real network request is made.

- [ ] **Step 5: Commit the multimodal request unit**

```powershell
git add backend/app/services/llm_client.py backend/tests/test_pdf_question_extraction.py
git commit -m "feat: transcribe PDF pages with vision input"
```

### Task 3: Validate section counts, numbering, options, blanks, and formulas

**Files:**
- Create: `backend/app/services/pdf_question_extraction.py`
- Modify: `backend/tests/test_pdf_question_extraction.py`

- [ ] **Step 1: Write failing validation tests**

```python
from app.services.pdf_question_extraction import validate_document_questions


def _choice(number: int, *, labels: str = "ABCD") -> dict[str, object]:
    return {
        "section": "single_choice",
        "source_number": number,
        "type": "single_choice",
        "stem": f"第 {number} 题 $G(s)$",
        "options": [
            {"label": label, "content": label, "is_correct": label == "A", "sort_order": index}
            for index, label in enumerate(labels, start=1)
        ],
        "answer": {"label": "A"},
        "blank_count": 0,
    }


def test_validation_reports_missing_number_and_option_on_source_page() -> None:
    questions = [
        {**_choice(number), "logical_page_number": 1 if number <= 9 else 2}
        for number in range(1, 17) if number != 14
    ]
    questions[0]["options"] = questions[0]["options"][:3]

    issues = validate_document_questions(
        questions,
        declared_counts={"single_choice": {"questions": 16}},
    )

    assert [(issue.logical_page_number, issue.code) for issue in issues] == [
        (1, "missing_options"),
        (2, "missing_number"),
    ]


def test_validation_distinguishes_eleven_fill_questions_from_twelve_blanks() -> None:
    questions = [
        {
            "section": "fill_blank",
            "source_number": number,
            "type": "fill_blank",
            "stem": f"填空 {number} ______",
            "options": [],
            "answer": {"text": "答案"},
            "blank_count": 2 if number == 3 else 1,
            "logical_page_number": 3,
        }
        for number in range(1, 12)
    ]

    assert validate_document_questions(
        questions,
        declared_counts={"fill_blank": {"blanks": 12}},
    ) == []
```

- [ ] **Step 2: Run validation tests and verify RED**

Run: `cd backend; pytest tests/test_pdf_question_extraction.py -k "validation" -v`

Expected: FAIL because `pdf_question_extraction` does not exist.

- [ ] **Step 3: Implement declared-count parsing and deterministic validation**

```python
from dataclasses import dataclass
import re
from typing import Any


@dataclass(frozen=True)
class ValidationIssue:
    logical_page_number: int
    code: str
    message: str


_SECTION_PATTERNS = {
    "single_choice": (re.compile(r"单项选择题.*?共\s*(\d+)\s*小题"), "questions"),
    "fill_blank": (re.compile(r"填空题.*?共\s*(\d+)\s*空"), "blanks"),
    "true_false": (re.compile(r"判断题.*?共\s*(\d+)\s*小题"), "questions"),
    "short_answer": (re.compile(r"计算题.*?共\s*(\d+)\s*小题"), "questions"),
}


def parse_declared_counts(page_texts: list[str]) -> dict[str, dict[str, int]]:
    text = "\n".join(page_texts)
    result: dict[str, dict[str, int]] = {}
    for section, (pattern, unit) in _SECTION_PATTERNS.items():
        match = pattern.search(text)
        if match:
            result[section] = {unit: int(match.group(1))}
    return result


def _page_for_missing(number: int, section_questions: list[dict[str, Any]]) -> int:
    ordered = sorted(section_questions, key=lambda item: int(item.get("source_number", 0)))
    after = next((item for item in ordered if int(item.get("source_number", 0)) > number), None)
    before = next((item for item in reversed(ordered) if int(item.get("source_number", 0)) < number), None)
    source = after or before
    return int(source.get("logical_page_number", 1)) if source else 1


def validate_document_questions(
    questions: list[dict[str, Any]],
    *,
    declared_counts: dict[str, dict[str, int]],
) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    for section, declaration in declared_counts.items():
        selected = [question for question in questions if question.get("section") == section]
        seen: dict[int, int] = {}
        for item in selected:
            number = int(item.get("source_number", 0))
            page = int(item.get("logical_page_number", 1))
            if number in seen:
                issues.append(ValidationIssue(page, "duplicate_number", f"{section} 第 {number} 题重复"))
            seen[number] = page
        expected_questions = declaration.get("questions")
        if expected_questions:
            present = {int(item.get("source_number", 0)) for item in selected}
            for number in range(1, expected_questions + 1):
                if number not in present:
                    issues.append(ValidationIssue(
                        _page_for_missing(number, selected), "missing_number",
                        f"{section} 缺少第 {number} 题",
                    ))
        if declaration.get("blanks") is not None:
            actual_blanks = sum(max(0, int(item.get("blank_count", 0))) for item in selected)
            if actual_blanks != declaration["blanks"]:
                page = int(selected[-1].get("logical_page_number", 1)) if selected else 1
                issues.append(ValidationIssue(
                    page, "blank_count",
                    f"{section} 应有 {declaration['blanks']} 空，实际 {actual_blanks} 空",
                ))
        for item in selected:
            page = int(item.get("logical_page_number", 1))
            if not str(item.get("stem") or "").strip() or "待补充" in str(item.get("stem") or ""):
                issues.append(ValidationIssue(page, "incomplete_stem", "题干为空或包含占位内容"))
            if item.get("type") == "single_choice":
                options = [option for option in item.get("options", []) if isinstance(option, dict)]
                labels = {str(option.get("label")) for option in options}
                if labels != set("ABCD"):
                    issues.append(ValidationIssue(page, "missing_options", "单选题必须完整包含 A-D"))
                elif any(not str(option.get("content") or "").strip() or "待补充" in str(option.get("content")) for option in options):
                    issues.append(ValidationIssue(page, "incomplete_options", "单选题选项包含空白或占位内容"))
    return sorted(issues, key=lambda issue: (issue.logical_page_number, issue.code, issue.message))
```

- [ ] **Step 4: Run validation tests and verify GREEN**

Run: `cd backend; pytest tests/test_pdf_question_extraction.py -k "validation" -v`

Expected: all validation tests pass, including 11 fill questions with 12 blanks.

- [ ] **Step 5: Commit the validation unit**

```powershell
git add backend/app/services/pdf_question_extraction.py backend/tests/test_pdf_question_extraction.py
git commit -m "feat: validate PDF question completeness"
```

### Task 4: Process pages concurrently and retry only implicated pages

**Files:**
- Modify: `backend/app/services/pdf_question_extraction.py`
- Modify: `backend/tests/test_pdf_question_extraction.py`

- [ ] **Step 1: Write failing concurrency and isolated-retry tests**

```python
from threading import Lock
import time

from app.services.document_extractors import PDFLogicalPage
from app.services.pdf_question_extraction import extract_pdf_questions


def test_page_calls_overlap_but_results_keep_page_order() -> None:
    lock = Lock()
    active = 0
    maximum_active = 0

    def generator(config, *, logical_page_number, **kwargs):
        nonlocal active, maximum_active
        with lock:
            active += 1
            maximum_active = max(maximum_active, active)
        time.sleep(0.05)
        with lock:
            active -= 1
        return [{
            "section": "single_choice",
            "source_number": logical_page_number,
            "type": "single_choice",
            "stem": f"page {logical_page_number}",
            "options": [],
            "answer": {},
            "blank_count": 0,
        }]

    pages = [PDFLogicalPage(i, i, (0, 0, 1, 1), "", b"png", 0) for i in range(1, 5)]
    questions = extract_pdf_questions(
        object(), pages, {}, page_generator=generator, max_workers=2, validate=False
    )

    assert maximum_active == 2
    assert [item["logical_page_number"] for item in questions] == [1, 2, 3, 4]


def test_only_page_with_validation_failure_is_retried() -> None:
    calls: list[tuple[int, tuple[str, ...]]] = []

    def generator(config, *, logical_page_number, repair_errors=(), **kwargs):
        calls.append((logical_page_number, tuple(repair_errors)))
        labels = "ABC" if logical_page_number == 1 and not repair_errors else "ABCD"
        return [_choice(1, labels=labels)] if logical_page_number == 1 else []

    pages = [PDFLogicalPage(1, 1, (0, 0, 1, 1), "单项选择题（共1小题）", b"png", 0)]
    extract_pdf_questions(object(), pages, {}, page_generator=generator, max_workers=2)

    assert [page for page, _ in calls] == [1, 1]
    assert "A-D" in calls[1][1][0]
```

- [ ] **Step 2: Run orchestration tests and verify RED**

Run: `cd backend; pytest tests/test_pdf_question_extraction.py -k "overlap or retried" -v`

Expected: FAIL because `extract_pdf_questions` does not exist.

- [ ] **Step 3: Implement bounded concurrency, stable merge order, and one repair pass**

```python
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from collections.abc import Callable
import logging
import time

from app.services import llm_client

logger = logging.getLogger(__name__)


def extract_pdf_questions(
    config,
    pages,
    generation_config,
    *,
    page_generator: Callable = llm_client.generate_page_question_drafts,
    max_workers: int = 2,
    validate: bool = True,
) -> list[dict[str, Any]]:
    import httpx

    total_started = time.perf_counter()
    results: dict[int, list[dict[str, Any]]] = {}
    with httpx.Client(timeout=httpx.Timeout(180.0, connect=15.0)) as client:
        def call_page(page, repair_errors=()):
            started = time.perf_counter()
            try:
                return page_generator(
                    config,
                    page_text=page.text,
                    image_png=page.image_png,
                    logical_page_number=page.logical_page_number,
                    generation_config=generation_config,
                    client=client,
                    repair_errors=repair_errors,
                )
            finally:
                logger.info(
                    "PDF logical page %s model_seconds=%.3f repair=%s",
                    page.logical_page_number,
                    time.perf_counter() - started,
                    bool(repair_errors),
                )

        with ThreadPoolExecutor(max_workers=min(max_workers, max(1, len(pages)))) as pool:
            futures = {
                pool.submit(call_page, page): page
                for page in pages
                if page.text.strip() or page.embedded_image_count
            }
            for future in as_completed(futures):
                page = futures[future]
                results[page.logical_page_number] = future.result()

        def merged() -> list[dict[str, Any]]:
            return [
                {**question, "logical_page_number": page_number}
                for page_number in sorted(results)
                for question in results[page_number]
            ]

        if validate:
            counts = parse_declared_counts([page.text for page in pages])
            allowed = set(generation_config.get("question_types") or counts)
            counts = {section: value for section, value in counts.items() if section in allowed}
            issues = validate_document_questions(merged(), declared_counts=counts)
            by_page: dict[int, list[str]] = defaultdict(list)
            for issue in issues:
                by_page[issue.logical_page_number].append(issue.message)
            page_lookup = {page.logical_page_number: page for page in pages}
            for page_number, messages in by_page.items():
                page = page_lookup[page_number]
                results[page_number] = call_page(page, messages)
            remaining = validate_document_questions(merged(), declared_counts=counts)
            if remaining:
                details = "; ".join(issue.message for issue in remaining)
                raise RuntimeError(f"PDF 原题转录仍不完整：{details}")
        output = merged()
        requested_count = int(generation_config.get("question_count") or 0)
        selected = output[:requested_count] if requested_count > 0 else output
        logger.info(
            "PDF extraction logical_pages=%s questions=%s total_seconds=%.3f",
            len(pages),
            len(selected),
            time.perf_counter() - total_started,
        )
        return selected
```

- [ ] **Step 4: Run orchestration tests and verify GREEN**

Run: `cd backend; pytest tests/test_pdf_question_extraction.py -k "overlap or retried or validation" -v`

Expected: PASS; maximum concurrency is two, result order is 1-4, and only page 1 is retried.

- [ ] **Step 5: Commit the orchestration unit**

```powershell
git add backend/app/services/pdf_question_extraction.py backend/tests/test_pdf_question_extraction.py
git commit -m "feat: process PDF pages concurrently"
```

### Task 5: Integrate the PDF pipeline into import jobs without changing other formats

**Files:**
- Modify: `backend/app/services/import_service.py`
- Modify: `backend/tests/test_import_jobs.py`

- [ ] **Step 1: Write failing import-service tests for PDF pages and text compatibility**

```python
def test_pdf_import_persists_one_chunk_per_logical_page(client, monkeypatch) -> None:
    from app.services import document_extractors, import_service, pdf_question_extraction, storage
    from app.models.import_job import ImportJobChunk, ImportedQuestionDraft
    from sqlalchemy import select

    pages = [
        document_extractors.PDFLogicalPage(i, (i + 1) // 2, (0, 0, 1, 1), f"page {i}", b"png", 1)
        for i in range(1, 5)
    ]
    monkeypatch.setattr(import_service, "resolve_model_config", lambda db, user: _FakeModelConfig())
    monkeypatch.setattr(
        storage,
        "save_upload",
        lambda user_id, upload: (
            upload.filename,
            str(Path(__file__).with_name("fixtures").joinpath("import_fixture.txt")),
        ),
    )
    monkeypatch.setattr(document_extractors, "extract_pdf_pages", lambda path: pages)
    monkeypatch.setattr(
        pdf_question_extraction,
        "extract_pdf_questions",
        lambda config, actual_pages, generation_config: [
            {
                "logical_page_number": page.logical_page_number,
                "section": "short_answer",
                "source_number": page.logical_page_number,
                "type": "short_answer",
                "stem": f"page {page.logical_page_number}",
                "options": [],
                "answer": {"text": "answer"},
                "explanation": "",
                "difficulty": "medium",
                "tags": [],
            }
            for page in actual_pages
        ],
    )

    token = register_and_login(client, "pdf_user", "pdf_user@example.com")
    bank_id = _create_bank(client, token, name="PDF Bank")
    response = client.post(
        "/api/import-jobs",
        headers=_headers(token),
        data={"bank_id": str(bank_id), "question_types": "short_answer"},
        files={"file": ("exam.pdf", b"pdf", "application/pdf")},
    )
    job_id = int(response.json()["id"])
    _process_job(client, job_id)

    db = client.app.state.testing_session_local()
    try:
        chunks = list(db.scalars(
            select(ImportJobChunk)
            .where(ImportJobChunk.import_job_id == job_id)
            .order_by(ImportJobChunk.chunk_index)
        ))
        drafts = list(db.scalars(
            select(ImportedQuestionDraft)
            .where(ImportedQuestionDraft.import_job_id == job_id)
            .order_by(ImportedQuestionDraft.id)
        ))
    finally:
        db.close()

    assert [chunk.text for chunk in chunks] == ["page 1", "page 2", "page 3", "page 4"]
    assert [draft.source_chunk_id for draft in drafts] == [chunk.id for chunk in chunks]


def test_text_import_still_uses_generate_question_drafts(client, monkeypatch) -> None:
    from app.services import import_service, llm_client, storage

    calls: list[str] = []
    monkeypatch.setattr(import_service, "resolve_model_config", lambda db, user: _FakeModelConfig())
    monkeypatch.setattr(
        storage,
        "save_upload",
        lambda user_id, upload: (
            upload.filename,
            str(Path(__file__).with_name("fixtures").joinpath("import_fixture.txt")),
        ),
    )
    monkeypatch.setattr(
        llm_client,
        "generate_question_drafts",
        lambda config, text, generation_config: calls.append(text) or [{
            "type": "single_choice",
            "stem": "Which option is correct?",
            "options": [
                {"label": "A", "content": "Alpha", "is_correct": True, "sort_order": 1},
                {"label": "B", "content": "Beta", "is_correct": False, "sort_order": 2},
            ],
            "answer": {"label": "A"},
            "explanation": "",
            "difficulty": "easy",
            "tags": [],
        }],
    )

    token = register_and_login(client, "text_user", "text_user@example.com")
    bank_id = _create_bank(client, token, name="Text Bank")
    response = client.post(
        "/api/import-jobs",
        headers=_headers(token),
        data={"bank_id": str(bank_id), "question_types": "single_choice"},
        files={"file": ("fixture.txt", b"fixture", "text/plain")},
    )
    _process_job(client, int(response.json()["id"]))

    assert calls == ["Alpha and Beta. Beta is the answer."]
```

- [ ] **Step 2: Run the new integration tests and verify RED**

Run: `cd backend; pytest tests/test_import_jobs.py -k "pdf_import_persists or text_import_still" -v`

Expected: PDF test fails because `process_import_job` still calls `extract_text` and character chunks.

- [ ] **Step 3: Add the PDF branch while retaining the current non-PDF branch**

In `process_import_job`, select PDF by extension or MIME type, create page chunks first, call `extract_pdf_questions`, and map each result to its page chunk:

```python
from pathlib import Path
from app.services import pdf_question_extraction


def _is_pdf_job(job: ImportJob) -> bool:
    return Path(job.original_filename).suffix.lower() == ".pdf" or job.mime_type.lower() == "application/pdf"


if _is_pdf_job(job):
    pages = document_extractors.extract_pdf_pages(job.stored_path)
    if not pages:
        raise RuntimeError("无法从 PDF 中识别页面")
    saved_chunks = []
    for page in pages:
        chunk = ImportJobChunk(
            import_job_id=job.id,
            chunk_index=page.logical_page_number - 1,
            text=page.text,
            status="processing",
        )
        db.add(chunk)
        saved_chunks.append(chunk)
    db.flush()
    page_to_chunk = {page.logical_page_number: chunk for page, chunk in zip(pages, saved_chunks)}
    generated = pdf_question_extraction.extract_pdf_questions(llm_config, pages, job.generation_config)
    for item in generated:
        page_number = int(item.pop("logical_page_number"))
        chunk = page_to_chunk[page_number]
        db.add(_draft_from_generated(job.id, chunk.id, item))
    for chunk in saved_chunks:
        chunk.status = "completed"
else:
    text = document_extractors.extract_text(job.stored_path, job.mime_type, job.original_filename)
    if not text:
        raise RuntimeError("无法从文档中提取文本内容")
    saved_chunks = []
    for index, chunk_text in enumerate(_chunk_text(text)):
        chunk = ImportJobChunk(
            import_job_id=job.id,
            chunk_index=index,
            text=chunk_text,
            status="processing",
        )
        db.add(chunk)
        saved_chunks.append(chunk)
    db.flush()
    for index, chunk in enumerate(saved_chunks):
        generated = llm_client.generate_question_drafts(llm_config, chunk.text, job.generation_config)
        chunk.raw_model_output = {"questions": generated}
        chunk.status = "completed"
        for item in generated:
            db.add(_draft_from_generated(job.id, chunk.id, item))
        job.progress = 40 + int(((index + 1) / len(saved_chunks)) * 50)
        db.flush()
```

Resolve `llm_config` before the branch. Do not mutate generated dictionaries with `pop`; use a copied dictionary in the final code so test fakes and logged raw output remain intact. Store each page's raw questions in `chunk.raw_model_output`.

- [ ] **Step 4: Run import integration and existing import suites**

Run: `cd backend; pytest tests/test_import_jobs.py tests/test_local_worker.py -v`

Expected: all tests pass; PDF chunks follow logical page order and TXT behavior is unchanged.

- [ ] **Step 5: Commit the import integration**

```powershell
git add backend/app/services/import_service.py backend/tests/test_import_jobs.py
git commit -m "feat: integrate complete PDF transcription imports"
```

### Task 6: Lock the fixture oracle and refresh stale prompt tests

**Files:**
- Modify: `backend/tests/test_pdf_logical_pages.py`
- Modify: `backend/tests/test_pdf_question_extraction.py`
- Modify: `backend/tests/test_llm_prompt.py`

- [ ] **Step 1: Add fixture landmark and declared-count regression tests**

```python
from app.services.pdf_question_extraction import parse_declared_counts


def test_exam_fixture_declares_correct_section_oracle() -> None:
    pages = extract_pdf_pages(str(PDF_PATH), resolution=120)
    counts = parse_declared_counts([page.text for page in pages])

    assert counts == {
        "single_choice": {"questions": 16},
        "fill_blank": {"blanks": 12},
        "true_false": {"questions": 8},
        "short_answer": {"questions": 2},
    }
    assert "闭环极点为 -2±j3" in pages[0].text
    assert "开环增益K=10" in pages[1].text
    assert "弹簧-质量-阻尼器" in pages[2].text
```

Update `test_llm_prompt.py` to assert the current Chinese text-import prompt, including `尽可能多地提取所有题目`, `难度：hard`, `explanation 字段留空字符串`, and `LaTeX`. These tests cover non-PDF text imports; page transcription is covered separately.

- [ ] **Step 2: Run the fixture and prompt tests**

Run: `cd backend; pytest tests/test_pdf_logical_pages.py tests/test_pdf_question_extraction.py tests/test_llm_prompt.py -v`

Expected: all tests pass and the fixture oracle distinguishes 11 numbered fill questions from 12 blanks.

- [ ] **Step 3: Commit regression coverage**

```powershell
git add backend/tests/test_pdf_logical_pages.py backend/tests/test_pdf_question_extraction.py backend/tests/test_llm_prompt.py
git commit -m "test: lock PDF exam extraction oracle"
```

### Task 7: Verify the full backend and perform the live fixture benchmark

**Files:**
- No production files unless verification reveals a defect covered by a new failing test.

- [ ] **Step 1: Run formatting-sensitive and complete backend tests**

Run: `cd backend; pytest -v`

Expected: zero failures and zero errors.

- [ ] **Step 2: Run a fresh local preparation benchmark**

Run:

```powershell
cd backend
python -X utf8 -c "import time; from app.services.document_extractors import extract_pdf_pages; p=r'..\期中考试试题.pdf'; t=time.perf_counter(); pages=extract_pdf_pages(p); print({'seconds': round(time.perf_counter()-t, 3), 'logical_pages': len(pages), 'png_bytes': sum(len(x.image_png) for x in pages)})"
```

Expected: `logical_pages` is 4 and local preparation remains below 3 seconds on the current machine.

- [ ] **Step 3: Run the fixture through the configured live provider**

Use a temporary test database or an isolated direct service invocation; do not modify existing user import jobs. Reuse the currently configured provider credentials without printing them. Record:

- total wall-clock seconds;
- logical pages processed and retried;
- counts by type;
- single-choice numbers 1-16 and A-D option completeness;
- 11 numbered fill questions totaling 12 blanks;
- true/false numbers 1-8;
- calculation numbers 1-2;
- presence of LaTeX in known formula-bearing questions.

Expected: 37 top-level questions, all structural checks pass, and normal wall-clock time is below 60 seconds. If provider latency exceeds 60 seconds while calls overlap, report the measured provider timings separately rather than weakening correctness validation.

- [ ] **Step 4: Inspect the final diff and working tree boundaries**

Run: `git diff --check; git status --short; git diff --stat HEAD~6..HEAD`

Expected: no whitespace errors; only planned files are part of the PDF extraction commits; pre-existing unrelated working-tree changes remain untouched.

- [ ] **Step 5: Commit any verification-only test fix, if and only if RED-GREEN required one**

```powershell
git add backend/tests/test_pdf_question_extraction.py backend/app/services/pdf_question_extraction.py
git commit -m "fix: address PDF extraction verification gap"
```

Skip this commit when verification requires no code change.
