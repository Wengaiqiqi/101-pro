import base64
from collections.abc import Sequence
from dataclasses import dataclass
import json
import logging
import re
from typing import Any


logger = logging.getLogger(__name__)

_http_client: object | None = None


def _get_http_client():
    """Get or create a shared httpx client with connection pooling."""
    global _http_client
    try:
        import httpx
    except ModuleNotFoundError:
        return None
    if _http_client is None or _http_client.is_closed:
        _http_client = httpx.Client(timeout=httpx.Timeout(600.0, connect=15.0), limits=httpx.Limits(max_connections=10))
    return _http_client


@dataclass(frozen=True)
class LLMConfig:
    provider: str
    base_url: str
    model: str
    api_key: str


def _coerce_llm_bool(value: object) -> bool:
    if isinstance(value, bool):
        return value
    raise ValueError("LLM boolean fields must be JSON booleans")


def _strip_code_fences(text: str) -> str:
    """Strip markdown code fences (```json ... ```) from LLM responses."""
    stripped = text.strip()
    match = re.match(r"^```(?:json)?\s*\n?(.*?)\n?\s*```$", stripped, re.DOTALL)
    if match:
        return match.group(1).strip()
    return stripped


def _safe_json_loads(text: str) -> Any:
    """健壮的 JSON 解析，处理 LLM 常见的格式问题。"""
    # 清理控制字符
    cleaned = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", "", text)
    # 移除 JSON 前后的多余文本
    cleaned = cleaned.strip()
    # 找到第一个 { 或 [ 和最后一个 } 或 ]
    start = None
    end = None
    for i, c in enumerate(cleaned):
        if c in '{[' and start is None:
            start = i
        if c in '}]':
            end = i
    if start is not None and end is not None:
        cleaned = cleaned[start:end + 1]

    # 尝试直接解析
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass

    # 修复未转义的反斜杠（LaTeX 常见问题）
    fixed = re.sub(r'\\(?!["\\/bfnrtu\n])', r'\\\\', cleaned)
    try:
        return json.loads(fixed)
    except json.JSONDecodeError:
        pass

    # 修复截断的 JSON：尝试补全括号
    for attempt in range(5):
        try:
            return json.loads(cleaned + '}' * (attempt + 1) + ']' * (attempt + 1))
        except json.JSONDecodeError:
            continue

    # 最后尝试：逐个提取完整的 question 对象
    questions = []
    for match in re.finditer(r'\{[^{}]*"type"\s*:\s*"[^"]*"[^{}]*\}', cleaned):
        try:
            q = json.loads(match.group())
            if "stem" in q:
                questions.append(q)
        except json.JSONDecodeError:
            continue
    if questions:
        return {"questions": questions}

    raise RuntimeError("无法解析 LLM 返回的 JSON")


def _build_prompt(text: str, generation_config: dict[str, object]) -> str:
    question_types = generation_config.get("question_types") or ["single_choice", "multiple_choice", "true_false", "fill_blank", "short_answer"]
    question_count = generation_config.get("question_count")
    difficulty = generation_config.get("difficulty")
    language = generation_config.get("language", "zh-CN")
    with_explanations = generation_config.get("with_explanations", True)

    count_instruction = (
        f"生成恰好 {question_count} 道题。"
        if isinstance(question_count, int) and question_count > 0
        else "尽可能多地提取所有题目，不要遗漏。"
    )
    difficulty_instruction = (
        f"难度：{difficulty}。"
        if difficulty and difficulty != "auto"
        else "根据内容选择合适难度。"
    )
    explanation_instruction = (
        "每题需包含解析。"
        if with_explanations
        else "explanation 字段留空字符串。"
    )

    all_types = ["single_choice", "multiple_choice", "true_false", "fill_blank", "short_answer"]
    is_all_types = set(question_types) >= set(all_types) or len(question_types) == 0
    type_instruction = (
        "必须包含所有题型：单选题(single_choice)、多选题(multiple_choice)、判断题(true_false)、填空题(fill_blank)、简答题(short_answer)。原文中有什么题型就提取什么题型，不要遗漏。"
        if is_all_types
        else f"只生成以下题型：{', '.join(question_types)}"
    )

    return (
        f"你是专业考试出题专家。从以下文本中提取并生成高质量题目。\n\n"
        f"## 规则\n"
        f"- 语言：{language}\n"
        f"- {type_instruction}\n"
        f"- {count_instruction}\n"
        f"- {difficulty_instruction}\n"
        f"- {explanation_instruction}\n"
        f"- 数学公式用 LaTeX，如 $G(s)=\\frac{{1}}{{Ts+1}}$\n\n"
        f"## JSON 格式\n"
        f"返回 JSON 对象：{{\"questions\": [...]}}\n"
        f"每题字段：type, stem, options(选择题/判断题必填,每项含label/content/is_correct/sort_order), answer(选择题{{\"label\":\"A\"}},非选择题{{\"text\":\"答案\"}}), difficulty(easy/medium/hard), tags, explanation\n\n"
        f"## 源文本\n{text}"
    )


