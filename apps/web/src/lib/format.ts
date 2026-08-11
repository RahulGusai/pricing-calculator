import type { CurrencyCode } from "../types";

interface DecimalParts {
  negative: boolean;
  whole: string;
  fraction: string;
}

function parseMoney(value: string): DecimalParts | null {
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  return {
    negative: match[1] === "-",
    whole: match[2],
    fraction: (match[3] ?? "").padEnd(2, "0"),
  };
}

function groupDigits(value: string): string {
  return value.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function currencyAffixes(currency: CurrencyCode): { prefix: string; suffix: string } {
  const parts = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).formatToParts(0);
  const integerIndex = parts.findIndex((part) => part.type === "integer");
  const fractionIndex = parts.findIndex((part) => part.type === "fraction");
  return {
    prefix: parts.slice(0, integerIndex).map((part) => part.value).join(""),
    suffix: parts.slice(fractionIndex + 1).map((part) => part.value).join(""),
  };
}

/**
 * Format API decimal strings without converting a monetary value to a binary
 * JavaScript number. The API currently uses two minor-unit decimal places.
 */
export function formatMoney(value: string, currency: CurrencyCode = "USD"): string {
  const money = parseMoney(value);
  if (!money) return "—";
  const { prefix, suffix } = currencyAffixes(currency);
  return `${money.negative ? "−" : ""}${prefix}${groupDigits(money.whole)}.${money.fraction}${suffix}`;
}

export function formatCurrencySymbol(currency: CurrencyCode): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    currencyDisplay: "symbol",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).formatToParts(0).find((part) => part.type === "currency")?.value ?? currency;
}

export function formatDate(value: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

export function formatSignedMoney(value: string, currency: CurrencyCode = "USD"): string {
  const money = parseMoney(value);
  if (!money) return "—";
  if (money.negative || /^0+$/.test(money.whole) && /^0+$/.test(money.fraction)) {
    return formatMoney(value, currency);
  }
  return `−${formatMoney(value, currency)}`;
}
