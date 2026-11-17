import logging
import re
import time
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_session
from app.errors import AppError, problem, register_error_handlers
from app.logs import request_id_var, setup_logging
from app.modules.audit import admin as audit_admin
from app.modules.auth import router as auth
from app.modules.bookings import admin as bookings_admin
from app.modules.bookings import public as bookings_public
from app.modules.catalog import admin as catalog_admin
from app.modules.catalog import public as catalog_public
from app.modules.customers import admin as customers_admin
from app.modules.media import public as media_public
from app.modules.pricing import admin as pricing_admin
from app.modules.site import admin as site_admin
from app.modules.site import public as site_public
from app.modules.staff import admin as staff_admin
from app.modules.staff import public as staff_public

logger = logging.getLogger("app.access")
_SAFE_REQUEST_ID = re.compile(r"^[A-Za-z0-9._-]{1,64}$")

health = APIRouter(tags=["health"])


@health.get("/health")
def liveness() -> dict[str, str]:
    return {"status": "ok"}


@health.get("/health/ready")
def readiness(session: Annotated[Session, Depends(get_session)]) -> dict[str, str]:
    try:
        session.execute(text("SELECT 1"))
    except SQLAlchemyError as exc:
        logger.warning("Database not ready: %s", type(exc).__name__)
        raise AppError(503, "DATABASE_UNAVAILABLE") from exc
    return {"status": "ok", "database": "ok"}


def create_app() -> FastAPI:
    settings = get_settings()
    setup_logging(settings.log_level)

    app = FastAPI(
        title="AutoPoint API",
        version="0.1.0",
        openapi_url="/api/v1/openapi.json" if settings.expose_docs else None,
        docs_url="/api/docs" if settings.expose_docs else None,
        redoc_url=None,
    )
    register_error_handlers(app)

    if settings.cors_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.cors_origins,
            allow_credentials=True,
            allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
            allow_headers=[
                "Authorization",
                "Content-Type",
                "Idempotency-Key",
                "X-Request-ID",
                "X-Requested-With",
            ],
        )

    @app.middleware("http")
    async def request_context(request: Request, call_next):
        incoming = request.headers.get("x-request-id", "")
        request_id = incoming if _SAFE_REQUEST_ID.match(incoming) else uuid.uuid4().hex
        token = request_id_var.set(request_id)
        started = time.perf_counter()
        try:
            try:
                response = await call_next(request)
            except Exception:
                # Handled here (not in an exception handler) so the request id is still set.
                logger.exception("Unhandled error")
                response = problem(500, "INTERNAL_ERROR")
            response.headers["X-Request-ID"] = request_id
            logger.info(
                "request",
                extra={
                    "method": request.method,
                    "path": request.url.path,  # never the query string
                    "status": response.status_code,
                    "duration_ms": round((time.perf_counter() - started) * 1000, 1),
                },
            )
            return response
        finally:
            request_id_var.reset(token)

    app.include_router(health)
    for router in (
        catalog_public.router,
        media_public.router,
        site_public.router,
        staff_public.router,
        bookings_public.router,
        auth.router,
        auth.users_router,
        bookings_admin.router,
        customers_admin.router,
        catalog_admin.router,
        pricing_admin.router,
        staff_admin.router,
        site_admin.router,
        audit_admin.router,
    ):
        app.include_router(router, prefix="/api/v1")
    return app


app = create_app()