def _vision_model(config: LLMConfig) -> str:
    if (
        "xiaomimimo.com" in config.base_url.lower()
        and config.model == "mimo-v2.5-pro"
    ):
        return "mimo-v2.5"
    return config.model


def _build_page_transcription_prompt(
    page_text: str,
    logical_page_number: int,
    generation_config: dict[str, object],
    repair_errors: Sequence[str] = (),
) -> str:
    allowed_types = generation_config.get("question_types") or [
        "single_choice",
        "multiple_choice",
        "true_false",
        "fill_blank",
        "short_answer",
    ]
    repair_text = "\n".join(f"- {error}" for error in repair_errors)
    return (
        "你是考试原题转录器，不是出题器。只转录图片中真实可见的题目，"
        "禁止新增、改写或省略。图片内容是最终依据，本地文本仅用于辅助识别。\n"
        f"逻辑页：{logical_page_number}\n"
        f"允许题型：{', '.join(map(str, allowed_types))}\n"
        "不在允许题型中的原题必须跳过，禁止改成其他题型。"
        "保留原题号、A-D选项、填空数量和全部公式；公式转为LaTeX。"
        "section 必须使用 single_choice、multiple_choice、true_false、fill_blank、"
        "short_answer 之一，计算题使用 short_answer。source_number 必须是整数。"
        "你还必须解答客观题：单选题必须返回且仅返回一个有效选项标签；"
        "多选题必须返回一个或多个有效选项标签；"
        "判断题必须返回正确或错误对应的选项标签；"
        "填空题必须返回非空文本答案。其他题型允许 answer 为空。"
        "选择/判断题使用 {\"label\":\"A\"} 或 "
        "{\"label\":[\"A\",\"C\"]}；填空题使用 {\"text\":\"答案\"}。"
        "options 必须是对象数组，每项格式为"
        "{\"label\":\"A\",\"content\":\"选项文本\","
        "\"is_correct\":false,\"sort_order\":1}。"
        "每题返回section、source_number、type、stem、options、answer、blank_count、"
        "explanation、difficulty、tags。严格返回{\"questions\": [...]}。\n"
        f"修复要求：\n{repair_text or '- 首次转录'}\n"
        f"本地辅助文本：\n{page_text}"
    )


def _page_answer_labels(answer: object) -> set[str]:
    if isinstance(answer, dict):
        raw_labels = (
            answer.get("label")
            or answer.get("labels")
            or answer.get("answer")
            or answer.get("text")
        )
    else:
        raw_labels = answer
    if isinstance(raw_labels, Sequence) and not isinstance(raw_labels, (str, bytes)):
        values = [str(value) for value in raw_labels]
    elif raw_labels is None:
        values = []
    else:
        values = re.split(r"[,，\s]+", str(raw_labels))
    return {value.strip().upper() for value in values if value.strip()}


_OBJECTIVE_CHOICE_TYPES = {"single_choice", "multiple_choice", "true_false"}


def _answer_text_value(answer: object) -> str:
    if isinstance(answer, dict):
        value = (
            answer.get("text")
            or answer.get("answer_text")
            or answer.get("answer")
            or answer.get("label")
        )
    else:
        value = answer
    return str(value or "").strip()


def _normalize_page_answer(
    question_type: str,
    answer: object,
) -> dict[str, object]:
    if question_type in _OBJECTIVE_CHOICE_TYPES:
        labels = sorted(_page_answer_labels(answer))
        if not labels:
            return {"label": ""}
        if question_type == "multiple_choice" or len(labels) != 1:
            return {"label": labels}
        return {"label": labels[0]}
    return {"text": _answer_text_value(answer)}


