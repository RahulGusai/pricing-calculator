# Frontend design brief

## Status and user outcome

The evolved **Option 1** direction is selected and approved for implementation.
Pricing Desk is a responsive financial workspace for a professional preparing
pricing documents with mixed line-level discounts and taxes. The primary outcome is
to enter a document quickly, understand exactly how `421.50` was derived, and
finalize it with confidence.

This is currently a frontend-only, mock-first phase. Real authentication,
server-authoritative calculations, persistence, artifacts, and deployment arrive
with FastAPI and must not be implied by the UI.

## Selected visual direction

Option 1 evolved from a clean editorial concept into an operational financial desk:

- warm, paper-like base surfaces balanced by crisp data tables;
- deep ink neutrals and restrained accent color instead of a generic SaaS gradient;
- Manrope for controls, navigation, metadata, and tabular figures;
- Newsreader for selected document titles and review moments;
- generous page hierarchy with compact density inside line items and reports;
- visible system state through text, shape, and color, never color alone; and
- motion limited to orientation, save feedback, and state transitions.

The interface should feel trustworthy and composed, not ornamental. Decoration must
never compete with editable values, totals, validation, or status.

## Workspace modes

| Mode | Purpose | Required semantics |
| --- | --- | --- |
| Light | Default creation and editing | Bright, high-clarity controls and financial grid; all draft actions available |
| Dark | Low-glare full workspace | Equivalent functionality and hierarchy; independently checked contrast and status colors |
| Reading | Finalized-document review | Paper-like canvas, reduced application chrome, no editing affordances, optimized scanning/printing |

Reading mode is not a third color theme for the editor. A draft opened for editing
must return to an operational mode, while a finalized document may foreground
download, print, and duplicate actions.

## Information architecture and primary flow

1. Sign in or create an account.
2. Review owned documents and their draft/finalized state.
3. Create or open a draft.
4. Enter customer/date metadata and dynamic line items.
5. See mock-server-returned line and document totals.
6. Resolve field-specific validation errors and confirm finalization.
7. Review/download the immutable artifact or duplicate into a new draft.
8. Review an inclusive date-range summary report.

The core screens are authentication, document list, draft editor, finalized reading
view, and report. The list favors search/filter/status scanning. The editor keeps
line inputs and their calculated consequences close together, with a stable totals
summary. Reports lead with four assignment metrics and retain the underlying
documents for verification.

## Mock-first contract

Mock Service Worker serves realistic REST handlers. Browser storage may preserve a
demo session, while each automated test starts from deterministic fixtures. Fixtures
include the exact assignment sample, drafts/finalized documents, fixed/percent
discounts, multiple issue dates, rounding boundaries, and a second tenant that must
remain invisible.

The mock boundary owns simulated latency, authorization, validation, lifecycle
conflicts, and calculated decimal-string results. Components do not import fixture
data or reimplement pricing formulas. When FastAPI exists, a contract pass must
compare requests, responses, status codes, error shapes, and rounding before mock
handlers can be retired.

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
- Validation is adjacent to the affected control and summarized on failed submit.
- Save state distinguishes unsaved, saving, saved, and failed; do not rely on toast
  messages alone.
- Finalization states the irreversible consequence and requires deliberate
  confirmation.
- Finalized views remove or disable all mutation paths consistently.
- Mobile line items become legible groups rather than a squeezed desktop table.
- Empty, loading, no-results, offline/error, forbidden/not-found, and conflict states
  provide a clear next action.

## Dependency responsibilities

- **React Router:** protected shell, route-level boundaries, and shareable list/report
  state; not an API cache.
- **TanStack Query:** request lifecycle, caching, invalidation, and mutation state for
  both MSW and FastAPI; not form state.
- **React Hook Form:** performant dynamic arrays and field interaction state.
- **Zod:** browser-boundary validation aligned with, but never replacing, Pydantic.
- **MSW:** replaceable network boundary with deterministic fixtures and failures.
- **Phosphor Icons:** consistent symbol language; labels remain on critical actions.
- **Manrope / Newsreader:** bundled interface and editorial faces with no third-party
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

Out of scope for this phase: backend enforcement, production auth, live persistence,
real PDFs/S3 downloads, Railway provisioning, payment collection, tax compliance,
multi-currency conversion, and accounting-ledger features.
