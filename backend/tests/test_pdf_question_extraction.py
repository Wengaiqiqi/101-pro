import base64
import json
from threading import Lock
import time

import httpx

from app.services.document_extractors import PDFLogicalPage
from app.services.llm_client import (
    LLMConfig,
    _build_page_transcription_prompt,
    _normalize_page_question,
    generate_page_question_drafts,
)
from app.services.pdf_question_extraction import (
    extract_pdf_questions,
    validate_document_questions,
)


def _choice(number: int, *, labels: str = "ABCD") -> dict[str, object]:
    return {
        "section": "single_choice",
        "source_number": number,
        "type": "single_choice",
        "stem": f"第 {number} 题 $G(s)$",
        "options": [
            {
                "label": label,
                "content": label,
                "is_correct": label == "A",
                "sort_order": index,
            }
            for index, label in enumerate(labels, start=1)
        ],
        "answer": {"label": "A"},
        "blank_count": 0,
    }


def test_page_prompt_requires_objective_answers_and_allows_other_types_empty() -> None:
    prompt = _build_page_transcription_prompt(
        "source",
        1,
        {
            "question_types": [
                "single_choice",
                "multiple_choice",
                "true_false",
                "fill_blank",
                "short_answer",
            ]
        },
    )

    assert "单选题必须返回且仅返回一个有效选项标签" in prompt
    assert "多选题必须返回一个或多个有效选项标签" in prompt
    assert "判断题必须返回正确或错误对应的选项标签" in prompt
    assert "填空题必须返回非空文本答案" in prompt
    assert "其他题型允许 answer 为空" in prompt
    assert "不在允许题型中的原题必须跳过，禁止改成其他题型" in prompt


def test_page_request_sends_image_text_and_uses_xiaomi_full_modal_model() -> None:
    captured: dict[str, object] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured.update(json.loads(request.content))
        return httpx.Response(
            200,
            json={
                "choices": [
                    {
                        "message": {
                            "content": json.dumps(
                                {
                                    "questions": [
                                        {
                                            "section": "single_choice",
                                            "source_number": 1,
                                            "type": "single_choice",
                                            "stem": "题干 $G(s)$",
                                            "options": [
                                                {
                                                    "label": label,
                                                    "content": label,
                                                    "is_correct": label == "A",
                                                    "sort_order": index,
                                                }
                                                for index, label in enumerate(
                                                    "ABCD", start=1
                                                )
                                            ],
                                            "answer": {"label": "A"},
                                            "blank_count": 0,
                                            "explanation": "",
                                            "difficulty": "medium",
                                            "tags": [],
                                        }
                                    ]
                                },
                                ensure_ascii=False,
                            )
                        }
                    }
                ]
            },
        )

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
    assert captured["max_tokens"] == 1000000
    content = captured["messages"][0]["content"]
    assert [part["type"] for part in content] == ["text", "image_url"]
    assert "section 必须使用" in content[0]["text"]
    assert "计算题使用 short_answer" in content[0]["text"]
    image_url = content[1]["image_url"]["url"]
    assert image_url.startswith("data:image/png;base64,")
    assert base64.b64decode(image_url.split(",", 1)[1]).startswith(b"\x89PNG")
    assert questions[0]["source_number"] == 1


def test_page_request_retries_once_after_malformed_json() -> None:
    attempts = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal attempts
        attempts += 1
        if attempts == 1:
            content = '{"questions": ['
            finish_reason = "length"
        else:
            content = json.dumps(
                {"questions": [_choice(1)]},
                ensure_ascii=False,
            )
            finish_reason = "stop"
        return httpx.Response(
            200,
            json={
                "choices": [
                    {
                        "finish_reason": finish_reason,
                        "message": {"content": content},
                    }
                ]
            },
        )

    config = LLMConfig("test", "https://example.test/v1", "vision", "secret")
    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        questions = generate_page_question_drafts(
            config,
            page_text="示例",
            image_png=b"png",
            logical_page_number=4,
            generation_config={"question_types": ["single_choice"]},
            client=client,
        )

    assert attempts == 2
    assert questions[0]["source_number"] == 1


