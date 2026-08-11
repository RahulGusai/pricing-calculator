import { describe, expect, it } from "vitest";

import type { LineItem } from "../types";
import {
  calculateDocument,
  calculateLine,
  PricingValidationError,
} from "./pricing";

function line(overrides: Partial<LineItem> = {}): LineItem {
  return {
    id: "line-test-001",
    position: 1,
    name: "Test line",
    description: "A deterministic test line",
    quantity: "1",
    unitPrice: "0.00",
    discountType: "none",
    discountValue: "0.00",
    taxRate: "0.00",
    subtotal: "0.00",
    discount: "0.00",
    tax: "0.00",
    grandTotal: "0.00",
    ...overrides,
  };
}

describe("fixed-point pricing", () => {
  it("matches the assignment sample exactly", () => {
    const result = calculateDocument([
      line({
        id: "widget-a",
        quantity: "2",
        unitPrice: "100.00",
        discountType: "percentage",
        discountValue: "10.00",
        taxRate: "5.00",
      }),
      line({
        id: "widget-b",
        position: 2,
        unitPrice: "50.00",
        taxRate: "5.00",
      }),
      line({
        id: "service-fee",
        position: 3,
        unitPrice: "200.00",
        discountType: "fixed",
        discountValue: "20.00",
      }),
    ]);

    expect(result.lines.map(({ subtotal, discount, tax, grandTotal }) => ({
      subtotal,
      discount,
      tax,
      grandTotal,
    }))).toEqual([
      {
        subtotal: "200.00",
        discount: "20.00",
        tax: "9.00",
        grandTotal: "189.00",
      },
      {
        subtotal: "50.00",
        discount: "0.00",
        tax: "2.50",
        grandTotal: "52.50",
      },
      {
        subtotal: "200.00",
        discount: "20.00",
        tax: "0.00",
        grandTotal: "180.00",
      },
    ]);
    expect(result.totals).toEqual({
      subtotal: "450.00",
      discount: "40.00",
      tax: "11.50",
      grandTotal: "421.50",
    });
  });

  it("rounds half up per line before summing", () => {
    const result = calculateDocument([
      line({ id: "line-a", unitPrice: "0.10", taxRate: "5.00" }),
      line({
        id: "line-b",
        position: 2,
        unitPrice: "0.10",
        taxRate: "5.00",
      }),
    ]);

    expect(result.lines.map((item) => item.tax)).toEqual(["0.01", "0.01"]);
    expect(result.totals.tax).toBe("0.02");
    expect(result.totals.grandTotal).toBe("0.22");
  });

  it("applies tax to the discounted amount", () => {
    const result = calculateLine(
      line({
        unitPrice: "100.00",
        discountType: "percentage",
        discountValue: "25.00",
        taxRate: "10.00",
      }),
    );

    expect(result.discount).toBe("25.00");
    expect(result.tax).toBe("7.50");
    expect(result.grandTotal).toBe("82.50");
  });

  it("rejects a fixed discount above the rounded subtotal", () => {
    expect(() =>
      calculateLine(
        line({
          unitPrice: "10.00",
          discountType: "fixed",
          discountValue: "10.01",
        }),
      ),
    ).toThrowError(PricingValidationError);
  });

  it.each([
    ["fractional quantity", { quantity: "1.5" }],
    ["zero quantity", { quantity: "0" }],
    ["money precision", { unitPrice: "1.001" }],
    ["rate precision", { taxRate: "5.001" }],
    ["negative money", { unitPrice: "-1.00" }],
    ["rate above 100", { taxRate: "100.01" }],
  ])("rejects invalid %s input", (_label, overrides) => {
    expect(() => calculateLine(line(overrides))).toThrowError(
      PricingValidationError,
    );
  });
});
