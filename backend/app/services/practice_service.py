from datetime import UTC, date, datetime, timedelta
import logging
import re
from typing import Any

logger = logging.getLogger(__name__)

from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.core.exceptions import BadRequestError, NotFoundError
from app.models.practice import PracticeAnswer, PracticeSession, WrongQuestion
from app.models.question import Question
from app.models.user import User
from app.schemas.practice import ActivityStatsResponse, DailyActivity, PracticeAnswerCreate, PracticeSessionCreate
from app.services._common import get_owned_bank as _get_owned_bank
from app.services.llm_client import LLMConfig, evaluate_short_answer, evaluate_short_answer_by_ai


def normalize_answer(value: object) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return sorted(str(item).strip().lower() for item in value if str(item).strip())
    return [str(value).strip().lower()]


def _choice_answer_labels(value: object) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        parts = value
    else:
        parts = re.split(r"[\s,|]+", str(value))
    return sorted(str(part).strip().lower() for part in parts if str(part).strip())


def _normalized_text(value: object) -> str:
    return " ".join(str(value).strip().lower().split())


def is_answer_correct(question: Question, user_answer: object, llm_config: LLMConfig | None = None) -> tuple[bool, str | None]:
    """返回 (是否正确, AI反馈)。非简答题 feedback 为 None。"""
    question_type = question.type.lower()
    if question_type == "multiple_choice":
        return _choice_answer_labels(question.answer_text) == _choice_answer_labels(user_answer), None

    if question_type == "short_answer" and llm_config:
        qid = getattr(question, 'id', '?')
        user_text = str(user_answer).strip() if user_answer else ""
        if user_text:
            if question.answer_text:
                print(f"[AI grading] question {qid}: grading with reference answer")
                result = evaluate_short_answer(llm_config, question.stem, question.answer_text, user_text)
            else:
                print(f"[AI grading] question {qid}: no reference answer, AI solving + grading")
                result = evaluate_short_answer_by_ai(llm_config, question.stem, user_text)
            print(f"[AI grading] question {qid}: result={result}")
            return bool(result.get("correct", False)), str(result.get("feedback", ""))
        else:
            print(f"[AI grading] question {qid}: SKIPPED - empty user answer")

    expected = normalize_answer(question.answer_text.split("|"))
    actual = normalize_answer(user_answer)
    if question_type in {"fill_blank", "short_answer"}:
        accepted_answers = {_normalized_text(answer) for answer in question.answer_text.split("|")}
        return _normalized_text(user_answer) in accepted_answers, None
    return expected == actual, None


def _resolve_llm_config(db: Session, user: User) -> LLMConfig | None:
    """尝试获取 LLM 配置：用户设置 > 全局设置 > 平台设置。"""
    from app.services.model_settings_service import resolve_model_config
    try:
        config = resolve_model_config(db, user)
        print(f"[AI grading] LLM config resolved: provider={config.provider}, model={config.model}, base_url={config.base_url}")
        return LLMConfig(provider=config.provider, base_url=config.base_url, model=config.model, api_key=config.api_key)
    except Exception as exc:
        print(f"[AI grading] LLM config resolution FAILED: {exc}")
        return None


def create_practice_session(db: Session, user: User, payload: PracticeSessionCreate) -> PracticeSession:
    _get_owned_bank(db, payload.bank_id, user)
    available_count = db.scalar(select(func.count()).select_from(Question).where(Question.bank_id == payload.bank_id)) or 0
    if available_count == 0:
        raise BadRequestError("Question bank has no questions")

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
    return _get_practice_session(db, user, session_id)


def _get_practice_session(db: Session, user: User, session_id: int, *, for_update: bool = False) -> PracticeSession:
    statement = (
        select(PracticeSession)
        .options(selectinload(PracticeSession.answers))
        .where(PracticeSession.id == session_id, PracticeSession.user_id == user.id)
    )
    if for_update:
        statement = statement.with_for_update()
    session = db.scalar(statement)
    if session is None:
        raise NotFoundError()
    session.answers.sort(key=lambda answer: answer.id)
    return session


