from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.routes import routers
from app.core.config import get_settings
from app.core.exceptions import BadRequestError, ForbiddenError, NotFoundError


def create_app() -> FastAPI:
    settings = get_settings()
    settings.validate_for_runtime()
    fastapi_app = FastAPI(title=settings.app_name)
    fastapi_app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    for router in routers:
        fastapi_app.include_router(router, prefix="/api")

    @fastapi_app.exception_handler(NotFoundError)
    async def not_found_handler(request: Request, exc: NotFoundError):
        return JSONResponse(status_code=404, content={"detail": exc.detail})

    @fastapi_app.exception_handler(BadRequestError)
    async def bad_request_handler(request: Request, exc: BadRequestError):
        return JSONResponse(status_code=400, content={"detail": exc.detail})

    @fastapi_app.exception_handler(ForbiddenError)
    async def forbidden_handler(request: Request, exc: ForbiddenError):
        return JSONResponse(status_code=403, content={"detail": exc.detail})

    return fastapi_app


app = create_app()
