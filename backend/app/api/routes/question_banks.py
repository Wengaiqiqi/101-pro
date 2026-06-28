from fastapi import APIRouter, Depends, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.question import Question
from app.models.user import User
from app.schemas.question_bank import QuestionBankCreate, QuestionBankResponse, QuestionBankUpdate
from app.services import question_service

router = APIRouter(prefix="/question-banks", tags=["question-banks"])


def _attach_question_count(db: Session, bank_data: dict) -> dict:
    count = db.scalar(select(func.count()).where(Question.bank_id == bank_data["id"]))
    bank_data["question_count"] = count or 0
    return bank_data


@router.get("", response_model=list[QuestionBankResponse])
def list_question_banks(
    skip: int = 0,
    limit: int = 100,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[QuestionBankResponse]:
    return question_service.list_banks(db, current_user, skip=skip, limit=limit)


@router.post("", response_model=QuestionBankResponse, status_code=status.HTTP_201_CREATED)
def create_question_bank(
    payload: QuestionBankCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> QuestionBankResponse:
    bank = question_service.create_bank(db, current_user, payload)
    return _attach_question_count(db, {c.name: getattr(bank, c.name) for c in bank.__table__.columns})


@router.get("/{bank_id}", response_model=QuestionBankResponse)
def get_question_bank(
    bank_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> QuestionBankResponse:
    bank = question_service.get_owned_bank(db, current_user, bank_id)
    return _attach_question_count(db, {c.name: getattr(bank, c.name) for c in bank.__table__.columns})


@router.put("/{bank_id}", response_model=QuestionBankResponse)
def update_question_bank(
    bank_id: int,
    payload: QuestionBankUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> QuestionBankResponse:
    bank = question_service.update_bank(db, current_user, bank_id, payload)
    return _attach_question_count(db, {c.name: getattr(bank, c.name) for c in bank.__table__.columns})


@router.delete("/{bank_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_question_bank(
    bank_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    question_service.delete_bank(db, current_user, bank_id)
