from collections import defaultdict
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
import logging
import re
import time
from typing import Any

from app.services import llm_client


logger = logging.getLogger(__name__)


_SECTION_PATTERNS = {
    "single_choice": (
        re.compile(r"单项选择题.*?共\s*(\d+)\s*小题"),
        "questions",
    ),
    "fill_blank": (
        re.compile(r"填空题.*?共\s*(\d+)\s*空"),
        "blanks",
    ),
    "true_false": (
        re.compile(r"判断题.*?共\s*(\d+)\s*小题"),
        "questions",
    ),
    "short_answer": (
        re.compile(r"计算题.*?共\s*(\d+)\s*小题"),
        "questions",
    ),
}

_SECTION_ORDER = {
    "single_choice": 0,
    "multiple_choice": 1,
    "fill_blank": 2,
    "true_false": 3,
    "short_answer": 4,
}

ANSWER_REQUIRED_TYPES = {
    "single_choice",
    "multiple_choice",
    "true_false",
    "fill_blank",
}


@dataclass(frozen=True)
class ValidationIssue:
    logical_page_number: int
    code: str
    message: str


def parse_declared_counts(page_texts: list[str]) -> dict[str, dict[str, int]]:
    text = "\n".join(page_texts)
    result: dict[str, dict[str, int]] = {}
    for section, (pattern, unit) in _SECTION_PATTERNS.items():
        match = pattern.search(text)
        if match:
            result[section] = {unit: int(match.group(1))}
    return result


def _page_needs_model(page: object) -> bool:
    if page.embedded_image_count:
        return True
    return bool(
        re.search(
            r"(?:单项选择题|多项选择题|填空题|判断题|计算题|"
            r"(?:^|\n)\s*\d+\s*[.．、])",
            page.text,
        )
    )


def _page_for_missing(
    number: int,
    section_questions: list[dict[str, Any]],
) -> int:
    ordered = sorted(
        section_questions,
        key=lambda item: int(item.get("source_number", 0)),
    )
    after = next(
        (
            item
            for item in ordered
            if int(item.get("source_number", 0)) > number
        ),
        None,
    )
    before = next(
        (
            item
            for item in reversed(ordered)
            if int(item.get("source_number", 0)) < number
        ),
        None,
    )
    source = after or before
    return int(source.get("logical_page_number", 1)) if source else 1


def _answer_labels(answer: object) -> list[str]:
    if not isinstance(answer, dict):
        return []
    value = (
        answer.get("label")
        or answer.get("labels")
        or answer.get("answer")
    )
    if isinstance(value, list):
        return [
            str(item).strip().upper()
            for item in value
            if str(item).strip()
        ]
    return [
        part.upper()
        for part in re.split(r"[,，\s]+", str(value or "").strip())
        if part
    ]


def _answer_text(answer: object) -> str:
    if not isinstance(answer, dict):
        return str(answer or "").strip()
    return str(
        answer.get("text")
        or answer.get("answer_text")
        or answer.get("answer")
        or ""
    ).strip()