def submit_answer(db: Session, user: User, session_id: int, payload: PracticeAnswerCreate) -> tuple[PracticeAnswer, bool]:
    session = _get_practice_session(db, user, session_id, for_update=True)
    if session.finished_at is not None:
        raise BadRequestError("Practice session is already finished")

    question = db.scalar(select(Question).where(Question.id == payload.question_id, Question.bank_id == session.bank_id))
    if question is None:
        raise BadRequestError("Question does not belong to this practice session")

    # 简答题使用 AI 评判
    llm_config = _resolve_llm_config(db, user) if question.type == "short_answer" else None
    is_correct, feedback = is_answer_correct(question, payload.user_answer, llm_config)
    answer = _get_practice_answer(db, session_id, payload.question_id, for_update=True)
    created = answer is None
    was_correct = answer.is_correct if answer is not None else None
    if created and _session_answer_count(db, session_id) >= session.question_count:
        raise BadRequestError("Practice session question limit reached")

    if created:
        answer = PracticeAnswer(session_id=session_id, question_id=payload.question_id, user_answer_json={})
        _apply_answer(answer, payload, is_correct, feedback)
        try:
            with db.begin_nested():
                db.add(answer)
                db.flush()
        except IntegrityError:
            answer = _get_practice_answer(db, session_id, payload.question_id, for_update=True)
            if answer is None:
                raise BadRequestError("Practice answer could not be saved")
            created = False
            was_correct = answer.is_correct
            _apply_answer(answer, payload, is_correct, feedback)
    else:
        _apply_answer(answer, payload, is_correct, feedback)

    if not is_correct and (created or was_correct is True):
        _record_wrong_answer(db, user, payload.question_id)

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise BadRequestError("Practice answer could not be saved") from exc

    db.refresh(answer)
    return answer, created


def finish_practice_session(db: Session, user: User, session_id: int) -> PracticeSession:
    session = _get_practice_session(db, user, session_id, for_update=True)
    answered_count = len(session.answers)
    score = sum(1 for answer in session.answers if answer.is_correct)
    session.score = score
    session.accuracy = int(score * 100 / answered_count) if answered_count else 0
    session.finished_at = datetime.now(UTC)
    db.commit()
    return get_practice_session(db, user, session_id)


def list_wrong_questions(db: Session, user: User, *, skip: int = 0, limit: int = 100) -> list[WrongQuestion]:
    statement = (
        select(WrongQuestion)
        .where(WrongQuestion.user_id == user.id)
        .order_by(WrongQuestion.updated_at.desc(), WrongQuestion.id.desc())
        .offset(skip)
        .limit(limit)
    )
    return list(db.scalars(statement))


def mark_wrong_question_mastered(db: Session, user: User, wrong_question_id: int) -> WrongQuestion:
    wrong_question = db.scalar(
        select(WrongQuestion).where(WrongQuestion.id == wrong_question_id, WrongQuestion.user_id == user.id)
    )
    if wrong_question is None:
        raise NotFoundError()
    wrong_question.mastery_status = "mastered"
    db.commit()
    db.refresh(wrong_question)
    return wrong_question


def _get_practice_answer(db: Session, session_id: int, question_id: int, *, for_update: bool = False) -> PracticeAnswer | None:
    statement = select(PracticeAnswer).where(
        PracticeAnswer.session_id == session_id,
        PracticeAnswer.question_id == question_id,
    )
    if for_update:
        statement = statement.with_for_update()
    return db.scalar(statement)


def _session_answer_count(db: Session, session_id: int) -> int:
    return db.scalar(select(func.count()).select_from(PracticeAnswer).where(PracticeAnswer.session_id == session_id)) or 0


