from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import select

from app.api.routes import routers
from app.core.config import get_settings
from app.core.exceptions import BadRequestError, ForbiddenError, NotFoundError
from app.core.security import hash_password
from app.db.base import Base
from app.db.session import SessionLocal, engine
from app.models.user import User


def _seed_admin():
    """Create the default admin account if it doesn't exist."""
    db = SessionLocal()
    try:
        admin = db.scalar(select(User).where(User.username == "www"))
        if admin is None:
            db.add(User(
                username="www",
                password_hash=hash_password("ydmy5247"),
                role="admin",
                is_active=True,
            ))
            db.commit()
    finally:
        db.close()


def _ensure_schema():
    """检查表结构，必要时重建（开发用，生产应使用 Alembic）。"""
    from sqlalchemy import inspect as sa_inspect, text
    try:
        inspector = sa_inspect(engine)
        existing_tables = set(inspector.get_table_names())
        required_tables = {"users", "global_settings", "question_banks", "questions"}
        missing = required_tables - existing_tables

        need_rebuild = False
        if missing:
            need_rebuild = True
        elif "users" in existing_tables:
            cols = inspector.get_columns("users")
            email_col = next((c for c in cols if c["name"] == "email"), None)
            if email_col and not email_col.get("nullable", True):
                need_rebuild = True

        if need_rebuild:
            Base.metadata.drop_all(bind=engine)
        Base.metadata.create_all(bind=engine)
    except Exception:
        Base.metadata.create_all(bind=engine)


@asynccontextmanager
async def lifespan(app: FastAPI):
    _ensure_schema()
    _seed_admin()
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    settings.validate_for_runtime()
    fastapi_app = FastAPI(title=settings.app_name, lifespan=lifespan)
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