def validate_document_questions(
    questions: list[dict[str, Any]],
    *,
    declared_counts: dict[str, dict[str, int]],
) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    for section, declaration in declared_counts.items():
        selected = [
            question
            for question in questions
            if question.get("section") == section
        ]
        seen_numbers: set[int] = set()
        for item in selected:
            number = int(item.get("source_number", 0))
            if number in seen_numbers:
                issues.append(
                    ValidationIssue(
                        int(item.get("logical_page_number", 1)),
                        "duplicate_number",
                        f"{section} 第 {number} 题重复",
                    )
                )
            seen_numbers.add(number)
        expected_questions = declaration.get("questions")
        if expected_questions:
            present = {
                int(item.get("source_number", 0))
                for item in selected
            }
            for number in range(1, expected_questions + 1):
                if number not in present:
                    issues.append(
                        ValidationIssue(
                            _page_for_missing(number, selected),
                            "missing_number",
                            f"{section} 缺少第 {number} 题",
                        )
                    )

        expected_blanks = declaration.get("blanks")
        if expected_blanks is not None:
            actual_blanks = sum(
                max(0, int(item.get("blank_count", 0)))
                for item in selected
            )
            if actual_blanks != expected_blanks:
                page = (
                    int(selected[-1].get("logical_page_number", 1))
                    if selected
                    else 1
                )
                issues.append(
                    ValidationIssue(
                        page,
                        "blank_count",
                        f"{section} 应有 {expected_blanks} 空，实际 {actual_blanks} 空",
                    )
                )

    for item in questions:
        page = int(item.get("logical_page_number", 1))
        stem = str(item.get("stem") or "").strip()
        if not stem or "待补充" in stem:
            issues.append(
                ValidationIssue(
                    page,
                    "incomplete_stem",
                    "题干为空或包含占位内容",
                )
            )
        if item.get("type") == "single_choice":
            options = [
                option
                for option in item.get("options", [])
                if isinstance(option, dict)
            ]
            labels = {
                str(option.get("label"))
                for option in options
            }
            if labels != set("ABCD"):
                issues.append(
                    ValidationIssue(
                        page,
                        "missing_options",
                        "单选题必须完整包含 A-D",
                    )
                )
            elif any(
                not str(option.get("content") or "").strip()
                or "待补充" in str(option.get("content"))
                for option in options
            ):
                issues.append(
                    ValidationIssue(
                        page,
                        "incomplete_options",
                        "单选题选项包含空白或占位内容",
                    )
                )

        question_type = str(item.get("type") or "")
        if question_type in ANSWER_REQUIRED_TYPES:
            if question_type == "fill_blank":
                if not _answer_text(item.get("answer")):
                    issues.append(
                        ValidationIssue(
                            page,
                            "missing_answer",
                            "填空题答案不能为空",
                        )
                    )
            else:
                labels = _answer_labels(item.get("answer"))
                option_labels = {
                    str(option.get("label") or "").upper()
                    for option in item.get("options", [])
                    if isinstance(option, dict)
                }
                if not labels:
                    issues.append(
                        ValidationIssue(
                            page,
                            "missing_answer",
                            "选择或判断题答案不能为空",
                        )
                    )
                elif any(label not in option_labels for label in labels):
                    issues.append(
                        ValidationIssue(
                            page,
                            "invalid_answer_option",
                            "答案引用了不存在的选项",
                        )
                    )
                elif (
                    question_type in {"single_choice", "true_false"}
                    and len(labels) != 1
                ):
                    issues.append(
                        ValidationIssue(
                            page,
                            "invalid_answer_count",
                            "该题型必须且只能有一个答案",
                        )
                    )

    return sorted(
        issues,
        key=lambda issue: (
            issue.logical_page_number,
            issue.code,
            issue.message,
        ),
    )


def extract_pdf_questions(
    config: object,
    pages: list[object],
    generation_config: dict[str, object],
    *,
    page_generator: Callable[..., list[dict[str, object]]] = (
        llm_client.generate_page_question_drafts
    ),
    max_workers: int = 2,
    validate: bool = True,
) -> list[dict[str, Any]]:
    try:
        import httpx
    except ModuleNotFoundError as exc:
        raise RuntimeError("httpx is required to transcribe PDF pages") from exc

    total_started = time.perf_counter()
    results: dict[int, list[dict[str, object]]] = {}
    with httpx.Client(timeout=httpx.Timeout(180.0, connect=15.0)) as client:

        def call_page(
            page: object,
            repair_errors: tuple[str, ...] | list[str] = (),
        ) -> list[dict[str, object]]:
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

        worker_count = min(max_workers, max(1, len(pages)))
        with ThreadPoolExecutor(max_workers=worker_count) as pool:
            futures = {
                pool.submit(call_page, page): page
                for page in pages
                if _page_needs_model(page)
            }
            for future in as_completed(futures):
                page = futures[future]
                results[page.logical_page_number] = future.result()

        def merged() -> list[dict[str, Any]]:
            return [
                {**question, "logical_page_number": page_number}
                for page_number in sorted(results)
                for question in sorted(
                    results[page_number],
                    key=lambda item: (
                        _SECTION_ORDER.get(str(item.get("section")), 99),
                        int(item.get("source_number") or 0),
                    ),
                )
            ]

        if validate:
            counts = parse_declared_counts([page.text for page in pages])
            allowed = set(generation_config.get("question_types") or counts)
            counts = {
                section: value
                for section, value in counts.items()
                if section in allowed
            }
            issues = validate_document_questions(
                merged(),
                declared_counts=counts,
            )
            issues_by_page: dict[int, list[str]] = defaultdict(list)
            for issue in issues:
                issues_by_page[issue.logical_page_number].append(issue.message)

            page_lookup = {
                page.logical_page_number: page
                for page in pages
            }
            for page_number, messages in issues_by_page.items():
                page = page_lookup[page_number]
                results[page_number] = call_page(page, messages)

            remaining = validate_document_questions(
                merged(),
                declared_counts=counts,
            )
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
