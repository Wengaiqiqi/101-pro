from collections.abc import Sequence

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.core.exceptions import BadRequestError, NotFoundError
from app.models.question import Question, QuestionBank, QuestionOption
from app.models.user import User
from app.schemas.question import QuestionCreate, QuestionOptionCreate, QuestionUpdate
from app.schemas.question_bank import QuestionBankCreate, QuestionBankUpdate
from app.services._common import get_owned_bank as _get_owned_bank


def _duplicate_options() -> BadRequestError:
    return BadRequestError("Question option labels and sort orders must be unique")


def _save_failed() -> BadRequestError:
    return BadRequestError("Question could not be saved")


def _validate_unique_options(options: Sequence[QuestionOptionCreate | dict[str, object]]) -> None:
    labels: set[str] = set()
    sort_orders: set[int] = set()
    for option in options:
        label = option.label if isinstance(option, QuestionOptionCreate) else option["label"]
        sort_order = option.sort_order if isinstance(option, QuestionOptionCreate) else option["sort_order"]
        if label in labels or sort_order in sort_orders:
            raise _duplicate_options()
        labels.add(label)
        sort_orders.add(sort_order)


def list_banks(db: Session, user: User, *, skip: int = 0, limit: int = 100) -> list[dict]:
    from sqlalchemy.orm import joinedload

    count_subq = (
        select(func.count())
        .where(Question.bank_id == QuestionBank.id)
        .correlate(QuestionBank)
        .scalar_subquery()
    )
    rows = db.execute(
        select(QuestionBank, count_subq.label("question_count"))
        .options(joinedload(QuestionBank.owner))
        .where(QuestionBank.owner_id == user.id)
        .order_by(QuestionBank.id)
        .offset(skip)
        .limit(limit)
    ).all()
    result = []
    for bank, count in rows:
        data = {c.name: getattr(bank, c.name) for c in bank.__table__.columns}
        data["question_count"] = count or 0
        data["owner_nickname"] = bank.owner.nickname or bank.owner.username
        data["owner_avatar_url"] = bank.owner.avatar_url
        result.append(data)
    return result


def list_public_banks(db: Session, *, skip: int = 0, limit: int = 50) -> list[dict]:
    from sqlalchemy.orm import joinedload
    count_subq = (
        select(func.count())
        .where(Question.bank_id == QuestionBank.id)
        .correlate(QuestionBank)
        .scalar_subquery()
    )
    rows = db.execute(
        select(QuestionBank, count_subq.label("question_count"))
        .options(joinedload(QuestionBank.owner))
        .where(QuestionBank.visibility == "public")
        .order_by(QuestionBank.updated_at.desc())
        .offset(skip)
        .limit(limit)
    ).all()
    result = []
    for bank, count in rows:
        data = {c.name: getattr(bank, c.name) for c in bank.__table__.columns}
        data["question_count"] = count or 0
        data["owner_nickname"] = bank.owner.nickname or bank.owner.username
        data["owner_avatar_url"] = bank.owner.avatar_url
        result.append(data)
    return result


def create_bank(db: Session, user: User, payload: QuestionBankCreate) -> QuestionBank:
    bank = QuestionBank(owner_id=user.id, name=payload.name, description=payload.description)
    db.add(bank)
    db.commit()
    db.refresh(bank)
    return bank


def get_owned_bank(db: Session, user: User, bank_id: int) -> QuestionBank:
    return _get_owned_bank(db, bank_id, user)


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


def list_questions(db: Session, user: User, bank_id: int, *, skip: int = 0, limit: int = 100) -> list[Question]:
    get_owned_bank(db, user, bank_id)
    statement = (
        select(Question)
        .options(selectinload(Question.options))
        .where(Question.bank_id == bank_id)
        .order_by(Question.id)
        .offset(skip)
        .limit(limit)
    )
    return list(db.scalars(statement))


def create_question(db: Session, user: User, bank_id: int, payload: QuestionCreate) -> Question:
    get_owned_bank(db, user, bank_id)
    _validate_unique_options(payload.options)
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
        raise _save_failed() from exc
    return _get_owned_question(db, user, question.id)


def update_question(db: Session, user: User, question_id: int, payload: QuestionUpdate) -> Question:
    question = _get_owned_question(db, user, question_id)
    data = payload.model_dump(exclude_unset=True)
    options = data.pop("options", None)
    if options is not None:
        _validate_unique_options(options)

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
        raise _save_failed() from exc
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
        raise NotFoundError()
    return question


def fork_bank(db: Session, user: User, bank_id: int) -> dict:
    # Get source bank
    source_bank = db.scalar(
        select(QuestionBank)
        .options(selectinload(QuestionBank.questions).selectinload(Question.options))
        .where(QuestionBank.id == bank_id, QuestionBank.visibility == "public")
    )
    if source_bank is None:
        raise NotFoundError("题库不存在或未公开")

    if source_bank.owner_id == user.id:
        raise BadRequestError("不能复制自己的题库")

    # Create new bank
    new_bank = QuestionBank(
        owner_id=user.id,
        name=f"{source_bank.name} (副本)",
        description=source_bank.description,
    )
    db.add(new_bank)
    db.flush()

    # Copy questions with options in batch
    for source_question in source_bank.questions:
        new_question = Question(
            bank_id=new_bank.id,
            type=source_question.type,
            stem=source_question.stem,
            answer_text=source_question.answer_text,
            explanation=source_question.explanation,
            difficulty=source_question.difficulty,
            tags=source_question.tags,
            source=source_question.source,
            options=[
                QuestionOption(
                    label=source_option.label,
                    content=source_option.content,
                    is_correct=source_option.is_correct,
                    sort_order=source_option.sort_order,
                )
                for source_option in source_question.options
            ],
        )
        db.add(new_question)

    db.commit()
    db.refresh(new_bank)

    # Return with question count
    count = db.scalar(select(func.count()).where(Question.bank_id == new_bank.id))
    data = {c.name: getattr(new_bank, c.name) for c in new_bank.__table__.columns}
    data["question_count"] = count or 0
    data["owner_nickname"] = user.nickname or user.username
    data["owner_avatar_url"] = user.avatar_url
    return data
