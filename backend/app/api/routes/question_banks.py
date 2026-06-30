from fastapi import APIRouter, Depends, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.question import Question, QuestionBank
from app.models.user import User
from app.schemas.question_bank import QuestionBankCreate, QuestionBankResponse, QuestionBankUpdate
from app.services import question_service

router = APIRouter(prefix="/question-banks", tags=["question-banks"])


def _bank_to_response(bank: QuestionBank, question_count: int, owner_nickname: str = "", owner_avatar_url: str | None = None) -> dict:
    return {
        "id": bank.id,
        "owner_id": bank.owner_id,
        "owner_nickname": owner_nickname,
        "owner_avatar_url": owner_avatar_url,
        "name": bank.name,
        "description": bank.description,
        "visibility": bank.visibility,
        "question_count": question_count,
        "created_at": bank.created_at,
        "updated_at": bank.updated_at,
    }


@router.get("", response_model=list[QuestionBankResponse])
def list_question_banks(
    skip: int = 0,
    limit: int = 100,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[QuestionBankResponse]:
    return question_service.list_banks(db, current_user, skip=skip, limit=limit)


@router.get("/public", response_model=list[QuestionBankResponse])
def list_public_banks(
    skip: int = 0,
    limit: int = 50,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[dict]:
    return question_service.list_public_banks(db, skip=skip, limit=limit)


@router.post("", response_model=QuestionBankResponse, status_code=status.HTTP_201_CREATED)
def create_question_bank(
    payload: QuestionBankCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> QuestionBankResponse:
    bank = question_service.create_bank(db, current_user, payload)
    return _bank_to_response(bank, 0, current_user.nickname or current_user.username)


@router.get("/{bank_id}", response_model=QuestionBankResponse)
def get_question_bank(
    bank_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> QuestionBankResponse:
    bank = question_service.get_owned_bank(db, current_user, bank_id)
    count = db.scalar(select(func.count()).where(Question.bank_id == bank.id))
    return _bank_to_response(bank, count or 0, current_user.nickname or current_user.username)


@router.put("/{bank_id}", response_model=QuestionBankResponse)
def update_question_bank(
    bank_id: int,
    payload: QuestionBankUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> QuestionBankResponse:
    bank = question_service.update_bank(db, current_user, bank_id, payload)
    count = db.scalar(select(func.count()).where(Question.bank_id == bank.id))
    return _bank_to_response(bank, count or 0, current_user.nickname or current_user.username)


@router.delete("/{bank_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_question_bank(
    bank_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    question_service.delete_bank(db, current_user, bank_id)


@router.post("/{bank_id}/fork", response_model=QuestionBankResponse, status_code=status.HTTP_201_CREATED)
def fork_bank(
    bank_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    return question_service.fork_bank(db, current_user, bank_id)
