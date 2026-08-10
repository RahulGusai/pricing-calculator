"""FastAPI application entry point and HTTP-only route definitions."""

from __future__ import annotations

import logging
from datetime import date
from typing import Annotated, Literal
from uuid import UUID

from fastapi import FastAPI, Query, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import Engine, text

from pricing_api import services
from pricing_api.artifacts import build_artifact_storage
from pricing_api.config import Settings, get_settings
from pricing_api.database import create_database_engine, create_session_factory
from pricing_api.dependencies import AuthDep, CsrfAuthDep, DatabaseDep, SettingsDep
from pricing_api.errors import (
    ApiError,
    api_error_handler,
    error_body,
    request_validation_error_handler,
)
from pricing_api.schemas import (
    ArtifactDownloadResponse,
    ArtifactResponse,
    AuthResponse,
    CurrencyConfigResponse,
    DeleteDocumentRequest,
    DocumentCreateRequest,
    DocumentReplaceRequest,
    DocumentResponse,
    DocumentSummaryResponse,
    LoginRequest,
    ReportResponse,
    SignupRequest,
)

logger = logging.getLogger(__name__)


def _set_session_cookie(response: Response, raw_token: str, settings: Settings) -> None:
    response.set_cookie(
        key=settings.session_cookie_name,
        value=raw_token,
        max_age=settings.session_ttl_hours * 60 * 60,
        httponly=True,
        secure=settings.session_cookie_secure,
        samesite="lax",
        path="/api",
    )


def _clear_session_cookie(response: Response, settings: Settings) -> None:
    response.delete_cookie(
        key=settings.session_cookie_name,
        httponly=True,
        secure=settings.session_cookie_secure,
        samesite="lax",
        path="/api",
    )


