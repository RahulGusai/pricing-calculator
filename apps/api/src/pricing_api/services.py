"""Application services for auth, documents, lifecycle, and reporting.

Routes translate HTTP only; this module owns ownership checks, transactional
state changes, normalization, and the handoff to the pure pricing module.
"""

from __future__ import annotations

from collections.abc import Iterable
from datetime import UTC, date, datetime, timedelta
from uuid import UUID, uuid4

from sqlalchemy import Select, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session as DbSession
from sqlalchemy.orm import selectinload

from pricing_api.config import Settings
from pricing_api.errors import ApiError
from pricing_api.models import Document, LineItem, Session, User, utc_now
from pricing_api.pricing import (
    CalculatedDocument,
    CalculatedLine,
    DiscountType,
    LineInput,
    LineTotals,
    PricingValidationError,
    calculate_document,
    calculate_line,
    format_money,
    format_quantity,
    format_rate,
)
from pricing_api.schemas import (
    AuthResponse,
    CurrencyConfigResponse,
    CurrencyResponse,
    CurrencyTotalResponse,
    DocumentCreateRequest,
    DocumentReplaceRequest,
    DocumentResponse,
    DocumentSummaryResponse,
    LineResponse,
    LineWriteRequest,
    MoneyTotalsResponse,
    ReportResponse,
    UserResponse,
)
from pricing_api.security import csrf_token, hash_password, hash_secret, new_secret, verify_password


def normalize_email(value: str) -> str:
    email = value.strip().lower()
    if not email or "@" not in email or email.startswith("@") or email.endswith("@"):
        raise ApiError(
            422,
            "VALIDATION_ERROR",
            "The request is invalid.",
            {"email": "Enter a valid email address."},
        )
    return email


def normalized_text(value: str | None, *, field: str, fallback: str = "") -> str:
    text = (value or fallback).strip()
    if len(text) > 0:
        return text
    if fallback:
        return fallback
    return ""


def initials_for_name(name: str) -> str:
    words = [word for word in name.split() if word]
    if not words:
        return "?"
    return "".join(word[0] for word in words[:2]).upper()


def user_response(user: User) -> UserResponse:
    return UserResponse(
        id=user.id,
        name=user.name,
        email=user.email,
        workspaceName=user.workspace_name,
        initials=initials_for_name(user.name),
    )


def _as_utc(value: datetime) -> datetime:
    """Normalize SQLite's timezone-naive reads for the UTC API contract."""

    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


def auth_response(user: User, raw_session_token: str, settings: Settings) -> AuthResponse:
    return AuthResponse(
        user=user_response(user),
        csrfToken=csrf_token(raw_session_token, settings.csrf_secret),
    )


def _totals_response(totals: LineTotals | Document) -> MoneyTotalsResponse:
    if isinstance(totals, Document):
        return MoneyTotalsResponse(
            subtotal=format_money(totals.subtotal_minor),
            discount=format_money(totals.discount_minor),
            tax=format_money(totals.tax_minor),
            grandTotal=format_money(totals.grand_total_minor),
        )
    return MoneyTotalsResponse(**totals.as_strings())


def _line_response(line: LineItem) -> LineResponse:
    if line.discount_type == DiscountType.PERCENTAGE.value:
        discount_value = format_rate(line.discount_value_scaled)
    else:
        discount_value = format_money(line.discount_value_scaled)
    return LineResponse(
        id=UUID(line.id),
        position=line.position,
        name=line.name,
        description=line.description,
        quantity=format_quantity(line.quantity_scaled),
        unitPrice=format_money(line.unit_price_minor),
        discountType=DiscountType(line.discount_type),
        discountValue=discount_value,
        taxRate=format_rate(line.tax_rate_scaled),
        subtotal=format_money(line.subtotal_minor),
        discount=format_money(line.discount_minor),
        tax=format_money(line.tax_minor),
        grandTotal=format_money(line.grand_total_minor),
    )