def test_page_request_normalizes_string_options_from_provider() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "choices": [
                    {
                        "message": {
                            "content": json.dumps(
                                {
                                    "questions": [
                                        {
                                            "section": "single_choice",
                                            "source_number": 1,
                                            "type": "single_choice",
                                            "stem": "示例题",
                                            "options": [
                                                "A. Alpha",
                                                "B. Beta",
                                                "C. Gamma",
                                                "D. Delta",
                                            ],
                                            "answer": {"label": "B"},
                                            "blank_count": 0,
                                        }
                                    ]
                                },
                                ensure_ascii=False,
                            )
                        }
                    }
                ]
            },
        )

    config = LLMConfig("test", "https://example.test/v1", "vision", "secret")
    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        questions = generate_page_question_drafts(
            config,
            page_text="示例",
            image_png=b"png",
            logical_page_number=1,
            generation_config={"question_types": ["single_choice"]},
            client=client,
        )

    assert questions[0]["options"] == [
        {"label": "A", "content": "Alpha", "is_correct": False, "sort_order": 1},
        {"label": "B", "content": "Beta", "is_correct": True, "sort_order": 2},
        {"label": "C", "content": "Gamma", "is_correct": False, "sort_order": 3},
        {"label": "D", "content": "Delta", "is_correct": False, "sort_order": 4},
    ]


def test_page_question_normalizes_choice_and_fill_answer_shapes() -> None:
    choice = _normalize_page_question(
        {
            "type": "single_choice",
            "options": ["A. Alpha", "B. Beta"],
            "answer": {"text": "B"},
        }
    )
    fill = _normalize_page_question(
        {
            "type": "fill_blank",
            "options": [],
            "answer": {"answer_text": "42"},
        }
    )

    assert choice["answer"] == {"label": "B"}
    assert choice["options"][1]["is_correct"] is True
    assert fill["answer"] == {"text": "42"}


def test_true_false_without_visible_options_gets_deterministic_options() -> None:
    question = _normalize_page_question(
        {
            "section": "true_false",
            "source_number": 1,
            "type": "true_false",
            "stem": "系统稳定是计算稳态误差的前提条件。",
            "options": [],
            "answer": {"text": "正确"},
            "blank_count": 0,
        }
    )

    assert question["options"] == [
        {"label": "A", "content": "正确", "is_correct": True, "sort_order": 1},
        {"label": "B", "content": "错误", "is_correct": False, "sort_order": 2},
    ]