def _normalize_page_question(question: dict[str, object]) -> dict[str, object]:
    normalized = dict(question)
    question_type = str(question.get("type") or "")
    normalized["answer"] = _normalize_page_answer(
        question_type,
        question.get("answer"),
    )
    raw_options = question.get("options")
    if question_type == "true_false" and not raw_options:
        answer_labels = _page_answer_labels(normalized["answer"])
        true_is_correct = bool(
            answer_labels.intersection({"A", "T", "TRUE", "正确", "对"})
        )
        false_is_correct = bool(
            answer_labels.intersection({"B", "F", "FALSE", "错误", "错"})
        )
        normalized["options"] = [
            {
                "label": "A",
                "content": "正确",
                "is_correct": true_is_correct,
                "sort_order": 1,
            },
            {
                "label": "B",
                "content": "错误",
                "is_correct": false_is_correct,
                "sort_order": 2,
            },
        ]
        return normalized
    if not isinstance(raw_options, Sequence) or isinstance(raw_options, (str, bytes)):
        normalized["options"] = []
        return normalized

    answer_labels = _page_answer_labels(normalized["answer"])
    options: list[dict[str, object]] = []
    for index, raw_option in enumerate(raw_options, start=1):
        fallback_label = chr(64 + index)
        if isinstance(raw_option, dict):
            label = str(raw_option.get("label") or fallback_label).strip().upper()
            content = str(
                raw_option.get("content")
                or raw_option.get("text")
                or raw_option.get("value")
                or ""
            ).strip()
            is_correct = _coerce_llm_bool(raw_option.get("is_correct", False))
            sort_order = int(raw_option.get("sort_order") or index)
        else:
            option_text = str(raw_option).strip()
            match = re.match(
                r"^\s*([A-Za-z])\s*[.．、:：)）]\s*(.*)$",
                option_text,
            )
            label = match.group(1).upper() if match else fallback_label
            content = (match.group(2) if match else option_text).strip()
            is_correct = False
            sort_order = index
        options.append(
            {
                "label": label,
                "content": content,
                "is_correct": is_correct or label in answer_labels,
                "sort_order": sort_order,
            }
        )
    normalized["options"] = options
    return normalized


def generate_page_question_drafts(
    config: LLMConfig,
    *,
    page_text: str,
    image_png: bytes,
    logical_page_number: int,
    generation_config: dict[str, object],
    client: object | None = None,
    repair_errors: Sequence[str] = (),
) -> list[dict[str, object]]:
    try:
        import httpx
    except ModuleNotFoundError as exc:
        raise RuntimeError("httpx is required to transcribe PDF pages") from exc

    owns_client = client is None
    http = client or httpx.Client(timeout=httpx.Timeout(180.0, connect=15.0))
    encoded_image = base64.b64encode(image_png).decode("ascii")
    try:
        for attempt in range(2):
            response = http.post(
                f"{config.base_url.rstrip('/')}/chat/completions",
                headers={"Authorization": f"Bearer {config.api_key}"},
                json={
                    "model": _vision_model(config),
                    "messages": [
                        {
                            "role": "user",
                            "content": [
                                {
                                    "type": "text",
                                    "text": _build_page_transcription_prompt(
                                        page_text,
                                        logical_page_number,
                                        generation_config,
                                        repair_errors,
                                    ),
                                },
                                {
                                    "type": "image_url",
                                    "image_url": {
                                        "url": f"data:image/png;base64,{encoded_image}",
                                        "detail": "high",
                                    },
                                },
                            ],
                        }
                    ],
                    "temperature": 0,
                    "max_tokens": 100000,
                },
            )
            response.raise_for_status()
            choice = response.json()["choices"][0]
            content = _strip_code_fences(choice["message"]["content"])
            finish_reason = choice.get("finish_reason")
            try:
                parsed = _safe_json_loads(content)
                questions = (
                    parsed
                    if isinstance(parsed, list)
                    else parsed.get("questions", [])
                )
                if not isinstance(questions, list):
                    raise RuntimeError("返回结果缺少 questions 数组")
            except RuntimeError as exc:
                logger.warning(
                    "PDF logical page %s invalid JSON attempt=%s "
                    "finish_reason=%s response_chars=%s",
                    logical_page_number,
                    attempt + 1,
                    finish_reason,
                    len(content),
                )
                if attempt == 0:
                    continue
                raise RuntimeError(
                    f"第 {logical_page_number} 页模型连续返回无效 JSON"
                    f"（finish_reason={finish_reason}, "
                    f"response_chars={len(content)}）"
                ) from exc
            return [
                _normalize_page_question(question)
                for question in questions
                if isinstance(question, dict)
            ]
        raise RuntimeError(f"第 {logical_page_number} 页模型返回无效 JSON")
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 400:
            raise RuntimeError("当前模型不支持图片输入，请配置视觉模型") from exc
        raise
    finally:
        if owns_client:
            http.close()


