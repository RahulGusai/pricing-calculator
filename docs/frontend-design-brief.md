# Frontend design brief

## Status and user outcome

The evolved **Option 1** direction is selected and approved for implementation.
Pricing Desk is a responsive financial workspace for a professional preparing
pricing documents with mixed line-level discounts and taxes. The primary outcome is
to enter a document quickly, understand exactly how `421.50` was derived, and
finalize it with confidence.

The frontend now runs against FastAPI for real local authentication,
server-authoritative calculations, persistence, and reports. The only printable output
is the authorized in-browser document preview; neither service generates or stores a
PDF. MSW remains an explicit in-memory test/visual mode, and deployment remains
unverified until the Railway services are provisioned.

## Selected visual direction

Option 1 evolved from a clean editorial concept into an operational financial desk:

- warm, paper-like base surfaces balanced by crisp data tables;
- deep ink neutrals and restrained accent color instead of a generic SaaS gradient;
- Source Sans 3 for controls, navigation, metadata, and tabular figures;
- Source Serif 4 for selected document-title accents, capped at a compact 30-34px on
  desktop so the editor remains operational rather than poster-like;
- generous page hierarchy with compact density inside line items and reports;
- visible system state through text, shape, and color, never color alone; and
- motion limited to orientation, save feedback, and state transitions.

The interface should feel trustworthy and composed, not ornamental. Decoration must
never compete with editable values, totals, validation, or status.

## Appearance modes

| Mode | Purpose | Required semantics |
| --- | --- | --- |
| Light | Default creation and editing | Bright, high-clarity controls and financial grid; all draft actions available |
| Dark | Low-glare full workspace | Equivalent functionality and hierarchy; independently checked contrast and status colors |

Light and Dark are the only appearance modes. Their icon-only controls occupy the
sidebar utility area formerly used by Settings and provide accessible names, tooltips,
and selected state. Finalized documents use the same detail view with editing disabled;
read-only behavior is a lifecycle rule, not a third appearance mode. The former
Reading-mode direction is superseded by [ADR 0007](decisions/0007-contained-two-mode-document-editor.md).

## Information architecture and primary flow

1. Sign in or create an account.
2. Review owned documents and their draft/finalized state.
3. Create or open a draft.
4. Enter customer/date metadata and dynamic line items.
5. See FastAPI-returned line and document totals.
6. Resolve field-specific validation errors and confirm finalization.
7. Review or print the document preview, or duplicate a finalized document into a new draft.
8. Review an inclusive date-range summary report.

The core screens are authentication, document list, draft editor, finalized detail
view, and report. The list favors search/filter/status scanning. The editor keeps
line inputs and their calculated consequences close together, with a stable totals
summary. Reports lead with four assignment metrics and retain the underlying
documents for verification.

## API contract boundary

FastAPI OpenAPI generates the checked-in browser contract. The React adapter uses an
HTTP-only cookie session and a module-memory CSRF token, and components do not import
fixture data or reimplement pricing formulas. The API owns calculated decimal-string
results, lifecycle transitions, and currency configuration. The preview derives from
the owned document response and is not a durable server artifact.

MSW mirrors that cookie/CSRF wire contract only for deterministic tests and explicit
local visual mode. It holds state in memory and has no bearer token or persistent
browser database.

The reference fixture remains:

| Metric | Expected |
| --- | ---: |
| Subtotal | 450.00 |
| Discount | 40.00 |
| Tax | 11.50 |
| Grand total | **421.50** |

## Interaction requirements

- Dynamic line rows support add, remove, and reorder without losing focus or data.
- Fixed and percentage discounts are mutually exclusive in both UI and contract.
- Each line exposes a direct, manually editable tax percentage; the UI does not require
  a preset or hide the rate behind document-level configuration.
- Quantity, price, discount, and tax fields allow natural partial decimal editing but
  prevent a third fractional digit from entering form state. FastAPI remains
  authoritative for bounds, normalization, rounding, and calculated totals.
- Validation is adjacent to the affected control and summarized on failed submit.
- Save state distinguishes unsaved, saving, saved, and failed; do not rely on toast
  messages alone.
- Finalization states the irreversible consequence and requires deliberate
  confirmation.
- Finalized views remove content-editing paths consistently. Permanent whole-document
  deletion remains available in the register and detail view behind explicit
  confirmation.
- The right calculation summary is contained by the editor grid and never covered by
  a full-width bottom action/status surface.
- Mobile line items become legible groups rather than a squeezed desktop table.
- Empty, loading, no-results, offline/error, forbidden/not-found, and conflict states
  provide a clear next action.

## Dependency responsibilities

- **React Router:** protected shell, route-level boundaries, and shareable list/report
  state; not an API cache.
- **TanStack Query:** FastAPI request lifecycle, caching, invalidation, and mutation
  state; not form state.
- **React Hook Form:** performant dynamic arrays and field interaction state.
- **Zod:** browser-boundary validation aligned with, but never replacing, Pydantic.
- **MSW:** explicit in-memory contract double with deterministic fixtures and failures.
- **Phosphor Icons:** consistent symbol language; labels remain on critical actions.
- **Source Sans 3 / Source Serif 4:** bundled interface and editorial faces with no third-party
  runtime font dependency.
- **Vitest + Testing Library + jest-dom + user-event + jsdom:** observable behavior,
  semantics, and user interaction rather than implementation-detail snapshots.

## Quality targets

- WCAG 2.2 AA semantics, contrast, focus visibility, and keyboard operation.
- Zero known serious or critical automated accessibility findings.
- Responsive behavior at 360, 768, 1024, and 1440 CSS pixels without page overflow.
- Core Web Vitals at the 75th percentile: LCP <= 2.5 s, INP <= 200 ms, CLS <= 0.1
  once a production deployment is measurable.
- Lighthouse goals of 95+ for accessibility, performance, and best practices, with
  measured results reported rather than assumed.
- No accidental data loss; destructive/finalizing actions communicate consequences.
- Tabular numerals, right-aligned money, and traceable subtotal/discount/tax totals.
- Automated coverage for the reference calculation, lifecycle states, protected
  routes, report filters, and keyboard-critical interactions.

## Evidence and boundaries

The workflow borrows proven patterns - explicit lifecycle state, scanable status,
structured document sections, direct line manipulation, visible save state, and
date-filtered reporting - without copying a vendor's visual identity. See
[frontend product patterns](research/frontend-product-patterns.md) for first-party
sources and the adoption/avoidance rationale.

Out of scope: Railway provisioning, generated PDFs/object storage, payment collection, tax
compliance, foreign-exchange conversion, and accounting-ledger features. A draft can
select one supported document currency, but the application never converts amounts
between currencies or combines mixed currencies into a single report total.
