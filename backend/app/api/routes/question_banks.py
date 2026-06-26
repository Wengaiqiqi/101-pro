from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.question_bank import QuestionBankCreate, QuestionBankResponse, QuestionBankUpdate
from app.services import question_service

router = APIRouter(prefix="/question-banks", tags=["question-banks"])


@router.get("", response_model=list[QuestionBankResponse])
def list_question_banks(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[QuestionBankResponse]:
    return question_service.list_banks(db, current_user)


@router.post("", response_model=QuestionBankResponse, status_code=status.HTTP_201_CREATED)
def create_question_bank(
    payload: QuestionBankCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> QuestionBankResponse:
    return question_service.create_bank(db, current_user, payload)


@router.get("/{bank_id}", response_model=QuestionBankResponse)
def get_question_bank(
    bank_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> QuestionBankResponse:
    return question_service.get_owned_bank(db, current_user, bank_id)


@router.put("/{bank_id}", response_model=QuestionBankResponse)
def update_question_bank(
    bank_id: int,
    payload: QuestionBankUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> QuestionBankResponse:
    return question_service.update_bank(db, current_user, bank_id, payload)


@router.delete("/{bank_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_question_bank(
    bank_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    question_service.delete_bank(db, current_user, bank_id)
