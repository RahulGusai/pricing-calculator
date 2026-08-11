"""Regression tests for the pure fixed-point pricing domain."""

from __future__ import annotations

import unittest

from pricing_api.pricing import (
    CalculatedDocument,
    LineInput,
    PricingValidationError,
    calculate_document,
    calculate_line,
    format_money,
    parse_money,
    parse_quantity,
    parse_rate,
    round_half_up,
)


def line(**overrides: str) -> LineInput:
    """Return a valid, zero-money line that tests can override selectively."""

    values: dict[str, str] = {
        "quantity": "1",
        "unit_price": "0.00",
        "discount_type": "none",
        "discount_value": "0.00",
        "tax_rate": "0.00",
    }
    values.update(overrides)
    return LineInput(**values)


class FixedPointParsingTests(unittest.TestCase):
    def test_parses_money_and_rates_as_scaled_integers_but_quantity_as_whole_units(self) -> None:
        self.assertEqual(parse_money("19.99"), 1_999)
        self.assertEqual(parse_money("19.9"), 1_990)
        self.assertEqual(parse_quantity("3"), 3)
        self.assertEqual(parse_rate("12.50"), 1_250)
        self.assertEqual(format_money(1_999), "19.99")

    def test_rejects_non_strings_negative_values_and_excess_precision(self) -> None:
        invalid_values = (
            (parse_money, "-0.01"),
            (parse_money, "10.001"),
            (parse_money, "1e2"),
            (parse_quantity, "0"),
            (parse_quantity, "1.0"),
            (parse_quantity, "-1"),
            (parse_rate, "100.01"),
            (parse_rate, "5.001"),
        )

        for parser, value in invalid_values:
            with self.subTest(parser=parser.__name__, value=value):
                with self.assertRaises(PricingValidationError):
                    parser(value)

        with self.assertRaises(PricingValidationError):
            parse_money(19.99)  # type: ignore[arg-type]


class PricingCalculationTests(unittest.TestCase):
    def test_matches_the_required_421_50_reference_document(self) -> None:
        result = calculate_document(
            (
                line(
                    quantity="2",
                    unit_price="100.00",
                    discount_type="percentage",
                    discount_value="10.00",
                    tax_rate="5.00",
                ),
                line(unit_price="50.00", tax_rate="5.00"),
                line(
                    unit_price="200.00",
                    discount_type="fixed",
                    discount_value="20.00",
                ),
            )
        )

        self.assertIsInstance(result, CalculatedDocument)
        self.assertEqual(
            [calculated.totals.as_strings() for calculated in result.lines],
            [
                {
                    "subtotal": "200.00",
                    "discount": "20.00",
                    "tax": "9.00",
                    "grandTotal": "189.00",
                },
                {
                    "subtotal": "50.00",
                    "discount": "0.00",
                    "tax": "2.50",
                    "grandTotal": "52.50",
                },
                {
                    "subtotal": "200.00",
                    "discount": "20.00",
                    "tax": "0.00",
                    "grandTotal": "180.00",
                },
            ],
        )
        self.assertEqual(
            result.totals.as_strings(),
            {
                "subtotal": "450.00",
                "discount": "40.00",
                "tax": "11.50",
                "grandTotal": "421.50",
            },
        )

    def test_usd_example_uses_line_subtotal_for_discount_then_tax(self) -> None:
        result = calculate_line(
            line(
                quantity="3",
                unit_price="19.99",
                discount_type="percentage",
                discount_value="12.50",
                tax_rate="8.25",
            )
        )

        self.assertEqual(result.totals.subtotal_minor, 5_997)
        self.assertEqual(result.totals.discount_minor, 750)
        self.assertEqual(result.totals.tax_minor, 433)
        self.assertEqual(result.totals.grand_total_minor, 5_680)
        self.assertEqual(
            result.totals.as_strings(),
            {
                "subtotal": "59.97",
                "discount": "7.50",
                "tax": "4.33",
                "grandTotal": "56.80",
            },
        )

    def test_rounds_subtotal_discount_and_tax_half_up(self) -> None:
        # 10 cents x 5% = 0.5 cents, which rounds up to 1 cent.
        tax = calculate_line(line(unit_price="0.10", tax_rate="5.00"))
        self.assertEqual(tax.tax, "0.01")

        # 1 cent x 50% = 0.5 cents, which rounds up to 1 cent.
        discount = calculate_line(
            line(
                unit_price="0.01",
                discount_type="percentage",
                discount_value="50.00",
            )
        )
        self.assertEqual(discount.discount, "0.01")
        self.assertEqual(round_half_up(5, 10), 1)

    def test_document_sums_already_rounded_line_components(self) -> None:
        result = calculate_document(
            (
                line(unit_price="0.10", tax_rate="5.00"),
                line(unit_price="0.10", tax_rate="5.00"),
            )
        )

        self.assertEqual([calculated.tax for calculated in result.lines], ["0.01", "0.01"])
        self.assertEqual(result.totals.tax, "0.02")
        self.assertEqual(result.totals.grand_total, "0.22")

    def test_tax_applies_after_discount(self) -> None:
        result = calculate_line(
            line(
                unit_price="100.00",
                discount_type="percentage",
                discount_value="25.00",
                tax_rate="10.00",
            )
        )

        self.assertEqual(result.discount, "25.00")
        self.assertEqual(result.tax, "7.50")
        self.assertEqual(result.grand_total, "82.50")

    def test_rejects_fixed_discount_larger_than_the_rounded_subtotal(self) -> None:
        accepted = calculate_line(
            line(
                quantity="1",
                unit_price="0.10",
                discount_type="fixed",
                discount_value="0.10",
            )
        )
        self.assertEqual(accepted.subtotal, "0.10")
        self.assertEqual(accepted.discount, "0.10")

        with self.assertRaises(PricingValidationError) as context:
            calculate_line(
                line(
                    quantity="1",
                    unit_price="0.10",
                    discount_type="fixed",
                    discount_value="0.11",
                )
            )

        self.assertEqual(context.exception.field, "discountValue")

    def test_rejects_invalid_discount_type_and_out_of_range_rate(self) -> None:
        with self.assertRaises(PricingValidationError) as discount_type:
            calculate_line(line(discount_type="coupon"))
        self.assertEqual(discount_type.exception.field, "discountType")

        with self.assertRaises(PricingValidationError) as tax_rate:
            calculate_line(line(tax_rate="100.01"))
        self.assertEqual(tax_rate.exception.field, "taxRate")

    def test_none_discount_requires_a_zero_decimal_value(self) -> None:
        for discount_value in ("1.00", "not-a-decimal"):
            with self.subTest(discount_value=discount_value):
                with self.assertRaises(PricingValidationError) as context:
                    calculate_line(line(discount_value=discount_value))
                self.assertEqual(context.exception.field, "discountValue")

    def test_line_total_algebra_holds_for_each_calculated_line(self) -> None:
        inputs = (
            line(
                quantity="2",
                unit_price="11.11",
                discount_type="percentage",
                discount_value="12.50",
                tax_rate="8.25",
            ),
            line(
                quantity="1",
                unit_price="0.10",
                discount_type="fixed",
                discount_value="0.01",
                tax_rate="5.00",
            ),
            line(quantity="1", unit_price="25.55", tax_rate="18.00"),
        )

        for input_line in inputs:
            with self.subTest(line=input_line):
                totals = calculate_line(input_line).totals
                self.assertEqual(
                    totals.grand_total_minor,
                    totals.subtotal_minor - totals.discount_minor + totals.tax_minor,
                )


if __name__ == "__main__":
    unittest.main()