def _apply_answer(answer: PracticeAnswer, payload: PracticeAnswerCreate, is_correct: bool, feedback: str | None = None) -> None:
    answer.user_answer_json = {"value": payload.user_answer}
    answer.elapsed_seconds = payload.elapsed_seconds
    answer.is_correct = is_correct
    if feedback:
        answer.feedback = feedback


def _record_wrong_answer(db: Session, user: User, question_id: int) -> None:
    now = datetime.now(UTC)
    result = db.execute(
        update(WrongQuestion)
        .where(WrongQuestion.user_id == user.id, WrongQuestion.question_id == question_id)
        .values(
            wrong_count=WrongQuestion.wrong_count + 1,
            last_wrong_at=now,
            mastery_status="unmastered",
            updated_at=now,
        )
    )
    if result.rowcount:
        return

    try:
        with db.begin_nested():
            db.add(
                WrongQuestion(
                    user_id=user.id,
                    question_id=question_id,
                    wrong_count=1,
                    last_wrong_at=now,
                    mastery_status="unmastered",
                )
            )
    except IntegrityError:
        db.execute(
            update(WrongQuestion)
            .where(WrongQuestion.user_id == user.id, WrongQuestion.question_id == question_id)
            .values(
                wrong_count=WrongQuestion.wrong_count + 1,
                last_wrong_at=now,
                mastery_status="unmastered",
                updated_at=now,
            )
        )


def get_activity_stats(db: Session, user: User, days: int = 7) -> ActivityStatsResponse:
    today = date.today()
    start = today - timedelta(days=days - 1)
    start_str = start.isoformat()

    # Get sessions per day
    session_rows = db.execute(
        select(PracticeSession)
        .where(PracticeSession.user_id == user.id)
    ).scalars().all()

    # Aggregate in Python to avoid SQLite func.date() timezone issues
    day_sessions: dict[str, list[int]] = {}  # date_str -> [session_ids]
    for s in session_rows:
        if s.started_at is None:
            continue
        ds = s.started_at.date().isoformat() if s.started_at.tzinfo else s.started_at.strftime("%Y-%m-%d")
        if ds >= start_str:
            day_sessions.setdefault(ds, []).append(s.id)

    # Get answers for those sessions
    all_session_ids = [sid for sids in day_sessions.values() for sid in sids]
    day_correct: dict[str, int] = {}
    day_total: dict[str, int] = {}
    day_elapsed: dict[str, int] = {}

    if all_session_ids:
        answers = db.execute(
            select(PracticeAnswer)
            .where(PracticeAnswer.session_id.in_(all_session_ids))
        ).scalars().all()

        # Build session_id -> date lookup
        session_date: dict[int, str] = {}
        for ds, sids in day_sessions.items():
            for sid in sids:
                session_date[sid] = ds

        for a in answers:
            ds = session_date.get(a.session_id)
            if not ds:
                continue
            day_total[ds] = day_total.get(ds, 0) + 1
            day_elapsed[ds] = day_elapsed.get(ds, 0) + a.elapsed_seconds
            if a.is_correct:
                day_correct[ds] = day_correct.get(ds, 0) + 1

    daily: list[DailyActivity] = []
    total_sessions = 0
    total_questions = 0
    total_correct = 0
    total_elapsed = 0

    for i in range(days):
        d = start + timedelta(days=i)
        ds = d.isoformat()
        sessions = len(day_sessions.get(ds, []))
        questions = day_total.get(ds, 0)
        correct = day_correct.get(ds, 0)
        elapsed = day_elapsed.get(ds, 0)

        daily.append(DailyActivity(
            date=ds,
            session_count=sessions,
            question_count=questions,
            correct_count=correct,
            elapsed_seconds=elapsed,
        ))
        total_sessions += sessions
        total_questions += questions
        total_correct += correct
        total_elapsed += elapsed

    return ActivityStatsResponse(
        days=days,
        total_sessions=total_sessions,
        total_questions=total_questions,
        total_correct=total_correct,
        total_elapsed_seconds=total_elapsed,
        daily=daily,
    )
