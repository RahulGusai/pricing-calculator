# ADR 0005: Readable typography and one currency per document

- Status: Accepted
- Date: 2026-08-10

## Context

The first Option 1 implementation used Manrope and Newsreader with operational text
frequently set between 9px and 13px. In the editor, metadata labels and values were
also separated by a two-column label/value grid, making customer identity and dates
harder to scan. The product now needs document-level currency selection without
introducing foreign-exchange behavior or invalid mixed-currency reporting.

## Decision

Use bundled Source Sans 3 for interface and financial data, and Source Serif 4 for
document identity and editorial review moments. Use a 15-16px operational baseline,
14px table and control text, and 12px only for short labels or secondary metadata.
Keep labels directly above their values in the document metadata grid.

Each draft chooses exactly one currency from USD, INR, and AED (the United Arab
Emirates dirham). The enabled subset is backend environment configuration; the
frontend retrieves it from the currency-config API rather than hard-coding a wider
list. All three use two decimal places: cents, paise, and fils respectively. The
currency applies to every line, discount, total, and printable preview for
that document. Changing a draft currency changes presentation and denomination; it
never performs conversion. Reports expose totals grouped by currency instead of
presenting one mathematically invalid mixed-currency total.

## Alternatives

Retaining the original faces and only increasing sizes preserved the current look but
did not materially improve long-form readability. Adding a monospaced financial face
created a third font download without enough scanning benefit. Automatic currency
conversion would require exchange-rate provenance, effective dates, and rounding
rules that are outside this assignment.

## Consequences

The UI gains a calmer, more legible hierarchy and a consistent metadata rhythm across
desktop and mobile. Two bundled variable fonts add no third-party runtime request.
The FastAPI contract validates enabled currency codes, persists currency on the
document, keeps finalized currency immutable, and returns currency-separated report
aggregates. Its pricing module stores money as integer minor units, quantity as a
positive whole integer, and rates as integers scaled by 100, rounding each line
component half up.

## Revisit triggers

Revisit the pairing after usability testing with dense documents or if the production
brand system supplies licensed typefaces. Revisit the currency set only alongside the
backend money-scale and reporting contract; do not add zero- or three-decimal currencies
without defining their authoritative rounding rules.