def test_validation_reports_missing_number_and_option_on_source_page() -> None:
    questions = [
        {
            **_choice(number),
            "logical_page_number": 1 if number <= 9 else 2,
        }
        for number in range(1, 17)
        if number != 14
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

    assert (
        validate_document_questions(
            questions,
            declared_counts={"fill_blank": {"blanks": 12}},
        )
        == []
    )


def test_validation_rejects_duplicate_numbers_and_placeholder_options() -> None:
    first = _choice(1)
    first["logical_page_number"] = 1
    first["options"][3]["content"] = "（待补充）"
    duplicate = {**_choice(1), "logical_page_number": 1}

    issues = validate_document_questions(
        [first, duplicate],
        declared_counts={"single_choice": {"questions": 1}},
    )

    assert [issue.code for issue in issues] == [
        "duplicate_number",
        "incomplete_options",
    ]


def test_validation_requires_objective_answers_but_allows_empty_short_answer() -> None:
    questions = [
        {
            **_choice(1),
            "answer": {"label": ""},
            "logical_page_number": 1,
        },
        {
            "section": "fill_blank",
            "source_number": 1,
            "type": "fill_blank",
            "stem": "填空 ____",
            "options": [],
            "answer": {"text": ""},
            "blank_count": 1,
            "logical_page_number": 2,
        },
        {
            "section": "short_answer",
            "source_number": 1,
            "type": "short_answer",
            "stem": "说明原因",
            "options": [],
            "answer": {"text": ""},
            "blank_count": 0,
            "logical_page_number": 3,
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


def test_validation_rejects_answer_label_not_present_in_options() -> None:
    question = {
        **_choice(1),
        "answer": {"label": "Z"},
        "logical_page_number": 1,
    }

    issues = validate_document_questions(
        [question],
        declared_counts={"single_choice": {"questions": 1}},
    )

    assert [issue.code for issue in issues] == ["invalid_answer_option"]


def test_validation_checks_answers_without_declared_section_counts() -> None:
    question = {
        **_choice(1),
        "answer": {},
        "logical_page_number": 1,
    }

    issues = validate_document_questions(
        [question],
        declared_counts={},
    )

    assert [issue.code for issue in issues] == ["missing_answer"]


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
        return [
            {
                "section": "single_choice",
                "source_number": logical_page_number,
                "type": "single_choice",
                "stem": f"page {logical_page_number}",
                "options": [],
                "answer": {},
                "blank_count": 0,
            }
        ]

    pages = [
        PDFLogicalPage(i, i, (0, 0, 1, 1), "", b"png", 1)
        for i in range(1, 5)
    ]
    questions = extract_pdf_questions(
        object(),
        pages,
        {},
        page_generator=generator,
        max_workers=2,
        validate=False,
    )

    assert maximum_active == 2
    assert [item["logical_page_number"] for item in questions] == [1, 2, 3, 4]


def test_only_page_with_validation_failure_is_retried() -> None:
    calls: list[tuple[int, tuple[str, ...]]] = []

    def generator(config, *, logical_page_number, repair_errors=(), **kwargs):
        calls.append((logical_page_number, tuple(repair_errors)))
        labels = "ABC" if logical_page_number == 1 and not repair_errors else "ABCD"
        return [_choice(1, labels=labels)] if logical_page_number == 1 else []

    pages = [
        PDFLogicalPage(
            1,
            1,
            (0, 0, 1, 1),
            "一、单项选择题（本大题共1小题，每小题3分，共3分）",
            b"png",
            0,
        )
    ]
    questions = extract_pdf_questions(
        object(),
        pages,
        {},
        page_generator=generator,
        max_workers=2,
    )

    assert [page for page, _ in calls] == [1, 1]
    assert "A-D" in calls[1][1][0]
    assert len(questions[0]["options"]) == 4


def test_page_with_missing_required_answer_is_retried() -> None:
    calls: list[tuple[int, tuple[str, ...]]] = []

    def generator(config, *, logical_page_number, repair_errors=(), **kwargs):
        calls.append((logical_page_number, tuple(repair_errors)))
        answer = {"label": "B"} if repair_errors else {"label": ""}
        return [{**_choice(1), "answer": answer}]

    pages = [
        PDFLogicalPage(
            1,
            1,
            (0, 0, 1, 1),
            "一、单项选择题（本大题共1小题，每小题3分，共3分）",
            b"png",
            0,
        )
    ]

    questions = extract_pdf_questions(
        object(),
        pages,
        {},
        page_generator=generator,
    )

    assert [page for page, _ in calls] == [1, 1]
    assert "答案不能为空" in calls[1][1][0]
    assert questions[0]["answer"] == {"label": "B"}


def test_administrative_page_without_questions_skips_model_call() -> None:
    called_pages: list[int] = []

    def generator(config, *, logical_page_number, **kwargs):
        called_pages.append(logical_page_number)
        return []

    pages = [
        PDFLogicalPage(
            1,
            1,
            (0, 0, 1, 1),
            "一、单项选择题\n1. 示例题（）",
            b"png",
            0,
        ),
        PDFLogicalPage(
            2,
            1,
            (0, 0, 1, 1),
            "姓名：____\n学号：____\n第 2 页，共 2 页",
            b"png",
            0,
        ),
    ]

    extract_pdf_questions(
        object(),
        pages,
        {},
        page_generator=generator,
        validate=False,
    )

    assert called_pages == [1]


def test_page_results_are_sorted_by_section_and_source_number() -> None:
    def generator(config, **kwargs):
        return [_choice(2), _choice(1)]

    pages = [
        PDFLogicalPage(
            1,
            1,
            (0, 0, 1, 1),
            "一、单项选择题\n1. 第一题\n2. 第二题",
            b"png",
            0,
        )
    ]

    questions = extract_pdf_questions(
        object(),
        pages,
        {},
        page_generator=generator,
        validate=False,
    )

    assert [question["source_number"] for question in questions] == [1, 2]
