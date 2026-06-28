from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass


from app import models as models  # noqa: E402,F401
