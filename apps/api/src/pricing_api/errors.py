"""Stable HTTP error envelope used by every API route."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from fastapi import Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse


class ApiError(Exception):
    """A transport-safe exception with a stable machine-readable code."""

    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        fields: Mapping[str, str] | None = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.fields = dict(fields) if fields else None


def error_body(
    code: str,
    message: str,
    fields: Mapping[str, str] | None = None,
) -> dict[str, Any]:
    error: dict[str, Any] = {"code": code, "message": message}
    if fields:
        error["fields"] = dict(fields)
    return {"error": error}


async def api_error_handler(_: Request, error: ApiError) -> JSONResponse:
    return JSONResponse(
        status_code=error.status_code,
        content=error_body(error.code, error.message, error.fields),
    )


async def request_validation_error_handler(
    _: Request,
    error: RequestValidationError,
) -> JSONResponse:
    if any(item.get("type") == "json_invalid" for item in error.errors()):
        return JSONResponse(
            status_code=400,
            content=error_body("INVALID_JSON", "The request body must contain valid JSON."),
        )
    fields: dict[str, str] = {}
    for item in error.errors():
        location = item.get("loc", ())
        key = ".".join(str(part) for part in location if part not in {"body", "query", "path"})
        fields[key or "request"] = item.get("msg", "Invalid value.")
    return JSONResponse(
        status_code=422,
        content=error_body("VALIDATION_ERROR", "The request is invalid.", fields),
    )
