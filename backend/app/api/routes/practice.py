from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.practice import (
    PracticeAnswerCreate,
    PracticeAnswerResponse,
    PracticeSessionCreate,
    PracticeSessionResponse,
    WrongQuestionResponse,
)
from app.services import practice_service

router = APIRouter(tags=["practice"])


@router.post("/practice-sessions", response_model=PracticeSessionResponse, status_code=status.HTTP_201_CREATED)
def create_practice_session(
    payload: PracticeSessionCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> PracticeSessionResponse:
    return practice_service.create_practice_session(db, current_user, payload)


@router.get("/practice-sessions/{session_id}", response_model=PracticeSessionResponse)
def get_practice_session(
    session_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> PracticeSessionResponse:
    return practice_service.get_practice_session(db, current_user, session_id)


@router.post("/practice-sessions/{session_id}/answers", response_model=PracticeAnswerResponse, status_code=status.HTTP_201_CREATED)
def submit_practice_answer(
    session_id: int,
    payload: PracticeAnswerCreate,
    response: Response,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> PracticeAnswerResponse:
    answer, created = practice_service.submit_answer(db, current_user, session_id, payload)
    if not created:
        response.status_code = status.HTTP_200_OK
    return answer


@router.post("/practice-sessions/{session_id}/finish", response_model=PracticeSessionResponse)
def finish_practice_session(
    session_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> PracticeSessionResponse:
    return practice_service.finish_practice_session(db, current_user, session_id)


@router.get("/wrong-questions", response_model=list[WrongQuestionResponse])
def list_wrong_questions(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[WrongQuestionResponse]:
    return practice_service.list_wrong_questions(db, current_user)


@router.post("/wrong-questions/{wrong_question_id}/mastered", response_model=WrongQuestionResponse)
def mark_wrong_question_mastered(
    wrong_question_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> WrongQuestionResponse:
    return practice_service.mark_wrong_question_mastered(db, current_user, wrong_question_id)
