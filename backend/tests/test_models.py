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


def test_expected_unique_constraints_are_registered() -> None:
    constraints_by_table = {
        table_name: {constraint.name for constraint in table.constraints}
        for table_name, table in Base.metadata.tables.items()
    }

    assert "uq_wrong_questions_user_question" in constraints_by_table["wrong_questions"]
    assert "uq_practice_answers_session_question" in constraints_by_table["practice_answers"]
    assert "uq_question_options_question_label" in constraints_by_table["question_options"]
    assert "uq_question_options_question_sort_order" in constraints_by_table["question_options"]
    assert "uq_import_job_chunks_job_index" in constraints_by_table["import_job_chunks"]


def test_representative_foreign_key_ondelete_rules_are_registered() -> None:
    questions_bank_fk = next(iter(Base.metadata.tables["questions"].c.bank_id.foreign_keys))
    draft_source_chunk_fk = next(iter(Base.metadata.tables["imported_question_drafts"].c.source_chunk_id.foreign_keys))
    wrong_question_fk = next(iter(Base.metadata.tables["wrong_questions"].c.question_id.foreign_keys))

    assert questions_bank_fk.ondelete == "CASCADE"
    assert draft_source_chunk_fk.ondelete == "SET NULL"
    assert wrong_question_fk.ondelete == "CASCADE"
