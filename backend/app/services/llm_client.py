from dataclasses import dataclass
import json
from typing import Any


@dataclass(frozen=True)
class LLMConfig:
    provider: str
    base_url: str
    model: str
    api_key: str


def generate_question_drafts(
    config: LLMConfig,
    text: str,
    generation_config: dict[str, object],
) -> list[dict[str, object]]:
    try:
        import httpx
    except ModuleNotFoundError as exc:
        raise RuntimeError("httpx is required to generate question drafts") from exc

    prompt = (
        "Generate question drafts from the source text. Return only JSON with a top-level "
        "'questions' array. Each question must include type, stem, options, answer, "
        "explanation, difficulty, and tags.\n\n"
        f"Generation config: {json.dumps(generation_config, ensure_ascii=False)}\n\n"
        f"Source text:\n{text}"
    )
    response = httpx.post(
        f"{config.base_url.rstrip('/')}/chat/completions",
        headers={"Authorization": f"Bearer {config.api_key}"},
        json={
            "model": config.model,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.2,
        },
        timeout=60,
    )
    response.raise_for_status()
    payload = response.json()
    content = payload["choices"][0]["message"]["content"]
    parsed: Any = json.loads(content)
    if isinstance(parsed, list):
        questions = parsed
    else:
        questions = parsed.get("questions", [])
    if not isinstance(questions, list):
        raise RuntimeError("Model response did not contain a questions list")
    return [question for question in questions if isinstance(question, dict)]