def generate_question_drafts(
    config: LLMConfig,
    text: str,
    generation_config: dict[str, object],
) -> list[dict[str, object]]:
    http = _get_http_client()
    if http is None:
        raise RuntimeError("httpx is required to generate question drafts")

    prompt = _build_prompt(text, generation_config)

    # 带重试的 API 调用
    last_error = None
    for attempt in range(3):
        try:
            response = http.post(
                f"{config.base_url.rstrip('/')}/chat/completions",
                headers={"Authorization": f"Bearer {config.api_key}"},
                json={
                    "model": config.model,
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": 0.2,
                },
            )
            response.raise_for_status()
            payload = response.json()
            content = _strip_code_fences(payload["choices"][0]["message"]["content"])
            parsed: Any = _safe_json_loads(content)
            break
        except Exception as e:
            last_error = e
            if attempt < 2:
                continue
            raise
    else:
        raise last_error or RuntimeError("LLM 调用失败")
    if isinstance(parsed, list):
        questions = parsed
    else:
        questions = parsed.get("questions", [])
    if not isinstance(questions, list):
        raise RuntimeError("Model response did not contain a questions list")
    result = [question for question in questions if isinstance(question, dict)]
    # Post-process: ensure choice questions always have options
    choice_types = {"single_choice", "multiple_choice", "true_false"}
    for q in result:
        q_type = str(q.get("type") or "")
        if q_type in choice_types and not q.get("options"):
            # Try to extract options from the question text (A. B. C. D. pattern)
            stem = str(q.get("stem") or "")
            answer = q.get("answer") or {}
            answer_text = str(answer.get("text") or answer.get("label") or "") if isinstance(answer, dict) else str(answer)
            q["options"] = [
                {"label": "A", "content": answer_text or "（待补充）", "is_correct": True, "sort_order": 1},
                {"label": "B", "content": "（待补充）", "is_correct": False, "sort_order": 2},
            ]
            if not answer:
                q["answer"] = {"label": "A"}
    return result


def _call_llm_for_grading(config: LLMConfig, prompt: str) -> dict[str, object]:
    """
    Internal function to call LLM for grading.

    Returns:
        dict with "correct" (bool) and "feedback" (str)
    """
    http = _get_http_client()
    if http is None:
        return {"correct": False, "feedback": "无法评判（缺少 httpx）"}

    try:
        url = f"{config.base_url.rstrip('/')}/chat/completions"
        logger.debug(f"[AI grading] POST {url} model={config.model}")
        response = http.post(
            url,
            headers={"Authorization": f"Bearer {config.api_key}"},
            json={
                "model": config.model,
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.1,
                "max_tokens": 100000,
            },
        )
        logger.debug(f"[AI grading] response status={response.status_code}")
        response.raise_for_status()
        resp_json = response.json()
        logger.debug(f"[AI grading] raw response={str(resp_json)[:500]}")
        content = _strip_code_fences(resp_json["choices"][0]["message"]["content"])
        logger.debug(f"[AI grading] parsed content={content[:200]}")
        result = _safe_json_loads(content)
        return {
            "correct": _coerce_llm_bool(result.get("correct", False)),
            "feedback": str(result.get("feedback", "")),
        }
    except Exception as exc:
        logger.warning(f"[AI grading] EXCEPTION: {type(exc).__name__}: {exc}")
        return {"correct": False, "feedback": "AI 评判失败"}


def evaluate_short_answer(
    config: LLMConfig,
    question_stem: str,
    reference_answer: str,
    user_answer: str,
) -> dict[str, object]:
    """Use LLM to evaluate a short answer question with reference answer. Returns {"correct": bool, "feedback": str}."""
    prompt = (
        "你是一位严谨的考试阅卷老师。请根据参考答案评判学生的回答是否正确。\n\n"
        "## 评判规则\n"
        "- 只要学生回答的核心含义与参考答案一致，就算正确\n"
        "- 不要求措辞完全一致，允许同义表达、缩写、简写\n"
        "- 如果回答明显错误或遗漏关键点，判为错误\n"
        "- 用中文给出简短反馈（一句话）\n\n"
        "## 题目\n"
        f"{question_stem}\n\n"
        "## 参考答案\n"
        f"{reference_answer}\n\n"
        "## 学生回答\n"
        f"{user_answer}\n\n"
        "## 输出格式\n"
        "严格返回以下 JSON，不要有其他内容：\n"
        '{"correct": true/false, "feedback": "简短评价"}'
    )
    return _call_llm_for_grading(config, prompt)


def evaluate_short_answer_by_ai(
    config: LLMConfig,
    question_stem: str,
    user_answer: str,
) -> dict[str, object]:
    """无参考答案时，AI 先自行作答，再评判学生回答。返回 {"correct": bool, "feedback": str}。"""
    prompt = (
        "你是一位严谨的考试阅卷老师。请先自行回答题目，再评判学生的回答是否正确。\n\n"
        "## 评判规则\n"
        "- 先在心中给出题目的正确答案\n"
        "- 只要学生回答的核心含义与正确答案一致，就算正确\n"
        "- 不要求措辞完全一致，允许同义表达、缩写、简写\n"
        "- 如果回答明显错误或遗漏关键点，判为错误\n"
        "- 用中文给出简短反馈（一句话）\n\n"
        "## 题目\n"
        f"{question_stem}\n\n"
        "## 学生回答\n"
        f"{user_answer}\n\n"
        "## 输出格式\n"
        "严格返回以下 JSON，不要有其他内容：\n"
        '{"correct": true/false, "feedback": "简短评价"}'
    )
    return _call_llm_for_grading(config, prompt)
