from app.core.config import get_settings


try:
    from celery import Celery
except ModuleNotFoundError:
    Celery = None


if Celery is not None:
    settings = get_settings()
    broker_url = getattr(settings, "redis_url", "redis://localhost:6379/0")
    celery_app = Celery("question_bank_imports", broker=broker_url, backend=broker_url)
else:

    class _FallbackCeleryApp:
        def task(self, func=None, **kwargs):
            def decorator(task_func):
                return task_func

            if func is not None:
                return decorator(func)
            return decorator

    celery_app = _FallbackCeleryApp()
