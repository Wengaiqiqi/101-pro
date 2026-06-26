from collections.abc import Sequence
from typing import Any

from fastapi import HTTPException, UploadFile, status
from sqlalchemy import delete, select
from sqlalchemy.orm import Session, selectinload

from app.models.import_job import ImportJob, ImportJobChunk, ImportedQuestionDraft
from app.models.question import Question, QuestionOption
from app.models.user import User
from app.schemas.import_job import ImportedQuestionDraftUpdate
from app.services import document_extractors, llm_client, storage
from app.services.model_settings_service import resolve_model_config
from app.services.question_service import get_owned_bank


def _not_found() -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")


def _bad_request(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)


def create_import_job(
    db: Session,
    user: User,
    bank_id: int,
    upload: UploadFile,
    generation_config: dict[str, object],
) -> ImportJob:
    get_owned_bank(db, user, bank_id)
    original_filename, stored_path = storage.save_upload(user.id, upload)
    job = ImportJob(
        user_id=user.id,
        bank_id=bank_id,
        original_filename=original_filename,
        stored_path=stored_path,
        mime_type=upload.content_type or "application/octet-stream",
        status="pending",
        progress=0,
        generation_config=generation_config,
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


def list_import_jobs(db: Session, user: User) -> list[ImportJob]:
    return list(db.scalars(select(ImportJob).where(ImportJob.user_id == user.id).order_by(ImportJob.id)))


def get_import_job(db: Session, user: User, import_job_id: int) -> ImportJob:
    job = db.scalar(select(ImportJob).where(ImportJob.id == import_job_id, ImportJob.user_id == user.id))
    if job is None:
        raise _not_found()
    return job


def retry_import_job(db: Session, user: User, import_job_id: int) -> ImportJob:
    job = get_import_job(db, user, import_job_id)
    db.execute(delete(ImportedQuestionDraft).where(ImportedQuestionDraft.import_job_id == job.id))
    db.execute(delete(ImportJobChunk).where(ImportJobChunk.import_job_id == job.id))
    job.status = "pending"
    job.progress = 0
    job.error_message = None
    db.commit()
    return process_import_job(db, job.id)


def list_drafts(db: Session, user: User, import_job_id: int) -> list[ImportedQuestionDraft]:
    get_import_job(db, user, import_job_id)
    return list(
        db.scalars(
            select(ImportedQuestionDraft)
            .where(ImportedQuestionDraft.import_job_id == import_job_id)
            .order_by(ImportedQuestionDraft.id)
        )
    )


def update_draft(
    db: Session,
    user: User,
    draft_id: int,
    payload: ImportedQuestionDraftUpdate,
) -> ImportedQuestionDraft:
    draft = _get_owned_draft(db, user, draft_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(draft, field, value)
    db.commit()
    db.refresh(draft)
    return draft


def publish_drafts(db: Session, user: User, import_job_id: int) -> dict[str, object]:
    job = get_import_job(db, user, import_job_id)
    drafts = list(
        db.scalars(
            select(ImportedQuestionDraft)
            .where(
                ImportedQuestionDraft.import_job_id == job.id,
                ImportedQuestionDraft.status.in_(("approved", "pending")),
            )
            .order_by(ImportedQuestionDraft.id)
        )
    )
    question_ids: list[int] = []
    for draft in drafts:
        options = _normalize_options(draft.options_json)
        question = Question(
            bank_id=job.bank_id,
            type=draft.type,
            stem=draft.stem,
            answer_text=_answer_text(draft.answer_json, options),
            explanation=draft.explanation,
            difficulty=draft.difficulty,
            tags=draft.tags,
            source=f"import_job:{job.id}",
            options=[QuestionOption(**option) for option in options],
        )
        db.add(question)
        db.flush()
        draft.status = "published"
        question_ids.append(question.id)

    job.status = "completed"
    job.progress = 100
    db.commit()
    return {"published_count": len(question_ids), "question_ids": question_ids}


def process_import_job(db: Session, import_job_id: int) -> ImportJob:
    job = db.get(ImportJob, import_job_id)
    if job is None:
        raise _not_found()
    user = db.get(User, job.user_id)
    if user is None:
        raise _not_found()

    job.status = "processing"
    job.progress = 10
    job.error_message = None
    db.commit()

    try:
        text = document_extractors.extract_text(job.stored_path, job.mime_type, job.original_filename)
        if not text:
            raise RuntimeError("No text could be extracted from the uploaded document")

        chunks = _chunk_text(text)
        saved_chunks: list[ImportJobChunk] = []
        for index, chunk_text in enumerate(chunks):
            chunk = ImportJobChunk(import_job_id=job.id, chunk_index=index, text=chunk_text, status="processing")
            db.add(chunk)
            saved_chunks.append(chunk)
        db.flush()

        config = resolve_model_config(db, user)
        llm_config = llm_client.LLMConfig(
            provider=config.provider,
            base_url=config.base_url,
            model=config.model,
            api_key=config.api_key,
        )

        for index, chunk in enumerate(saved_chunks):
            generated = llm_client.generate_question_drafts(llm_config, chunk.text, job.generation_config)
            chunk.raw_model_output = {"questions": generated}
            chunk.status = "completed"
            for generated_draft in generated:
                db.add(_draft_from_generated(job.id, chunk.id, generated_draft))
            job.progress = 40 + int(((index + 1) / len(saved_chunks)) * 50)
            db.flush()

        job.status = "reviewing"
        job.progress = 90
        db.commit()
    except Exception as exc:
        db.rollback()
        job = db.get(ImportJob, import_job_id)
        if job is None:
            raise
        job.status = "failed"
        job.error_message = str(exc)
        job.progress = 100
        db.commit()
    db.refresh(job)
    return job


def _get_owned_draft(db: Session, user: User, draft_id: int) -> ImportedQuestionDraft:
    draft = db.scalar(
        select(ImportedQuestionDraft)
        .join(ImportedQuestionDraft.import_job)
        .where(ImportedQuestionDraft.id == draft_id, ImportJob.user_id == user.id)
    )
    if draft is None:
        raise _not_found()
    return draft


def _chunk_text(text: str, max_chars: int = 6000) -> list[str]:
    clean_text = text.strip()
    if len(clean_text) <= max_chars:
        return [clean_text]
    return [clean_text[index : index + max_chars] for index in range(0, len(clean_text), max_chars)]


def _draft_from_generated(import_job_id: int, chunk_id: int | None, generated: dict[str, object]) -> ImportedQuestionDraft:
    stem = str(generated.get("stem") or "").strip()
    if not stem:
        raise RuntimeError("Generated draft is missing a stem")
    return ImportedQuestionDraft(
        import_job_id=import_job_id,
        source_chunk_id=chunk_id,
        type=str(generated.get("type") or "single_choice"),
        stem=stem,
        options_json=_normalize_options(generated.get("options", [])),
        answer_json=_normalize_answer(generated.get("answer")),
        explanation=str(generated.get("explanation") or ""),
        difficulty=str(generated.get("difficulty") or "normal"),
        tags=_normalize_tags(generated.get("tags", [])),
        status="pending",
    )


def _normalize_options(raw_options: object) -> list[dict[str, Any]]:
    if not isinstance(raw_options, Sequence) or isinstance(raw_options, (str, bytes)):
        return []
    options: list[dict[str, Any]] = []
    labels: set[str] = set()
    sort_orders: set[int] = set()
    for index, raw_option in enumerate(raw_options, start=1):
        if not isinstance(raw_option, dict):
            continue
        label = str(raw_option.get("label") or chr(64 + index))
        sort_order = int(raw_option.get("sort_order") or index)
        if label in labels or sort_order in sort_orders:
            raise _bad_request("Question option labels and sort orders must be unique")
        labels.add(label)
        sort_orders.add(sort_order)
        options.append(
            {
                "label": label,
                "content": str(raw_option.get("content") or ""),
                "is_correct": bool(raw_option.get("is_correct", False)),
                "sort_order": sort_order,
            }
        )
    return sorted(options, key=lambda option: int(option["sort_order"]))


def _normalize_answer(raw_answer: object) -> dict[str, Any]:
    if isinstance(raw_answer, dict):
        return raw_answer
    if raw_answer is None:
        return {}
    return {"text": str(raw_answer)}


def _normalize_tags(raw_tags: object) -> list[str]:
    if not isinstance(raw_tags, Sequence) or isinstance(raw_tags, (str, bytes)):
        return []
    return [str(tag) for tag in raw_tags]


def _answer_text(answer_json: dict[str, Any], options: list[dict[str, Any]]) -> str:
    value = answer_json.get("text") or answer_json.get("answer") or answer_json.get("label")
    if value:
        return str(value)
    correct_labels = [str(option["label"]) for option in options if option.get("is_correct")]
    if correct_labels:
        return ",".join(correct_labels)
    return ""
