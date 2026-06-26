from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.models.question import Question, QuestionBank, QuestionOption
from app.models.user import User
from app.schemas.question import QuestionCreate, QuestionUpdate
from app.schemas.question_bank import QuestionBankCreate, QuestionBankUpdate


def _not_found() -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")


def _duplicate_options() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Question option labels and sort orders must be unique",
    )


def list_banks(db: Session, user: User) -> list[QuestionBank]:
    return list(db.scalars(select(QuestionBank).where(QuestionBank.owner_id == user.id).order_by(QuestionBank.id)))


def create_bank(db: Session, user: User, payload: QuestionBankCreate) -> QuestionBank:
    bank = QuestionBank(owner_id=user.id, name=payload.name, description=payload.description)
    db.add(bank)
    db.commit()
    db.refresh(bank)
    return bank


def get_owned_bank(db: Session, user: User, bank_id: int) -> QuestionBank:
    bank = db.scalar(select(QuestionBank).where(QuestionBank.id == bank_id, QuestionBank.owner_id == user.id))
    if bank is None:
        raise _not_found()
    return bank


def update_bank(db: Session, user: User, bank_id: int, payload: QuestionBankUpdate) -> QuestionBank:
    bank = get_owned_bank(db, user, bank_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(bank, field, value)
    db.commit()
    db.refresh(bank)
    return bank


def delete_bank(db: Session, user: User, bank_id: int) -> None:
    bank = get_owned_bank(db, user, bank_id)
    db.delete(bank)
    db.commit()


def list_questions(db: Session, user: User, bank_id: int) -> list[Question]:
    get_owned_bank(db, user, bank_id)
    statement = (
        select(Question)
        .options(selectinload(Question.options))
        .where(Question.bank_id == bank_id)
        .order_by(Question.id)
    )
    return list(db.scalars(statement))


def create_question(db: Session, user: User, bank_id: int, payload: QuestionCreate) -> Question:
    get_owned_bank(db, user, bank_id)
    question = Question(
        bank_id=bank_id,
        type=payload.type,
        stem=payload.stem,
        answer_text=payload.answer_text,
        explanation=payload.explanation,
        difficulty=payload.difficulty,
        tags=payload.tags,
        source=payload.source,
        options=[QuestionOption(**option.model_dump()) for option in payload.options],
    )
    db.add(question)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise _duplicate_options() from exc
    return _get_owned_question(db, user, question.id)


def update_question(db: Session, user: User, question_id: int, payload: QuestionUpdate) -> Question:
    question = _get_owned_question(db, user, question_id)
    data = payload.model_dump(exclude_unset=True)
    options = data.pop("options", None)
    for field, value in data.items():
        setattr(question, field, value)

    if options is not None:
        question.options.clear()
        db.flush()
        question.options = [QuestionOption(**option) for option in options]

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise _duplicate_options() from exc
    return _get_owned_question(db, user, question_id)


def delete_question(db: Session, user: User, question_id: int) -> None:
    question = _get_owned_question(db, user, question_id)
    db.delete(question)
    db.commit()


def _get_owned_question(db: Session, user: User, question_id: int) -> Question:
    statement = (
        select(Question)
        .join(Question.bank)
        .options(selectinload(Question.options))
        .where(Question.id == question_id, QuestionBank.owner_id == user.id)
    )
    question = db.scalar(statement)
    if question is None:
        raise _not_found()
    return question
