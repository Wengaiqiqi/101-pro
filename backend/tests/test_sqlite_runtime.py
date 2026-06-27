from pathlib import Path

import pytest
from sqlalchemy import inspect, text

from app.core.config import get_settings
from app.db.session import create_database_engine


def _sqlite_url(path: Path) -> str:
    return f"sqlite:///{path.as_posix()}"


def test_sqlite_engine_enables_concurrency_pragmas(tmp_path: Path) -> None:
    engine = create_database_engine(_sqlite_url(tmp_path / "runtime.db"))
    try:
        with engine.connect() as connection:
            foreign_keys = connection.execute(text("PRAGMA foreign_keys")).scalar_one()
            journal_mode = connection.execute(text("PRAGMA journal_mode")).scalar_one()
            busy_timeout = connection.execute(text("PRAGMA busy_timeout")).scalar_one()

        assert foreign_keys == 1
        assert str(journal_mode).lower() == "wal"
        assert int(busy_timeout) >= 30_000
    finally:
        engine.dispose()


def test_initial_migration_uses_cross_dialect_defaults() -> None:
    migration_path = Path(__file__).parents[1] / "migrations" / "versions" / "20260626_0001_initial_schema.py"
    migration_source = migration_path.read_text(encoding="utf-8")

    assert 'sa.text("now()")' not in migration_source
    assert "::json" not in migration_source


def test_initial_migration_upgrades_new_sqlite_database(tmp_path: Path, monkeypatch) -> None:
    command = pytest.importorskip("alembic.command")
    config_module = pytest.importorskip("alembic.config")
    database_path = tmp_path / "migrated.db"
    monkeypatch.setenv("DATABASE_URL", _sqlite_url(database_path))
    get_settings.cache_clear()
    try:
        config = config_module.Config("alembic.ini")
        command.upgrade(config, "head")
        engine = create_database_engine(_sqlite_url(database_path))
        try:
            tables = set(inspect(engine).get_table_names())
        finally:
            engine.dispose()
    finally:
        get_settings.cache_clear()

    assert {"alembic_version", "users", "question_banks", "import_jobs"} <= tables
