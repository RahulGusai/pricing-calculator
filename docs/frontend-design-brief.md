# Frontend design brief

## Product and user outcome

Pricing Desk is a responsive web workspace for a professional preparing quotes or
pricing documents with mixed line-level discounts and taxes. The primary outcome is
to enter a document quickly, understand exactly how `421.50` was derived, and finalize
it with confidence.

## Primary flow

1. Sign in or create an account.
2. Review owned documents and their draft/finalized state.
3. Create or open a draft.
4. Enter customer/date metadata and dynamic line items.
5. See server-returned line and document totals.
6. Resolve specific validation errors and finalize.
7. View/download the immutable artifact or duplicate into a new draft.
8. Review an inclusive date-range summary report.

## Mock-first contract

Mock Service Worker will serve realistic REST handlers. Browser storage may preserve
the demo session, while each test starts from deterministic fixtures. Fixtures include
the exact assignment sample, drafts/finalized documents, fixed/percent discounts,
multiple dates, rounding boundaries, and a second tenant that must remain invisible.

The mock boundary owns simulated latency, authorization, validation, lifecycle
conflicts, and server-calculated results. Components must not import fixture data or
reimplement pricing formulas directly.

## Quality targets

- WCAG 2.2 AA semantics, contrast, focus visibility, and keyboard operation.
- Responsive behavior from 360 through 1440 CSS pixels.
- Clear loading, empty, error, conflict, saving, saved, and read-only states.
- No accidental data loss; destructive/finalizing actions communicate consequences.
- Tabular numerals and strong alignment for scannable money values.
- Lighthouse targets of 95+ for accessibility, performance, best practices, and SEO
  on the production frontend, subject to final measured evidence.
- No generic dashboard card wall; hierarchy comes first from typography and spacing.

## Design approval gate

Three visual directions are being reviewed. A selected direction becomes the visual
target for design-system tokens and implementation. Do not create frontend source or
package manifests before explicit approval.
