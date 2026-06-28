from dataclasses import dataclass
import json
import re
from typing import Any


@dataclass(frozen=True)
class LLMConfig:
    provider: str
    base_url: str
    model: str
    api_key: str


def _strip_code_fences(text: str) -> str:
    """Strip markdown code fences (```json ... ```) from LLM responses."""
    stripped = text.strip()
    match = re.match(r"^```(?:json)?\s*\n?(.*?)\n?\s*```$", stripped, re.DOTALL)
    if match:
        return match.group(1).strip()
    return stripped


def _build_prompt(text: str, generation_config: dict[str, object]) -> str:
    question_types = generation_config.get("question_types") or ["single_choice"]
    question_count = generation_config.get("question_count")
    difficulty = generation_config.get("difficulty")
    language = generation_config.get("language", "zh-CN")
    with_explanations = generation_config.get("with_explanations", True)

    count_instruction = (
        f"Generate exactly {question_count} questions."
        if isinstance(question_count, int) and question_count > 0
        else "Generate as many questions as the source text supports."
    )
    difficulty_instruction = (
        f"Difficulty level: {difficulty}."
        if difficulty and difficulty != "auto"
        else "Choose appropriate difficulty based on the content."
    )
    explanation_instruction = (
        "Include a clear explanation for each question."
        if with_explanations
        else "Explanations can be empty strings."
    )

    return (
        "You are a professional exam question generator. "
        "Analyze the source text and generate high-quality exam questions.\n\n"
        "## Rules\n"
        f"- Language: {language}\n"
        f"- Allowed question types: {', '.join(question_types)}\n"
        f"- {count_instruction}\n"
        f"- {difficulty_instruction}\n"
        f"- {explanation_instruction}\n\n"
        "## Math notation\n"
        "- Use LaTeX notation for ALL mathematical expressions, formulas, Greek letters, and symbols.\n"
        "- Wrap inline math with single dollar signs: $G(s)=\\frac{1}{Ts+1}$\n"
        "- Examples: $s^3+4s^2+5s+22=0$, $\\omega_n$, $\\zeta$, $\\lim_{t \\to \\infty}$\n\n"
        "## Question format rules\n"
        "- For single_choice / multiple_choice / true_false questions, you MUST include the "
        "'options' array with AT LEAST 2 options.\n"
        "- Each option MUST have: label (A/B/C/...), content (text), is_correct (boolean), sort_order (1,2,3,...).\n"
        "- If the source text already has A/B/C/D options for a question, extract them directly into the options array.\n"
        "- Set is_correct=true on the correct option(s). This is MANDATORY.\n"
        "- For fill_blank questions, the answer is the blank content. Options should be empty [].\n"
        "- For short_answer questions, provide a concise reference answer. Options should be empty [].\n"
        "- 'answer' MUST be an object: for choice questions use {\"label\": \"A\"} or {\"label\": [\"A\",\"C\"]}, "
        "for non-choice use {\"text\": \"the answer\"}.\n"
        "- 'difficulty' must be one of: easy, medium, hard.\n\n"
        "## Example output\n"
        "```json\n"
        '{"questions": [\n'
        '  {\n'
        '    "type": "single_choice",\n'
        '    "stem": "The characteristic equation $s^2+2s+5=0$ has damping ratio:",\n'
        '    "options": [\n'
        '      {"label": "A", "content": "$0.2$", "is_correct": false, "sort_order": 1},\n'
        '      {"label": "B", "content": "$0.5$", "is_correct": false, "sort_order": 2},\n'
        '      {"label": "C", "content": "$1.0$", "is_correct": true, "sort_order": 3},\n'
        '      {"label": "D", "content": "$2.0$", "is_correct": false, "sort_order": 4}\n'
        "    ],\n"
        '    "answer": {"label": "C"},\n'
        '    "explanation": "Standard form $s^2+2\\zeta\\omega_n s+\\omega_n^2=0$ gives $\\omega_n=\\sqrt{5}$, $\\zeta=1/\\sqrt{5}\\approx 0.447$, closest to 0.5.",\n'
        '    "difficulty": "medium",\n'
        '    "tags": ["damping ratio", "characteristic equation"]\n'
        "  }\n"
        "]}\n"
        "```\n\n"
        "## Output\n"
        "Return ONLY valid JSON matching the example above. No markdown fences around the JSON.\n\n"
        "## Source text\n"
        f"{text}"
    )


def generate_question_drafts(
    config: LLMConfig,
    text: str,
    generation_config: dict[str, object],
) -> list[dict[str, object]]:
    try:
        import httpx
    except ModuleNotFoundError as exc:
        raise RuntimeError("httpx is required to generate question drafts") from exc

    prompt = _build_prompt(text, generation_config)
    response = httpx.post(
        f"{config.base_url.rstrip('/')}/chat/completions",
        headers={"Authorization": f"Bearer {config.api_key}"},
        json={
            "model": config.model,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.2,
        },
        timeout=120,
    )
    response.raise_for_status()
    payload = response.json()
    content = _strip_code_fences(payload["choices"][0]["message"]["content"])
    parsed: Any = json.loads(content)
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
