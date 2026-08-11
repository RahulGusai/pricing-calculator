# ADR 0007: Contained two-mode document editor

- Status: Accepted
- Date: 2026-08-11
- Supersedes: the Reading-mode portions of ADR 0004 and ADR 0006

## Context

The first document editor made appearance modes prominent, let a large editorial title
dominate the work area, and allowed bottom surfaces to cross into the calculation
summary. Decimal validation could report a third fractional digit only after the user
entered it, line input focus borders could be visually clipped, and tax selection did
not make direct rate entry obvious. These choices slowed the primary task: entering and
checking a pricing document accurately.

## Decision

Keep the approved Option 1 warmth and financial discipline, but use a compact,
contained editor:

- Source Sans 3 remains the operational and data face. Source Serif 4 is a restrained
  document-identity accent, with desktop editor titles limited to 30-34px.
- Light and Dark are the only appearance modes. Their icon-only controls live in the
  sidebar utility area formerly occupied by Settings and expose accessible names,
  tooltips, and selected state.
- Finalized documents use the normal detail view with all content editing disabled.
  Read-only behavior follows lifecycle state, not an appearance mode; confirmed
  whole-document deletion remains available in both the register and detail view.
- Each line exposes a direct tax-percentage input. Quantity, price, discount, and tax
  controls preserve natural partial edits such as `12.` but do not admit a third
  fractional digit into form state. FastAPI remains authoritative for accepted bounds,
  decimal normalization, pricing, and returned totals.
- The calculation summary stays within the editor grid. Bottom actions or status
  surfaces must not span across or obscure the summary column, and focused line fields
  must render a complete, unclipped boundary.

## Alternatives

Keeping Reading as a third mode duplicated finalized-state semantics and consumed a
prominent control location without improving calculation entry. Reporting precision
errors only after blur or save preserved invalid form state and made a contractual
limit feel like a server failure. A full-width sticky action bar kept actions visible
but collided with the persistent calculation summary at common desktop heights.

## Consequences

The editor has one clear lifecycle model, a quieter header, and a more predictable
working area. Light/Dark controls require tooltips and non-color selected state because
they are intentionally icon-only. Input filtering improves immediate feedback but does
not replace schema validation or server authority. Responsive tests must prove that the
summary remains contained and that line-item focus rings are visible at 360, 768, 1024,
and 1440 CSS pixels.

## Revisit triggers

Revisit the layout if observed documents regularly exceed the usable table density, if
keyboard or assistive-technology testing finds the icon-only theme control ambiguous,
or if configured currencies introduce a scale other than two fractional digits. Any
new review presentation must remain separate from document lifecycle and must not
reintroduce editing paths for finalized content.
