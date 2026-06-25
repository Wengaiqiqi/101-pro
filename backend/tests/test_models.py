from app.db.base import Base


def test_expected_tables_are_registered() -> None:
    expected = {
        "users",
        "user_model_settings",
        "question_banks",
        "questions",
        "question_options",
        "import_jobs",
        "import_job_chunks",
        "imported_question_drafts",
        "practice_sessions",
        "practice_answers",
        "wrong_questions",
    }

    assert expected.issubset(set(Base.metadata.tables.keys()))
