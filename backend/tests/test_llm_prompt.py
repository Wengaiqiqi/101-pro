"""Tests for LLM prompt building and PDF text extraction."""

from app.services.llm_client import _build_prompt
from app.services.document_extractors import extract_text
from pathlib import Path


PDF_PATH = Path(__file__).resolve().parent.parent.parent / "期中考试试题.pdf"


class TestBuildPrompt:
    def test_prompt_with_auto_count_and_difficulty(self) -> None:
        config: dict[str, object] = {
            "question_types": ["single_choice", "short_answer"],
            "question_count": 0,
            "difficulty": "auto",
            "language": "zh-CN",
            "with_explanations": True,
        }
        prompt = _build_prompt("sample text", config)

        assert "Generate as many questions as the source text supports" in prompt
        assert "Choose appropriate difficulty based on the content" in prompt
        assert "single_choice" in prompt
        assert "short_answer" in prompt
        assert "Include a clear explanation" in prompt

    def test_prompt_with_specific_count_and_difficulty(self) -> None:
        config: dict[str, object] = {
            "question_types": ["single_choice"],
            "question_count": 10,
            "difficulty": "hard",
            "language": "zh-CN",
            "with_explanations": False,
        }
        prompt = _build_prompt("sample text", config)

        assert "Generate exactly 10 questions" in prompt
        assert "Difficulty level: hard" in prompt
        assert "Explanations can be empty strings" in prompt

    def test_prompt_includes_options_format_instructions(self) -> None:
        config: dict[str, object] = {
            "question_types": ["single_choice"],
            "question_count": 5,
            "difficulty": "medium",
        }
        prompt = _build_prompt("sample text", config)

        assert "options" in prompt
        assert "label" in prompt
        assert "is_correct" in prompt
        assert "A/B/C/" in prompt
        assert "extract them directly" in prompt

    def test_prompt_includes_answer_format_for_choice(self) -> None:
        config: dict[str, object] = {
            "question_types": ["single_choice"],
            "question_count": 5,
            "difficulty": "medium",
        }
        prompt = _build_prompt("sample text", config)

        assert "label" in prompt
        assert "answer" in prompt
        assert '{"label":' in prompt
        assert "is_correct" in prompt

    def test_prompt_includes_latex_instructions(self) -> None:
        config: dict[str, object] = {
            "question_types": ["single_choice"],
            "question_count": 5,
            "difficulty": "medium",
        }
        prompt = _build_prompt("sample text", config)

        assert "LaTeX" in prompt
        assert "$" in prompt
        assert "\\frac" in prompt

    def test_prompt_handles_fill_blank_and_short_answer(self) -> None:
        config: dict[str, object] = {
            "question_types": ["fill_blank", "short_answer"],
            "question_count": 3,
            "difficulty": "easy",
        }
        prompt = _build_prompt("sample text", config)

        assert "fill_blank" in prompt
        assert "short_answer" in prompt
        assert "empty" in prompt.lower()


class TestPDFTextExtraction:
    def test_extract_text_from_exam_pdf(self) -> None:
        if not PDF_PATH.exists():
            return  # skip if PDF not available

        text = extract_text(str(PDF_PATH), "application/pdf", "期中考试试题.pdf")

        # Verify key exam content is extracted
        assert "单项选择题" in text
        assert "填空题" in text
        assert "判断题" in text
        assert "计算题" in text
        # Verify specific question content
        assert "传递函数" in text
        assert "阻尼比" in text

    def test_extract_text_length_is_meaningful(self) -> None:
        if not PDF_PATH.exists():
            return

        text = extract_text(str(PDF_PATH), "application/pdf", "期中考试试题.pdf")
        assert len(text) > 500, f"Extracted text too short: {len(text)} chars"
