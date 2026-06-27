from collections.abc import Generator

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings


def create_database_engine(database_url: str) -> Engine:
    engine_kwargs: dict[str, object] = {"pool_pre_ping": True}
    if database_url.startswith("sqlite"):
        engine_kwargs["connect_args"] = {"check_same_thread": False, "timeout": 30}

    database_engine = create_engine(database_url, **engine_kwargs)
    if database_url.startswith("sqlite"):

        @event.listens_for(database_engine, "connect")
        def configure_sqlite(dbapi_connection, connection_record) -> None:
            del connection_record
            cursor = dbapi_connection.cursor()
            try:
                cursor.execute("PRAGMA foreign_keys=ON")
                cursor.execute("PRAGMA busy_timeout=30000")
                cursor.execute("PRAGMA journal_mode=WAL")
            finally:
                cursor.close()

    return database_engine


engine = create_database_engine(get_settings().database_url)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
