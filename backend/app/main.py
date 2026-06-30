import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import select

from app.api.routes import routers
from app.core.config import get_settings
from app.core.exceptions import BadRequestError, ForbiddenError, NotFoundError, UnauthorizedError
from app.core.security import hash_password
from app.db.base import Base
from app.db.session import SessionLocal, engine
from app.models.user import User

logger = logging.getLogger(__name__)


def _seed_admin():
    """Create the default admin account if it doesn't exist."""
    db = SessionLocal()
    try:
        admin = db.scalar(select(User).where(User.username == "admin"))
        if admin is None:
            settings = get_settings()
            admin_password = settings.admin_password
            if not admin_password:
                if not settings.is_development_like():
                    raise RuntimeError("ADMIN_PASSWORD must be configured outside development")
                admin_password = "admin101"
                logger.warning(
                    "⚠️  SECURITY WARNING: ADMIN_PASSWORD not set, using default 'admin101'. "
                    "Set ADMIN_PASSWORD environment variable for production use."
                )
            db.add(User(
                username="admin",
                nickname="管理员",
                password_hash=hash_password(admin_password),
                role="admin",
                is_active=True,
                password_version=1,
            ))
            db.commit()
    finally:
        db.close()


def _ensure_schema():
    """Ensure database tables exist. In dev mode only, add missing columns."""
    from sqlalchemy import inspect as sa_inspect, text
    settings = get_settings()

    try:
        Base.metadata.create_all(bind=engine)

        # Only add missing columns in development mode
        if not settings.is_development_like():
            return

        inspector = sa_inspect(engine)
        existing_tables = set(inspector.get_table_names())

        # Auto-add missing columns for all models
        for table_name, table in Base.metadata.tables.items():
            if table_name not in existing_tables:
                continue
            existing_cols = {c["name"] for c in inspector.get_columns(table_name)}
            with engine.connect() as conn:
                for column in table.columns:
                    if column.name not in existing_cols:
                        col_type = column.type.compile(engine.dialect)
                        nullable = "NULL" if column.nullable else "NOT NULL"
                        default = ""
                        if column.default is not None:
                            default_val = column.default.arg if hasattr(column.default, 'arg') else None
                            # Only use serializable defaults (skip lambdas and callables)
                            if default_val is not None and not callable(default_val):
                                escaped_val = str(default_val).replace("'", "''")
                                default = f" DEFAULT '{escaped_val}'"
                        # Quote column name to avoid SQL reserved word conflicts
                        quoted_name = f'"{column.name}"'
                        conn.execute(text(f'ALTER TABLE {table_name} ADD COLUMN {quoted_name} {col_type} {nullable}{default}'))
                conn.commit()

        # Special handling: set nickname = username for existing users
        if "users" in existing_tables:
            with engine.connect() as conn:
                conn.execute(text("UPDATE users SET nickname = username WHERE nickname = ''"))
                conn.commit()
    except Exception:
        logger.exception("Schema check failed")
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

    # CORS configuration
    allowed_origins = settings.cors_origins_list
    fastapi_app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    for router in routers:
        fastapi_app.include_router(router, prefix="/api")

    # Serve uploaded files with authentication
    from fastapi.responses import FileResponse
    import mimetypes

    uploads_dir = Path("uploads")
    uploads_dir.mkdir(exist_ok=True)

    @fastapi_app.get("/uploads/{file_path:path}")
    async def serve_upload(file_path: str, request: Request):
        from app.api.deps import get_current_user
        from app.db.session import get_db
        full_path = uploads_dir / file_path
        if not full_path.exists() or not full_path.is_file():
            return JSONResponse(status_code=404, content={"detail": "File not found"})
        # Prevent path traversal before applying the access policy.
        try:
            full_path.resolve().relative_to(uploads_dir.resolve())
        except ValueError:
            return JSONResponse(status_code=403, content={"detail": "Access denied"})

        # Avatars are public profile assets with unguessable generated names.
        if file_path.replace("\\", "/").startswith("avatars/"):
            mime_type = mimetypes.guess_type(str(full_path))[0] or "application/octet-stream"
            return FileResponse(str(full_path), media_type=mime_type)

        # Check for token in query param or Authorization header for private uploads.
        token = request.query_params.get("token")
        if not token:
            auth_header = request.headers.get("authorization", "")
            if auth_header.startswith("Bearer "):
                token = auth_header[7:]
        if not token:
            return JSONResponse(status_code=401, content={"detail": "Authentication required"})
        # Verify token
        from app.core.security import decode_access_token
        from jose.exceptions import JWTError as _JWTError
        try:
            decode_access_token(token)
        except _JWTError:
            return JSONResponse(status_code=401, content={"detail": "Invalid token"})
        mime_type = mimetypes.guess_type(str(full_path))[0] or "application/octet-stream"
        return FileResponse(str(full_path), media_type=mime_type)

    @fastapi_app.exception_handler(NotFoundError)
    async def not_found_handler(request: Request, exc: NotFoundError):
        return JSONResponse(status_code=404, content={"detail": exc.detail})

    @fastapi_app.exception_handler(BadRequestError)
    async def bad_request_handler(request: Request, exc: BadRequestError):
        return JSONResponse(status_code=400, content={"detail": exc.detail})

    @fastapi_app.exception_handler(ForbiddenError)
    async def forbidden_handler(request: Request, exc: ForbiddenError):
        return JSONResponse(status_code=403, content={"detail": exc.detail})

    @fastapi_app.exception_handler(UnauthorizedError)
    async def unauthorized_handler(request: Request, exc: UnauthorizedError):
        return JSONResponse(status_code=401, content={"detail": exc.detail})

    @fastapi_app.exception_handler(ValueError)
    async def value_error_handler(request: Request, exc: ValueError):
        if settings.is_development_like():
            return JSONResponse(status_code=400, content={"detail": str(exc)})
        return JSONResponse(status_code=400, content={"detail": "请求参数无效"})

    return fastapi_app


app = create_app()