def document_response(document: Document) -> DocumentResponse:
    return DocumentResponse(
        id=UUID(document.id),
        number=document.number,
        title=document.title,
        customerName=document.customer_name,
        documentDate=document.document_date,
        validUntil=document.valid_until,
        currency=document.currency,
        status=document.status,  # type: ignore[arg-type]
        updatedAt=_as_utc(document.updated_at),
        finalizedAt=_as_utc(document.finalized_at) if document.finalized_at is not None else None,
        lines=[_line_response(line) for line in document.line_items],
        totals=_totals_response(document),
    )


def document_summary_response(document: Document) -> DocumentSummaryResponse:
    return DocumentSummaryResponse(
        id=UUID(document.id),
        number=document.number,
        title=document.title,
        customerName=document.customer_name,
        documentDate=document.document_date,
        status=document.status,  # type: ignore[arg-type]
        currency=document.currency,
        **_totals_response(document).model_dump(),
    )


def currency_config_response(settings: Settings) -> CurrencyConfigResponse:
    return CurrencyConfigResponse(
        defaultCurrency=settings.pricing_default_currency.upper(),
        currencies=[CurrencyResponse(code=currency) for currency in settings.supported_currencies],
    )


def _owned_document_query(document_id: str, owner_id: str) -> Select[tuple[Document]]:
    return (
        select(Document)
        .options(selectinload(Document.line_items))
        .execution_options(populate_existing=True)
        .where(Document.id == document_id, Document.owner_id == owner_id)
    )


def get_owned_document(db: DbSession, owner_id: str, document_id: str) -> Document:
    document = db.scalar(_owned_document_query(document_id, owner_id))
    if document is None:
        raise ApiError(404, "DOCUMENT_NOT_FOUND", "Document not found.")
    return document


def list_documents(db: DbSession, owner: User) -> list[DocumentSummaryResponse]:
    documents = list(
        db.scalars(
            select(Document)
            .where(Document.owner_id == owner.id)
            .order_by(Document.updated_at.desc())
        ).all()
    )
    return [document_summary_response(document) for document in documents]


def _assert_currency(settings: Settings, value: str) -> str:
    currency = value.strip().upper()
    if currency not in settings.supported_currencies:
        raise ApiError(
            422,
            "VALIDATION_ERROR",
            "The request is invalid.",
            {"currency": "Choose a supported document currency."},
        )
    return currency


def _calculate_lines(lines: Iterable[LineWriteRequest]) -> CalculatedDocument:
    calculated: list[CalculatedLine] = []
    for index, line in enumerate(lines):
        try:
            calculated.append(
                calculate_line(
                    LineInput(
                        quantity=line.quantity,
                        unit_price=line.unitPrice,
                        discount_type=line.discountType,
                        discount_value=line.discountValue,
                        tax_rate=line.taxRate,
                    )
                )
            )
        except PricingValidationError as error:
            raise ApiError(
                422,
                "VALIDATION_ERROR",
                "The request is invalid.",
                {f"lines.{index}.{error.field}": str(error)},
            ) from error

    totals = LineTotals(
        subtotal_minor=sum(line.totals.subtotal_minor for line in calculated),
        discount_minor=sum(line.totals.discount_minor for line in calculated),
        tax_minor=sum(line.totals.tax_minor for line in calculated),
        grand_total_minor=sum(line.totals.grand_total_minor for line in calculated),
    )
    return CalculatedDocument(lines=tuple(calculated), totals=totals)


def _line_input_from_model(line: LineItem) -> LineInput:
    discount_value = (
        format_rate(line.discount_value_scaled)
        if line.discount_type == DiscountType.PERCENTAGE.value
        else format_money(line.discount_value_scaled)
    )
    return LineInput(
        quantity=format_quantity(line.quantity_scaled),
        unit_price=format_money(line.unit_price_minor),
        discount_type=line.discount_type,
        discount_value=discount_value,
        tax_rate=format_rate(line.tax_rate_scaled),
    )


def _calculate_models(lines: Iterable[LineItem]) -> CalculatedDocument:
    return calculate_document(_line_input_from_model(line) for line in lines)


