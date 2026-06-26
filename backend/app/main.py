from fastapi import FastAPI

from app.api.routes import routers
from app.core.config import get_settings


def create_app() -> FastAPI:
    settings = get_settings()
    settings.validate_for_runtime()
    fastapi_app = FastAPI(title=settings.app_name)
    for router in routers:
        fastapi_app.include_router(router, prefix="/api")
    return fastapi_app


app = create_app()
