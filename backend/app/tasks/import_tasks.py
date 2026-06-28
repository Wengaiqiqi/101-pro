from app.db.session import SessionLocal
from app.services.import_service import process_import_job
from app.tasks.celery_app import celery_app


@celery_app.task
def process_import_job_task(import_job_id: int) -> int:
    db = SessionLocal()
    try:
        process_import_job(db, import_job_id)
        return import_job_id
    finally:
        db.close()