def _apply_totals(document: Document, totals: LineTotals) -> None:
    document.subtotal_minor = totals.subtotal_minor
    document.discount_minor = totals.discount_minor
    document.tax_minor = totals.tax_minor
    document.grand_total_minor = totals.grand_total_minor


def _apply_calculated_line(
    target: LineItem,
    request: LineWriteRequest,
    calculated: CalculatedLine,
    position: int,
) -> None:
    target.position = position
    target.name = request.name.strip()
    target.description = request.description.strip()
    target.quantity_scaled = calculated.quantity_scaled
    target.unit_price_minor = calculated.unit_price_minor
    target.discount_type = calculated.discount_type.value
    target.discount_value_scaled = calculated.discount_value_scaled
    target.tax_rate_scaled = calculated.tax_rate_scaled
    target.subtotal_minor = calculated.totals.subtotal_minor
    target.discount_minor = calculated.totals.discount_minor
    target.tax_minor = calculated.totals.tax_minor
    target.grand_total_minor = calculated.totals.grand_total_minor


def _replace_lines(
    db: DbSession,
    document: Document,
    requests: list[LineWriteRequest],
    calculated: CalculatedDocument,
) -> None:
    existing_by_id = {line.id: line for line in document.line_items}
    incoming_ids = [str(line.id) for line in requests if line.id is not None]
    if len(set(incoming_ids)) != len(incoming_ids):
        raise ApiError(
            422,
            "VALIDATION_ERROR",
            "The request is invalid.",
            {"lines": "A line item can appear only once."},
        )
    unknown_ids = sorted(set(incoming_ids) - set(existing_by_id))
    if unknown_ids:
        raise ApiError(
            422,
            "VALIDATION_ERROR",
            "The request is invalid.",
            {"lines": "A line item does not belong to this document."},
        )

    # Move existing positions out of the desired range before reordering so the
    # portable unique(document_id, position) constraint cannot collide midway.
    position_offset = len(existing_by_id) + len(requests) + 1
    for item in existing_by_id.values():
        item.position += position_offset
    db.flush()

    requested_existing_ids = set(incoming_ids)
    for line_id, line in list(existing_by_id.items()):
        if line_id not in requested_existing_ids:
            db.delete(line)

    retained: list[LineItem] = []
    for position, (request, calculated_line) in enumerate(
        zip(requests, calculated.lines, strict=True),
        start=1,
    ):
        target = existing_by_id.get(str(request.id)) if request.id else None
        if target is None:
            target = LineItem(document_id=document.id, position=position)
            db.add(target)
        _apply_calculated_line(target, request, calculated_line, position)
        retained.append(target)
    document.line_items = retained
    _apply_totals(document, calculated.totals)


def _validate_document_dates(document_date: date, valid_until: date) -> None:
    if valid_until < document_date:
        raise ApiError(
            422,
            "VALIDATION_ERROR",
            "The request is invalid.",
            {"validUntil": "Valid until cannot be before the document date."},
        )


def _new_document_number(document_date: date) -> str:
    return f"Q-{document_date.year}-{uuid4().hex[:8].upper()}"


def create_document(
    db: DbSession,
    owner: User,
    request: DocumentCreateRequest,
    settings: Settings,
) -> Document:
    document_date = request.documentDate or datetime.now(UTC).date()
    valid_until = request.validUntil or (document_date + timedelta(days=30))
    _validate_document_dates(document_date, valid_until)
    currency = _assert_currency(
        settings,
        request.currency or settings.pricing_default_currency,
    )
    lines = request.lines or []
    calculated = _calculate_lines(lines)
    document = Document(
        owner_id=owner.id,
        number=_new_document_number(document_date),
        title=normalized_text(request.title, field="title", fallback="Untitled pricing document"),
        customer_name=normalized_text(request.customerName, field="customerName"),
        document_date=document_date,
        valid_until=valid_until,
        currency=currency,
        status="draft",
    )
    db.add(document)
    db.flush()
    _replace_lines(db, document, lines, calculated)
    db.commit()
    return get_owned_document(db, owner.id, document.id)


