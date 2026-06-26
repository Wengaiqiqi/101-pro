from app.core.config import get_settings


try:
    from celery import Celery
except ModuleNotFoundError:
    Celery = None


if Celery is not None:
    celery_app = Celery("question_bank_imports", broker=get_settings().redis_url, backend=get_settings().redis_url)
else:

    class _FallbackCeleryApp:
        def task(self, func=None, **kwargs):
            def decorator(task_func):
                return task_func

            if func is not None:
                return decorator(func)
            return decorator

    celery_app = _FallbackCeleryApp()
