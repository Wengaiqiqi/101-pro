from fastapi import APIRouter, Depends, File, Form, UploadFile, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.import_job import (
    ImportedQuestionDraftResponse,
    ImportedQuestionDraftUpdate,
    ImportJobResponse,
    ImportPublishResponse,
)
from app.services import import_service

router = APIRouter(tags=["import-jobs"])


@router.post("/import-jobs", response_model=ImportJobResponse, status_code=status.HTTP_201_CREATED)
def create_import_job(
    bank_id: int = Form(...),
    question_types: str = Form("single_choice"),
    question_count: int = Form(5),
    difficulty: str = Form("normal"),
    language: str = Form("zh-CN"),
    with_explanations: bool = Form(True),
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ImportJobResponse:
    generation_config: dict[str, object] = {
        "question_types": [item.strip() for item in question_types.split(",") if item.strip()],
        "question_count": question_count,
        "difficulty": difficulty,
        "language": language,
        "with_explanations": with_explanations,
    }
    job = import_service.create_import_job(db, current_user, bank_id, file, generation_config)
    import_service.enqueue_import_job(job.id)
    return job


@router.get("/import-jobs", response_model=list[ImportJobResponse])
def list_import_jobs(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[ImportJobResponse]:
    return import_service.list_import_jobs(db, current_user)


@router.get("/import-jobs/{import_job_id}", response_model=ImportJobResponse)
def get_import_job(
    import_job_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ImportJobResponse:
    return import_service.get_import_job(db, current_user, import_job_id)


@router.post("/import-jobs/{import_job_id}/retry", response_model=ImportJobResponse)
def retry_import_job(
    import_job_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ImportJobResponse:
    return import_service.retry_import_job(db, current_user, import_job_id)


@router.get("/import-jobs/{import_job_id}/drafts", response_model=list[ImportedQuestionDraftResponse])
def list_import_drafts(
    import_job_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[ImportedQuestionDraftResponse]:
    return import_service.list_drafts(db, current_user, import_job_id)


@router.put("/import-drafts/{draft_id}", response_model=ImportedQuestionDraftResponse)
def update_import_draft(
    draft_id: int,
    payload: ImportedQuestionDraftUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ImportedQuestionDraftResponse:
    return import_service.update_draft(db, current_user, draft_id, payload)


@router.post("/import-jobs/{import_job_id}/publish", response_model=ImportPublishResponse)
def publish_import_job(
    import_job_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ImportPublishResponse:
    return import_service.publish_drafts(db, current_user, import_job_id)