def replace_document(
    db: DbSession,
    owner: User,
    document_id: str,
    request: DocumentReplaceRequest,
    settings: Settings,
) -> Document:
    document = get_owned_document(db, owner.id, document_id)
    if document.status == "finalized":
        raise ApiError(409, "DOCUMENT_FINALIZED", "Finalized documents are immutable.")
    _validate_document_dates(request.documentDate, request.validUntil)
    calculated = _calculate_lines(request.lines)
    document.title = request.title.strip()
    document.customer_name = request.customerName.strip()
    document.document_date = request.documentDate
    document.valid_until = request.validUntil
    document.currency = _assert_currency(settings, request.currency)
    document.updated_at = utc_now()
    _replace_lines(db, document, request.lines, calculated)
    try:
        db.commit()
    except IntegrityError as error:
        db.rollback()
        raise ApiError(409, "DOCUMENT_CONFLICT", "The document could not be saved.") from error
    return get_owned_document(db, owner.id, document_id)


def delete_document(
    db: DbSession,
    owner: User,
    document_id: str,
) -> None:
    document = get_owned_document(db, owner.id, document_id)
    db.delete(document)
    db.commit()


def duplicate_document(db: DbSession, owner: User, document_id: str) -> Document:
    source = get_owned_document(db, owner.id, document_id)
    if source.status != "finalized":
        raise ApiError(409, "DOCUMENT_NOT_FINALIZED", "Only finalized documents can be duplicated.")

    duplicate = Document(
        owner_id=owner.id,
        number=_new_document_number(source.document_date),
        title=f"{source.title} (copy)",
        customer_name=source.customer_name,
        document_date=source.document_date,
        valid_until=source.valid_until,
        currency=source.currency,
        status="draft",
    )
    db.add(duplicate)
    db.flush()
    for source_line in source.line_items:
        copied = LineItem(
            document_id=duplicate.id,
            position=source_line.position,
            name=source_line.name,
            description=source_line.description,
            quantity_scaled=source_line.quantity_scaled,
            unit_price_minor=source_line.unit_price_minor,
            discount_type=source_line.discount_type,
            discount_value_scaled=source_line.discount_value_scaled,
            tax_rate_scaled=source_line.tax_rate_scaled,
            subtotal_minor=source_line.subtotal_minor,
            discount_minor=source_line.discount_minor,
            tax_minor=source_line.tax_minor,
            grand_total_minor=source_line.grand_total_minor,
        )
        db.add(copied)
    duplicate.subtotal_minor = source.subtotal_minor
    duplicate.discount_minor = source.discount_minor
    duplicate.tax_minor = source.tax_minor
    duplicate.grand_total_minor = source.grand_total_minor
    db.commit()
    return get_owned_document(db, owner.id, duplicate.id)


def finalize_document(
    db: DbSession,
    owner: User,
    document_id: str,
) -> Document:
    document = db.scalar(_owned_document_query(document_id, owner.id).with_for_update())
    if document is None:
        raise ApiError(404, "DOCUMENT_NOT_FOUND", "Document not found.")
    if document.status == "finalized":
        return document
    if not document.title.strip() or not document.customer_name.strip():
        raise ApiError(
            422,
            "DOCUMENT_INCOMPLETE",
            "Title and customer are required before finalization.",
        )
    if not document.line_items:
        raise ApiError(
            422,
            "DOCUMENT_HAS_NO_LINES",
            "Add at least one line item before finalization.",
        )

    try:
        calculated = _calculate_models(document.line_items)
    except PricingValidationError as error:
        raise ApiError(
            422,
            "VALIDATION_ERROR",
            "The document contains invalid line values.",
            {error.field: str(error)},
        ) from error
    _apply_totals(document, calculated.totals)
    for target, calculated_line in zip(document.line_items, calculated.lines, strict=True):
        target.quantity_scaled = calculated_line.quantity_scaled
        target.unit_price_minor = calculated_line.unit_price_minor
        target.discount_type = calculated_line.discount_type.value
        target.discount_value_scaled = calculated_line.discount_value_scaled
        target.tax_rate_scaled = calculated_line.tax_rate_scaled
        target.subtotal_minor = calculated_line.totals.subtotal_minor
        target.discount_minor = calculated_line.totals.discount_minor
        target.tax_minor = calculated_line.totals.tax_minor
        target.grand_total_minor = calculated_line.totals.grand_total_minor
    now = utc_now()
    document.status = "finalized"
    document.finalized_at = now
    document.updated_at = now
    db.commit()
    return get_owned_document(db, owner.id, document_id)


