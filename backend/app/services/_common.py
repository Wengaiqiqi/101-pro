from sqlalchemy.orm import Session

from app.core.exceptions import ForbiddenError, NotFoundError
from app.models.question import QuestionBank
from app.models.user import User


def get_owned_bank(db: Session, bank_id: int, user: User) -> QuestionBank:
    bank = db.get(QuestionBank, bank_id)
    if bank is None:
        raise NotFoundError("题库不存在")
    if bank.owner_id != user.id:
        raise ForbiddenError("无权访问此题库")
    return bank
