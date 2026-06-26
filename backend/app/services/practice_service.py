from collections.abc import Iterable
from datetime import UTC, datetime
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.models.practice import PracticeAnswer, PracticeSession, WrongQuestion
from app.models.question import Question, QuestionBank
from app.models.user import User
from app.schemas.practice import PracticeAnswerCreate, PracticeSessionCreate


def _not_found() -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")


def _bad_request(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)


def _normalize_text(value: object) -> str:
    return " ".join(str(value).strip().lower().split())


def _flatten_answer(value: object) -> Iterable[object]:
    if isinstance(value, dict):
        for key in sorted(value):
            yield from _flatten_answer(value[key])
    elif isinstance(value, (list, tuple, set)):
        for item in value:
            yield from _flatten_answer(item)
    else:
        yield value


def normalize_answer(value: object) -> list[str]:
    normalized: list[str] = []
    for item in _flatten_answer(value):
        if item is None:
            continue
        for part in str(item).replace("|", ",").split(","):
            text = _normalize_text(part)
            if text:
                normalized.append(text)
    return normalized


def _choice_labels(value: object) -> list[str]:
    labels: list[str] = []
    for item in _flatten_answer(value):
        if item is None:
            continue
        text = str(item).replace("|", " ").replace(",", " ")
        labels.extend(label for label in (_normalize_text(part) for part in text.split()) if label)
    return labels


def is_answer_correct(question: Question, user_answer: object) -> bool:
    question_type = question.type.lower()
    if question_type == "multiple_choice":
        return set(_choice_labels(question.answer_text)) == set(_choice_labels(user_answer))

    if question_type in {"fill_blank", "short_answer"}:
        actual = _normalize_text(user_answer)
        accepted_answers = [_normalize_text(answer) for answer in question.answer_text.split("|")]
        return actual in accepted_answers

    expected = normalize_answer(question.answer_text)
    actual = normalize_answer(user_answer)
    return expected == actual


def create_practice_session(db: Session, user: User, payload: PracticeSessionCreate) -> PracticeSession:
    _get_owned_bank(db, user, payload.bank_id)
    available_count = db.scalar(select(func.count()).select_from(Question).where(Question.bank_id == payload.bank_id)) or 0
    if available_count == 0:
        raise _bad_request("Question bank has no questions")

    session = PracticeSession(
        user_id=user.id,
        bank_id=payload.bank_id,
        mode=payload.mode,
        question_count=min(payload.question_count, available_count),
    )
    db.add(session)
    db.commit()
    return get_practice_session(db, user, session.id)


def get_practice_session(db: Session, user: User, session_id: int) -> PracticeSession:
    statement = (
        select(PracticeSession)
        .options(selectinload(PracticeSession.answers))
        .where(PracticeSession.id == session_id, PracticeSession.user_id == user.id)
    )
    session = db.scalar(statement)
    if session is None:
        raise _not_found()
    session.answers.sort(key=lambda answer: answer.id)
    return session


def submit_answer(db: Session, user: User, session_id: int, payload: PracticeAnswerCreate) -> tuple[PracticeAnswer, bool]:
    session = get_practice_session(db, user, session_id)
    question = db.scalar(select(Question).where(Question.id == payload.question_id, Question.bank_id == session.bank_id))
    if question is None:
        raise _bad_request("Question does not belong to this practice session")

    is_correct = is_answer_correct(question, payload.user_answer)
    answer = db.scalar(
        select(PracticeAnswer).where(
            PracticeAnswer.session_id == session_id,
            PracticeAnswer.question_id == payload.question_id,
        )
    )
    created = answer is None
    if answer is None:
        answer = PracticeAnswer(session_id=session_id, question_id=payload.question_id, user_answer_json={})
        db.add(answer)

    answer.user_answer_json = {"value": payload.user_answer}
    answer.elapsed_seconds = payload.elapsed_seconds
    answer.is_correct = is_correct

    if not is_correct:
        _record_wrong_answer(db, user, payload.question_id)

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise _bad_request("Practice answer could not be saved") from exc

    db.refresh(answer)
    return answer, created


def finish_practice_session(db: Session, user: User, session_id: int) -> PracticeSession:
    session = get_practice_session(db, user, session_id)
    answered_count = len(session.answers)
    score = sum(1 for answer in session.answers if answer.is_correct)
    session.score = score
    session.accuracy = int(score * 100 / answered_count) if answered_count else 0
    session.finished_at = datetime.now(UTC)
    db.commit()
    return get_practice_session(db, user, session_id)


def list_wrong_questions(db: Session, user: User) -> list[WrongQuestion]:
    statement = (
        select(WrongQuestion)
        .where(WrongQuestion.user_id == user.id)
        .order_by(WrongQuestion.updated_at.desc(), WrongQuestion.id.desc())
    )
    return list(db.scalars(statement))


def mark_wrong_question_mastered(db: Session, user: User, wrong_question_id: int) -> WrongQuestion:
    wrong_question = db.scalar(
        select(WrongQuestion).where(WrongQuestion.id == wrong_question_id, WrongQuestion.user_id == user.id)
    )
    if wrong_question is None:
        raise _not_found()
    wrong_question.mastery_status = "mastered"
    db.commit()
    db.refresh(wrong_question)
    return wrong_question


def _get_owned_bank(db: Session, user: User, bank_id: int) -> QuestionBank:
    bank = db.scalar(select(QuestionBank).where(QuestionBank.id == bank_id, QuestionBank.owner_id == user.id))
    if bank is None:
        raise _not_found()
    return bank


def _record_wrong_answer(db: Session, user: User, question_id: int) -> None:
    now = datetime.now(UTC)
    wrong_question = db.scalar(
        select(WrongQuestion).where(WrongQuestion.user_id == user.id, WrongQuestion.question_id == question_id)
    )
    if wrong_question is None:
        db.add(
            WrongQuestion(
                user_id=user.id,
                question_id=question_id,
                wrong_count=1,
                last_wrong_at=now,
                mastery_status="unmastered",
            )
        )
        return

    wrong_question.wrong_count += 1
    wrong_question.last_wrong_at = now
    wrong_question.mastery_status = "unmastered"
