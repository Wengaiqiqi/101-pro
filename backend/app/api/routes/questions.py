from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.question import QuestionCreate, QuestionPracticeResponse, QuestionResponse, QuestionUpdate
from app.services import question_service

router = APIRouter(tags=["questions"])


@router.get("/question-banks/{bank_id}/questions", response_model=list[QuestionResponse])
def list_questions(
    bank_id: int,
    skip: int = 0,
    limit: int = 100,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[QuestionResponse]:
    return question_service.list_questions(db, current_user, bank_id, skip=skip, limit=limit)


@router.get("/question-banks/{bank_id}/practice-questions", response_model=list[QuestionPracticeResponse])
def list_practice_questions(
    bank_id: int,
    skip: int = 0,
    limit: int = 100,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[QuestionPracticeResponse]:
    return question_service.list_questions(db, current_user, bank_id, skip=skip, limit=limit)


@router.post("/question-banks/{bank_id}/questions", response_model=QuestionResponse, status_code=status.HTTP_201_CREATED)
def create_question(
    bank_id: int,
    payload: QuestionCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> QuestionResponse:
    return question_service.create_question(db, current_user, bank_id, payload)


@router.put("/questions/{question_id}", response_model=QuestionResponse)
def update_question(
    question_id: int,
    payload: QuestionUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> QuestionResponse:
    return question_service.update_question(db, current_user, question_id, payload)


@router.delete("/questions/{question_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_question(
    question_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    question_service.delete_question(db, current_user, question_id)
