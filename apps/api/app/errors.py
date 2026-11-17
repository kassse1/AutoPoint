"""One error shape for every response (RFC 9457 style, plus a machine-readable `code`)."""

from http import HTTPStatus
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException

from app.logs import request_id_var


class AppError(Exception):
    """Raise from business code; rendered as a problem response."""

    def __init__(
        self,
        status: int,
        code: str,
        detail: str | None = None,
        headers: dict[str, str] | None = None,
    ) -> None:
        self.status = status
        self.code = code
        self.detail = detail
        self.headers = headers


def problem(
    status: int,
    code: str,
    detail: str | None = None,
    errors: list[dict[str, Any]] | None = None,
    headers: dict[str, str] | None = None,
) -> JSONResponse:
    body = {
        "type": "about:blank",
        "title": HTTPStatus(status).phrase,
        "status": status,
        "code": code,
        "detail": detail,
        "request_id": request_id_var.get(),
        "errors": errors or [],
    }
    return JSONResponse(
        body, status_code=status, headers=headers, media_type="application/problem+json"
    )


def _code_for(status: int) -> str:
    return HTTPStatus(status).name  # e.g. NOT_FOUND, METHOD_NOT_ALLOWED


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def app_error(_: Request, exc: AppError) -> JSONResponse:
        return problem(exc.status, exc.code, exc.detail, headers=exc.headers)

    @app.exception_handler(HTTPException)
    async def http_error(_: Request, exc: HTTPException) -> JSONResponse:
        detail = exc.detail if isinstance(exc.detail, str) else None
        return problem(exc.status_code, _code_for(exc.status_code), detail, headers=exc.headers)

    @app.exception_handler(RequestValidationError)
    async def validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        errors = [
            {
                # loc[0] is "body"/"query"/"path"; the client cares about the field path.
                "field": ".".join(str(p) for p in err["loc"][1:]) or str(err["loc"][0]),
                "code": err["type"],
                "params": {k: str(v) for k, v in (err.get("ctx") or {}).items()},
            }
            for err in exc.errors()
        ]
        return problem(422, "VALIDATION_ERROR", "Request validation failed", errors)
