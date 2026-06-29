from pathlib import Path

from app.services.document_extractors import (
    _should_split_pdf_page,
    extract_pdf_pages,
)
from app.services.pdf_question_extraction import parse_declared_counts


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
