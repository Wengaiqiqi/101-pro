from pathlib import Path


def extract_pdf_text(path: str) -> str:
    try:
        from pypdf import PdfReader
    except ModuleNotFoundError as exc:
        raise RuntimeError("pypdf is required to extract PDF text") from exc

    reader = PdfReader(path)
    return "\n".join(page.extract_text() or "" for page in reader.pages).strip()


def extract_docx_text(path: str) -> str:
    try:
        from docx import Document
    except ModuleNotFoundError as exc:
        raise RuntimeError("python-docx is required to extract DOCX text") from exc

    document = Document(path)
    return "\n".join(paragraph.text for paragraph in document.paragraphs).strip()


def _extract_plain_text(path: str) -> str:
    data = Path(path).read_bytes()
    for encoding in ("utf-8", "utf-8-sig", "gb18030", "latin-1"):
        try:
            return data.decode(encoding).strip()
        except UnicodeDecodeError:
            continue
    return data.decode("utf-8", errors="replace").strip()


def extract_text(path: str, mime_type: str, filename: str) -> str:
    suffix = Path(filename).suffix.lower()
    normalized_mime = (mime_type or "").lower()
    if suffix == ".pdf" or normalized_mime == "application/pdf":
        return extract_pdf_text(path)
    if suffix == ".docx" or normalized_mime == "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        return extract_docx_text(path)
    if suffix == ".txt" or normalized_mime.startswith("text/") or not suffix:
        return _extract_plain_text(path)
    return _extract_plain_text(path)