def report_summary(
    db: DbSession,
    owner: User,
    *,
    start_date: date,
    end_date: date,
    status: str,
    customer: str,
) -> ReportResponse:
    if start_date > end_date:
        raise ApiError(
            422,
            "INVALID_DATE_RANGE",
            "Start date cannot be after end date.",
            {"endDate": "End date must not be before start date."},
        )
    query = select(Document).where(
        Document.owner_id == owner.id,
        Document.document_date >= start_date,
        Document.document_date <= end_date,
    )
    if status != "all":
        query = query.where(Document.status == status)
    customer_normalized = customer.strip().lower()
    if customer_normalized:
        query = query.where(func.lower(Document.customer_name).contains(customer_normalized))
    documents = list(
        db.scalars(query.order_by(Document.document_date.desc(), Document.updated_at.desc())).all()
    )

    grouped: dict[str, list[Document]] = {}
    for document in documents:
        grouped.setdefault(document.currency, []).append(document)
    currency_totals = [
        CurrencyTotalResponse(
            currency=currency,
            documentCount=len(group),
            subtotal=format_money(sum(item.subtotal_minor for item in group)),
            discount=format_money(sum(item.discount_minor for item in group)),
            tax=format_money(sum(item.tax_minor for item in group)),
            grandTotal=format_money(sum(item.grand_total_minor for item in group)),
        )
        for currency, group in sorted(grouped.items())
    ]
    return ReportResponse(
        startDate=start_date,
        endDate=end_date,
        status=status,  # type: ignore[arg-type]
        customer=customer,
        documentCount=len(documents),
        currencyTotals=currency_totals,
        documents=[document_summary_response(document) for document in documents],
    )


def signup(
    db: DbSession,
    *,
    email: str,
    password: str,
    name: str | None,
    workspace_name: str | None,
    settings: Settings,
) -> tuple[User, str]:
    normalized_email = normalize_email(email)
    existing = db.scalar(select(User).where(User.email == normalized_email))
    if existing is not None:
        raise ApiError(
            409,
            "EMAIL_ALREADY_REGISTERED",
            "An account with that email already exists.",
        )
    display_name = normalized_text(name, field="name") or normalized_email.split("@", 1)[0]
    workspace = normalized_text(workspace_name, field="workspaceName") or (
        f"{display_name}'s workspace"
    )
    user = User(
        email=normalized_email,
        name=display_name,
        workspace_name=workspace,
        password_hash=hash_password(password),
    )
    db.add(user)
    try:
        db.flush()
    except IntegrityError as error:
        db.rollback()
        raise ApiError(
            409,
            "EMAIL_ALREADY_REGISTERED",
            "An account with that email already exists.",
        ) from error
    raw_token = create_session(db, user, settings)
    db.commit()
    return user, raw_token


def create_session(db: DbSession, user: User, settings: Settings) -> str:
    raw_token = new_secret()
    now = utc_now()
    db.add(
        Session(
            user_id=user.id,
            token_hash=hash_secret(raw_token),
            expires_at=now + timedelta(hours=settings.session_ttl_hours),
            last_seen_at=now,
        )
    )
    return raw_token


def login(
    db: DbSession,
    *,
    email: str,
    password: str,
    settings: Settings,
) -> tuple[User, str]:
    user = db.scalar(select(User).where(User.email == normalize_email(email)))
    if user is None or not verify_password(user.password_hash, password):
        raise ApiError(401, "INVALID_CREDENTIALS", "Email or password is incorrect.")
    raw_token = create_session(db, user, settings)
    db.commit()
    return user, raw_token


def logout(db: DbSession, session: Session) -> None:
    """Revoke exactly the current opaque session credential."""

    session.revoked_at = utc_now()
    db.commit()
