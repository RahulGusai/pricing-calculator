"""Pure, integer-only pricing calculations.

All public input values are fixed-point decimal strings.  The pricing module
converts them to integers immediately and never uses binary floating point.
Money and percentage points each use a scale of 100. Quantities are whole units:

* ``"19.99"`` money becomes ``1999`` minor units.
* ``"3"`` quantity becomes ``3`` quantity units.
* ``"12.50"`` percent becomes ``1250`` rate units.

Percentage calculations divide by ``100 * RATE_SCALE`` because the stored rate
is expressed in percentage points rather than a fraction.  For example,
``12.50%`` is represented by ``1250 / 10_000``.
"""

from __future__ import annotations

import re
from collections.abc import Iterable
from dataclasses import dataclass
from enum import StrEnum

MONEY_DECIMAL_PLACES = 2
RATE_DECIMAL_PLACES = 2

MONEY_SCALE = 100
RATE_SCALE = 100
PERCENT_DENOMINATOR = 100 * RATE_SCALE

_UNSIGNED_DECIMAL = re.compile(r"^\d+(?:\.\d+)?$")
_WHOLE_NUMBER = re.compile(r"^\d+$")


class PricingValidationError(ValueError):
    """Raised when a pricing value violates a domain constraint.

    ``field`` is deliberately transport-neutral so HTTP validation can map it
    into the API's machine-readable error envelope without importing FastAPI or
    Pydantic into this module.
    """

    def __init__(self, field: str, message: str) -> None:
        super().__init__(message)
        self.field = field


class DiscountType(StrEnum):
    """The supported discount representations for an individual line."""

    NONE = "none"
    FIXED = "fixed"
    PERCENTAGE = "percentage"


@dataclass(frozen=True, slots=True)
class LineInput:
    """Untrusted line values before the domain converts them to integers."""

    quantity: str
    unit_price: str
    discount_type: DiscountType | str
    discount_value: str
    tax_rate: str


@dataclass(frozen=True, slots=True)
class LineTotals:
    """Calculated money values, stored internally in currency minor units."""

    subtotal_minor: int
    discount_minor: int
    tax_minor: int
    grand_total_minor: int

    @property
    def subtotal(self) -> str:
        return format_money(self.subtotal_minor)

    @property
    def discount(self) -> str:
        return format_money(self.discount_minor)

    @property
    def tax(self) -> str:
        return format_money(self.tax_minor)

    @property
    def grand_total(self) -> str:
        return format_money(self.grand_total_minor)

    def as_strings(self) -> dict[str, str]:
        """Return the public, fixed-two-decimal representation of the totals."""

        return {
            "subtotal": self.subtotal,
            "discount": self.discount,
            "tax": self.tax,
            "grandTotal": self.grand_total,
        }


@dataclass(frozen=True, slots=True)
class CalculatedLine:
    """A normalized line together with its calculated money components."""

    quantity: int
    unit_price_minor: int
    discount_type: DiscountType
    discount_value_scaled: int
    tax_rate_scaled: int
    totals: LineTotals

    @property
    def unit_price(self) -> str:
        return format_money(self.unit_price_minor)

    @property
    def discount_value(self) -> str:
        if self.discount_type is DiscountType.PERCENTAGE:
            return format_rate(self.discount_value_scaled)
        return format_money(self.discount_value_scaled)

    @property
    def tax_rate(self) -> str:
        return format_rate(self.tax_rate_scaled)

    @property
    def subtotal(self) -> str:
        return self.totals.subtotal

    @property
    def discount(self) -> str:
        return self.totals.discount

    @property
    def tax(self) -> str:
        return self.totals.tax

    @property
    def grand_total(self) -> str:
        return self.totals.grand_total


@dataclass(frozen=True, slots=True)
class CalculatedDocument:
    """Calculated line results and document totals summed from rounded lines."""

    lines: tuple[CalculatedLine, ...]
    totals: LineTotals


def _parse_unsigned_fixed(
    value: str,
    *,
    decimal_places: int,
    field: str,
) -> int:
    """Parse a non-negative fixed-point decimal string without using floats."""

    if not isinstance(value, str) or not _UNSIGNED_DECIMAL.fullmatch(value):
        raise PricingValidationError(
            field,
            f"{field} must be a non-negative decimal string.",
        )

    whole, separator, fraction = value.partition(".")
    if separator and len(fraction) > decimal_places:
        raise PricingValidationError(
            field,
            f"{field} supports at most {decimal_places} decimal places.",
        )

    padded_fraction = fraction.ljust(decimal_places, "0")
    return int(whole) * (10**decimal_places) + int(padded_fraction or "0")


def _format_fixed(value: int, *, decimal_places: int) -> str:
    """Format an integer fixed-point value with an exact number of decimals."""

    if not isinstance(value, int) or isinstance(value, bool):
        raise TypeError("Fixed-point values must be integers.")

    scale = 10**decimal_places
    sign = "-" if value < 0 else ""
    whole, fraction = divmod(abs(value), scale)
    return f"{sign}{whole}.{fraction:0{decimal_places}d}"


