import type { LineItem, MoneyTotals } from "../types";

const MONEY_DECIMALS = 2;
const QUANTITY_DECIMALS = 4;
const RATE_DECIMALS = 2;
const QUANTITY_SCALE = 10_000n;
const RATE_SCALE = 10_000n;

export class PricingValidationError extends Error {
  readonly field: string;

  constructor(field: string, message: string) {
    super(message);
    this.name = "PricingValidationError";
    this.field = field;
  }
}

function parseUnsignedFixed(
  value: string,
  decimals: number,
  field: string,
): bigint {
  if (typeof value !== "string" || !/^\d+(?:\.\d+)?$/.test(value)) {
    throw new PricingValidationError(
      field,
      `${field} must be a non-negative decimal string.`,
    );
  }

  const [whole, fraction = ""] = value.split(".");
  if (fraction.length > decimals) {
    throw new PricingValidationError(
      field,
      `${field} supports at most ${decimals} decimal places.`,
    );
  }
  if (whole.length > 15) {
    throw new PricingValidationError(field, `${field} is too large.`);
  }

  const paddedFraction = fraction.padEnd(decimals, "0");
  return BigInt(`${whole}${paddedFraction}`);
}

function formatFixed(value: bigint, decimals: number): string {
  const scale = 10n ** BigInt(decimals);
  const whole = value / scale;
  const fraction = (value % scale).toString().padStart(decimals, "0");
  return `${whole}.${fraction}`;
}

function roundHalfUp(numerator: bigint, denominator: bigint): bigint {
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  return quotient + (remainder * 2n >= denominator ? 1n : 0n);
}

export function moneyToMinor(value: string, field = "amount"): bigint {
  return parseUnsignedFixed(value, MONEY_DECIMALS, field);
}

export function minorToMoney(value: bigint): string {
  return formatFixed(value, MONEY_DECIMALS);
}

function parseQuantity(value: string): bigint {
  const quantity = parseUnsignedFixed(value, QUANTITY_DECIMALS, "quantity");
  if (quantity < QUANTITY_SCALE) {
    throw new PricingValidationError(
      "quantity",
      "Quantity must be at least 1.",
    );
  }
  return quantity;
}

function parseRate(value: string, field: string): bigint {
  const rate = parseUnsignedFixed(value, RATE_DECIMALS, field);
  if (rate > RATE_SCALE) {
    throw new PricingValidationError(field, `${field} cannot exceed 100%.`);
  }
  return rate;
}

function normalizeQuantity(value: bigint): string {
  const formatted = formatFixed(value, QUANTITY_DECIMALS);
  return formatted.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

function normalizeRate(value: bigint): string {
  return formatFixed(value, RATE_DECIMALS);
}

export interface CalculatedDocument {
  lines: LineItem[];
  totals: MoneyTotals;
}

export function calculateLine(line: LineItem): LineItem {
  const quantity = parseQuantity(line.quantity);
  const unitPrice = moneyToMinor(line.unitPrice, "unitPrice");
  const subtotal = roundHalfUp(quantity * unitPrice, QUANTITY_SCALE);

  let discount = 0n;
  let normalizedDiscountValue = "0.00";

  if (line.discountType === "fixed") {
    discount = moneyToMinor(line.discountValue, "discountValue");
    normalizedDiscountValue = minorToMoney(discount);
    if (discount > subtotal) {
      throw new PricingValidationError(
        "discountValue",
        "Fixed discount cannot exceed the rounded line subtotal.",
      );
    }
  } else if (line.discountType === "percentage") {
    const discountRate = parseRate(line.discountValue, "discountValue");
    discount = roundHalfUp(subtotal * discountRate, RATE_SCALE);
    normalizedDiscountValue = normalizeRate(discountRate);
  } else if (line.discountType !== "none") {
    throw new PricingValidationError(
      "discountType",
      "Discount type must be none, fixed, or percentage.",
    );
  }

  const afterDiscount = subtotal - discount;
  const taxRate = parseRate(line.taxRate, "taxRate");
  const tax = roundHalfUp(afterDiscount * taxRate, RATE_SCALE);
  const lineTotal = afterDiscount + tax;

  return {
    ...line,
    quantity: normalizeQuantity(quantity),
    unitPrice: minorToMoney(unitPrice),
    discountValue: normalizedDiscountValue,
    taxRate: normalizeRate(taxRate),
    subtotal: minorToMoney(subtotal),
    discount: minorToMoney(discount),
    tax: minorToMoney(tax),
    grandTotal: minorToMoney(lineTotal),
  };
}

export function calculateDocument(lines: LineItem[]): CalculatedDocument {
  const calculatedLines = lines.map(calculateLine);
  let subtotal = 0n;
  let discount = 0n;
  let tax = 0n;
  let grandTotal = 0n;

  for (const line of calculatedLines) {
    subtotal += moneyToMinor(line.subtotal);
    discount += moneyToMinor(line.discount);
    tax += moneyToMinor(line.tax);
    grandTotal += moneyToMinor(line.grandTotal);
  }

  return {
    lines: calculatedLines,
    totals: {
      subtotal: minorToMoney(subtotal),
      discount: minorToMoney(discount),
      tax: minorToMoney(tax),
      grandTotal: minorToMoney(grandTotal),
    },
  };
}

export function sumTotals(totals: MoneyTotals[]): MoneyTotals {
  return totals.reduce<MoneyTotals>(
    (sum, current) => ({
      subtotal: minorToMoney(
        moneyToMinor(sum.subtotal) + moneyToMinor(current.subtotal),
      ),
      discount: minorToMoney(
        moneyToMinor(sum.discount) + moneyToMinor(current.discount),
      ),
      tax: minorToMoney(moneyToMinor(sum.tax) + moneyToMinor(current.tax)),
      grandTotal: minorToMoney(
        moneyToMinor(sum.grandTotal) + moneyToMinor(current.grandTotal),
      ),
    }),
    {
      subtotal: "0.00",
      discount: "0.00",
      tax: "0.00",
      grandTotal: "0.00",
    },
  );
}