def create_app(
    settings: Settings | None = None,
    engine: Engine | None = None,
) -> FastAPI:
    """Build an app instance; tests can inject isolated settings/engine instances."""

    configured_settings = settings or get_settings()
    configured_engine = engine or create_database_engine(configured_settings.database_url)
    app = FastAPI(
        title="Pricing Calculator API",
        version="0.1.0",
        description="Server-authoritative pricing, lifecycle, and reporting API.",
    )
    app.state.settings = configured_settings
    app.state.engine = configured_engine
    app.state.session_factory = create_session_factory(configured_engine)
    app.state.artifact_storage = build_artifact_storage(configured_settings)

    if configured_settings.cors_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=list(configured_settings.cors_origins),
            allow_credentials=True,
            allow_methods=["GET", "POST", "PATCH", "DELETE"],
            allow_headers=["Content-Type", "X-CSRF-Token"],
        )

    app.add_exception_handler(ApiError, api_error_handler)
    app.add_exception_handler(RequestValidationError, request_validation_error_handler)

    @app.exception_handler(Exception)
    async def unexpected_error_handler(_: Request, error: Exception) -> JSONResponse:
        logger.exception("Unhandled API exception", exc_info=error)
        return JSONResponse(
            status_code=500,
            content=error_body("INTERNAL_ERROR", "The server encountered an unexpected error."),
        )

    @app.get("/health", tags=["health"])
    def health() -> dict[str, str]:
        try:
            with app.state.engine.connect() as connection:
                connection.execute(text("SELECT 1"))
        except Exception as error:
            raise ApiError(503, "SERVICE_UNAVAILABLE", "Database is not ready.") from error
        return {"status": "ok"}

    @app.get(
        "/api/v1/config/currencies",
        response_model=CurrencyConfigResponse,
        tags=["configuration"],
    )
    def get_currency_config(settings: SettingsDep) -> CurrencyConfigResponse:
        return services.currency_config_response(settings)

    @app.post(
        "/api/v1/auth/signup",
        response_model=AuthResponse,
        status_code=201,
        tags=["authentication"],
    )
    def signup(
        payload: SignupRequest,
        response: Response,
        db: DatabaseDep,
        settings: SettingsDep,
    ) -> AuthResponse:
        user, raw_token = services.signup(
            db,
            email=payload.email,
            password=payload.password,
            name=payload.name,
            workspace_name=payload.workspaceName,
            settings=settings,
        )
        _set_session_cookie(response, raw_token, settings)
        return services.auth_response(user, raw_token, settings)

    @app.post(
        "/api/v1/auth/login",
        response_model=AuthResponse,
        tags=["authentication"],
    )
    def login(
        payload: LoginRequest,
        response: Response,
        db: DatabaseDep,
        settings: SettingsDep,
    ) -> AuthResponse:
        user, raw_token = services.login(
            db,
            email=payload.email,
            password=payload.password,
            settings=settings,
        )
        _set_session_cookie(response, raw_token, settings)
        return services.auth_response(user, raw_token, settings)

    @app.get(
        "/api/v1/auth/session",
        response_model=AuthResponse,
        tags=["authentication"],
    )
    def get_session(auth: AuthDep, settings: SettingsDep) -> AuthResponse:
        return services.auth_response(auth.user, auth.raw_token, settings)

    @app.post(
        "/api/v1/auth/logout",
        status_code=204,
        response_class=Response,
        tags=["authentication"],
    )
    def logout(
        response: Response,
        auth: CsrfAuthDep,
        db: DatabaseDep,
        settings: SettingsDep,
    ) -> Response:
        services.logout(db, auth.session)
        _clear_session_cookie(response, settings)
        response.status_code = 204
        return response

    @app.get(
        "/api/v1/documents",
        response_model=list[DocumentSummaryResponse],
        tags=["documents"],
    )
    def list_documents(auth: AuthDep, db: DatabaseDep) -> list[DocumentSummaryResponse]:
        return services.list_documents(db, auth.user)

    @app.post(
        "/api/v1/documents",
        response_model=DocumentResponse,
        status_code=201,
        tags=["documents"],
    )
    def create_document(
        payload: DocumentCreateRequest,
        auth: CsrfAuthDep,
        db: DatabaseDep,
        settings: SettingsDep,
    ) -> DocumentResponse:
        return services.document_response(
            services.create_document(db, auth.user, payload, settings)
        )

    @app.get(
        "/api/v1/documents/{document_id}",
        response_model=DocumentResponse,
        tags=["documents"],
    )
    def get_document(document_id: UUID, auth: AuthDep, db: DatabaseDep) -> DocumentResponse:
        document = services.get_owned_document(db, auth.user.id, str(document_id))
        return services.document_response(document)

    @app.patch(
        "/api/v1/documents/{document_id}",
        response_model=DocumentResponse,
        tags=["documents"],
    )
    def patch_document(
        document_id: UUID,
        payload: DocumentReplaceRequest,
        auth: CsrfAuthDep,
        db: DatabaseDep,
        settings: SettingsDep,
    ) -> DocumentResponse:
        return services.document_response(
            services.replace_document(db, auth.user, str(document_id), payload, settings)
        )

    @app.delete(
        "/api/v1/documents/{document_id}",
        status_code=204,
        response_class=Response,
        tags=["documents"],
    )
    def delete_document(
        document_id: UUID,
        payload: DeleteDocumentRequest,
        auth: CsrfAuthDep,
        db: DatabaseDep,
    ) -> Response:
        del payload  # Its Literal[True] schema provides the deliberate confirmation.
        services.delete_document(
            db,
            auth.user,
            str(document_id),
            app.state.artifact_storage,
        )
        return Response(status_code=204)

    @app.post(
        "/api/v1/documents/{document_id}/finalize",
        response_model=DocumentResponse,
        tags=["documents"],
    )
    def finalize_document(
        document_id: UUID,
        auth: CsrfAuthDep,
        db: DatabaseDep,
    ) -> DocumentResponse:
        return services.document_response(
            services.finalize_document(
                db,
                auth.user,
                str(document_id),
                app.state.artifact_storage,
            )
        )

    @app.post(
        "/api/v1/documents/{document_id}/duplicate",
        response_model=DocumentResponse,
        status_code=201,
        tags=["documents"],
    )
    def duplicate_document(
        document_id: UUID,
        auth: CsrfAuthDep,
        db: DatabaseDep,
    ) -> DocumentResponse:
        return services.document_response(
            services.duplicate_document(db, auth.user, str(document_id))
        )

    @app.get(
        "/api/v1/documents/{document_id}/artifact",
        response_model=ArtifactResponse,
        tags=["artifacts"],
    )
    def get_artifact(document_id: UUID, auth: AuthDep, db: DatabaseDep) -> ArtifactResponse:
        return services.artifact_metadata(db, auth.user, str(document_id))

    @app.get(
        "/api/v1/documents/{document_id}/artifact/download",
        response_model=ArtifactDownloadResponse,
        tags=["artifacts"],
    )
    def download_artifact(
        document_id: UUID,
        auth: AuthDep,
        db: DatabaseDep,
        settings: SettingsDep,
    ) -> ArtifactDownloadResponse:
        return services.artifact_download(
            db,
            auth.user,
            str(document_id),
            app.state.artifact_storage,
            settings,
        )

    @app.get("/api/v1/artifacts/local/{object_key:path}", tags=["artifacts"])
    def get_local_artifact_content(object_key: str, auth: AuthDep, db: DatabaseDep) -> Response:
        content = services.local_artifact_content(
            db,
            auth.user,
            object_key,
            app.state.artifact_storage,
        )
        filename = object_key.rsplit("/", maxsplit=1)[-1]
        return Response(
            content=content,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    @app.get(
        "/api/v1/reports/summary",
        response_model=ReportResponse,
        tags=["reports"],
    )
    def get_report(
        auth: AuthDep,
        db: DatabaseDep,
        start_date: Annotated[date, Query(alias="startDate")],
        end_date: Annotated[date, Query(alias="endDate")],
        status: Annotated[Literal["all", "draft", "finalized"], Query()] = "all",
        customer: Annotated[str, Query(max_length=250)] = "",
    ) -> ReportResponse:
        return services.report_summary(
            db,
            auth.user,
            start_date=start_date,
            end_date=end_date,
            status=status,
            customer=customer,
        )

    return app


app = create_app()