def parse_money(value: str, field: str = "amount") -> int:
    """Convert a two-decimal money string to a whole minor-unit integer."""

    return _parse_unsigned_fixed(
        value,
        decimal_places=MONEY_DECIMAL_PLACES,
        field=field,
    )


def parse_quantity(value: str, field: str = "quantity") -> int:
    """Convert a whole-number quantity string to its stored integer value."""

    if not isinstance(value, str) or not _WHOLE_NUMBER.fullmatch(value):
        raise PricingValidationError(field, "Quantity must be a whole number.")
    quantity = int(value)
    if quantity < 1:
        raise PricingValidationError(field, "Quantity must be at least 1.")
    return quantity


def parse_rate(value: str, field: str = "rate") -> int:
    """Convert a two-decimal percentage-point string to a scaled integer."""

    rate = _parse_unsigned_fixed(
        value,
        decimal_places=RATE_DECIMAL_PLACES,
        field=field,
    )
    if rate > 100 * RATE_SCALE:
        raise PricingValidationError(field, f"{field} cannot exceed 100%.")
    return rate


def format_money(value_minor: int) -> str:
    """Format a money minor-unit integer for the API's decimal-string boundary."""

    return _format_fixed(value_minor, decimal_places=MONEY_DECIMAL_PLACES)


def format_quantity(value: int) -> str:
    """Format a stored whole quantity for the API's string boundary."""

    if not isinstance(value, int) or isinstance(value, bool) or value < 1:
        raise ValueError("Quantity must be a positive whole integer.")
    return str(value)


def format_rate(value_scaled: int) -> str:
    """Format a percentage-point integer with exactly two decimal places."""

    return _format_fixed(value_scaled, decimal_places=RATE_DECIMAL_PLACES)


def round_half_up(numerator: int, denominator: int) -> int:
    """Round a non-negative fraction to the nearest integer, ties away from zero."""

    if denominator <= 0:
        raise ValueError("The denominator must be positive.")
    if numerator < 0:
        raise ValueError("round_half_up only accepts non-negative numerators.")
    return (numerator + denominator // 2) // denominator


def _parse_discount_type(value: DiscountType | str) -> DiscountType:
    try:
        return DiscountType(value)
    except ValueError as error:
        raise PricingValidationError(
            "discountType",
            "Discount type must be none, fixed, or percentage.",
        ) from error


def calculate_line(line: LineInput) -> CalculatedLine:
    """Calculate one line with discount-before-tax and per-component rounding.

    Inputs are validated and normalized at the boundary.  Every intermediary
    amount held by this function is a whole integer: a minor currency unit,
    quantity unit, or rate unit.
    """

    quantity = parse_quantity(line.quantity)
    unit_price_minor = parse_money(line.unit_price, "unitPrice")
    discount_type = _parse_discount_type(line.discount_type)
    tax_rate_scaled = parse_rate(line.tax_rate, "taxRate")

    subtotal_minor = quantity * unit_price_minor

    discount_value_scaled = 0
    discount_minor = 0
    if discount_type is DiscountType.FIXED:
        discount_value_scaled = parse_money(line.discount_value, "discountValue")
        if discount_value_scaled > subtotal_minor:
            raise PricingValidationError(
                "discountValue",
                "Fixed discount cannot exceed the rounded line subtotal.",
            )
        discount_minor = discount_value_scaled
    elif discount_type is DiscountType.PERCENTAGE:
        discount_value_scaled = parse_rate(line.discount_value, "discountValue")
        discount_minor = round_half_up(
            subtotal_minor * discount_value_scaled,
            PERCENT_DENOMINATOR,
        )
    else:
        discount_value_scaled = parse_money(line.discount_value, "discountValue")
        if discount_value_scaled != 0:
            raise PricingValidationError(
                "discountValue",
                "Discount value must be 0.00 when discount type is none.",
            )

    after_discount_minor = subtotal_minor - discount_minor
    tax_minor = round_half_up(
        after_discount_minor * tax_rate_scaled,
        PERCENT_DENOMINATOR,
    )
    grand_total_minor = after_discount_minor + tax_minor

    return CalculatedLine(
        quantity=quantity,
        unit_price_minor=unit_price_minor,
        discount_type=discount_type,
        discount_value_scaled=discount_value_scaled,
        tax_rate_scaled=tax_rate_scaled,
        totals=LineTotals(
            subtotal_minor=subtotal_minor,
            discount_minor=discount_minor,
            tax_minor=tax_minor,
            grand_total_minor=grand_total_minor,
        ),
    )


def calculate_document(lines: Iterable[LineInput]) -> CalculatedDocument:
    """Calculate a document by summing line components after each line rounds."""

    calculated_lines = tuple(calculate_line(line) for line in lines)
    totals = LineTotals(
        subtotal_minor=sum(line.totals.subtotal_minor for line in calculated_lines),
        discount_minor=sum(line.totals.discount_minor for line in calculated_lines),
        tax_minor=sum(line.totals.tax_minor for line in calculated_lines),
        grand_total_minor=sum(
            line.totals.grand_total_minor for line in calculated_lines
        ),
    )
    return CalculatedDocument(lines=calculated_lines, totals=totals)
