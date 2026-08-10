"""Pydantic request and response schemas for the public camelCase API."""

from __future__ import annotations

from datetime import date, datetime
from enum import StrEnum
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from pricing_api.pricing import DiscountType, parse_money, parse_quantity, parse_rate


class ApiModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class CurrencyCode(StrEnum):
    """The only currency codes this version of the API can be configured to enable."""

    USD = "USD"
    INR = "INR"
    AED = "AED"


class UserResponse(ApiModel):
    id: str
    name: str
    email: str
    workspaceName: str
    initials: str


class AuthResponse(ApiModel):
    user: UserResponse
    csrfToken: str


class SignupRequest(ApiModel):
    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=12, max_length=256)
    name: str | None = Field(default=None, max_length=120)
    workspaceName: str | None = Field(default=None, max_length=120)


class LoginRequest(ApiModel):
    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=1, max_length=256)


class CurrencyResponse(ApiModel):
    code: CurrencyCode
    minorUnit: int = 2


class CurrencyConfigResponse(ApiModel):
    defaultCurrency: CurrencyCode
    currencies: list[CurrencyResponse]
    moneyDecimalPlaces: int = 2
    quantityDecimalPlaces: int = 2
    rateDecimalPlaces: int = 2
    roundingMode: Literal["HALF_UP"] = "HALF_UP"


class MoneyTotalsResponse(ApiModel):
    subtotal: str
    discount: str
    tax: str
    grandTotal: str


class LineWriteRequest(ApiModel):
    """Client-controlled fields only; calculated totals are response-only."""

    id: UUID | None = None
    name: str = Field(min_length=1, max_length=250)
    description: str = Field(default="", max_length=4_000)
    quantity: str
    unitPrice: str
    discountType: DiscountType
    discountValue: str
    taxRate: str

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("name must not be blank.")
        return normalized

    @field_validator("quantity")
    @classmethod
    def validate_quantity(cls, value: str) -> str:
        parse_quantity(value, "quantity")
        return value

    @field_validator("unitPrice")
    @classmethod
    def validate_unit_price(cls, value: str) -> str:
        parse_money(value, "unitPrice")
        return value

    @field_validator("taxRate")
    @classmethod
    def validate_tax_rate(cls, value: str) -> str:
        parse_rate(value, "taxRate")
        return value

    @field_validator("discountValue")
    @classmethod
    def validate_discount_value_shape(cls, value: str) -> str:
        # The type-specific value is validated by the pricing service, where the
        # discriminator is available and field errors remain consistent.
        if not isinstance(value, str):
            raise ValueError("discountValue must be a decimal string.")
        return value


class LineResponse(LineWriteRequest, MoneyTotalsResponse):
    id: UUID
    position: int


class DocumentCreateRequest(ApiModel):
    title: str | None = Field(default=None, max_length=250)
    customerName: str | None = Field(default=None, max_length=250)
    documentDate: date | None = None
    validUntil: date | None = None
    currency: CurrencyCode | None = None
    lines: list[LineWriteRequest] | None = None


class DocumentReplaceRequest(ApiModel):
    title: str = Field(max_length=250)
    customerName: str = Field(max_length=250)
    documentDate: date
    validUntil: date
    currency: CurrencyCode
    lines: list[LineWriteRequest]


class DeleteDocumentRequest(ApiModel):
    """Forces the caller to make an irreversible delete explicit on the wire."""

    confirm: Literal[True]


class ArtifactResponse(ApiModel):
    state: Literal["ready"]
    filename: str
    contentType: Literal["application/pdf"]
    sizeBytes: int
    checksum: str
    createdAt: datetime


class DocumentResponse(ApiModel):
    id: UUID
    number: str
    title: str
    customerName: str
    documentDate: date
    validUntil: date
    currency: CurrencyCode
    status: Literal["draft", "finalized"]
    updatedAt: datetime
    finalizedAt: datetime | None
    lines: list[LineResponse]
    totals: MoneyTotalsResponse
    artifact: ArtifactResponse | None = None


class DocumentSummaryResponse(MoneyTotalsResponse):
    id: UUID
    number: str
    title: str
    customerName: str
    documentDate: date
    status: Literal["draft", "finalized"]
    currency: CurrencyCode


class ArtifactDownloadResponse(ApiModel):
    url: str
    expiresAt: datetime


class CurrencyTotalResponse(MoneyTotalsResponse):
    currency: CurrencyCode
    documentCount: int


class ReportResponse(ApiModel):
    startDate: date
    endDate: date
    status: Literal["all", "draft", "finalized"]
    customer: str
    documentCount: int
    currencyTotals: list[CurrencyTotalResponse]
    documents: list[DocumentSummaryResponse]
