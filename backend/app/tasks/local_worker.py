import logging
import time
from collections.abc import Callable

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.import_job import ImportJob
from app.services.import_service import process_import_job

logger = logging.getLogger(__name__)


def process_next_pending_job(
    session_factory=SessionLocal,
    processor: Callable[[Session, int], object] = process_import_job,
) -> bool:
    db = session_factory()
    try:
        import_job_id = db.scalar(
            select(ImportJob.id)
            .where(ImportJob.status == "pending")
            .order_by(ImportJob.id)
            .limit(1)
        )
        if import_job_id is None:
            return False
        processor(db, int(import_job_id))
        return True
    finally:
        db.close()


def run_worker(poll_interval_seconds: float = 1.0) -> None:
    logger.info("Local import worker started")
    while True:
        try:
            processed = process_next_pending_job()
        except Exception:
            logger.exception("Local import worker iteration failed")
            processed = False
        if not processed:
            time.sleep(poll_interval_seconds)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    run_worker()
