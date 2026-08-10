# AGENTS.md

These instructions apply to the entire repository. A more deeply nested
`AGENTS.md` may add stricter, directory-specific rules but must not weaken these
invariants.

## Mission and phase gates

Build a correct, reviewable pricing-document application while keeping business
rules centralized and deployment reproducible.

- The **Option 1 evolved frontend direction is approved**. Frontend implementation,
  mock behavior, tests, and accessibility work may proceed within that direction.
- The backend, real authentication, database, S3 integration, and Railway deployment
  remain unimplemented. Do not start or claim those phases without an in-scope task.
- Do not present mock calculations, local previews, or Sites-compatible artifacts as
  a deployed or server-authoritative production system.

## Directory ownership

- `apps/web`: React UI, mock API, accessibility, and browser/unit tests.
- `apps/api`: FastAPI routes, domain services, persistence, migrations, and storage.
- `docs`: architecture, design rationale, research, and ADRs.
- Root: cross-service policies, contributor workflow, CI, and deployment entrypoints.

Keep web and API deployable as isolated Railway services. Do not introduce a shared
runtime package merely to share cross-language types; generate the web contract from
FastAPI OpenAPI when the backend exists.

## Non-negotiable domain invariants

1. Never use binary floating point for authoritative money or rates.
2. Never trust client-submitted totals, status, ownership, or artifact keys.
3. Calculate discount before tax; tax applies to the discounted line amount.
4. Only one pure backend pricing module may implement authoritative formulas and
   rounding.
5. Sum already-rounded line components to obtain document totals.
6. Reject fixed discounts greater than their rounded line subtotal.
7. Scope every document, report, and artifact query by authenticated owner.
8. Return `404` for another user's resource; do not disclose its existence.
9. Finalized document content is immutable. Whole-document deletion is a separate,
   permanent owner-authorized lifecycle operation that requires deliberate confirmation.
10. PostgreSQL/SQLite stores canonical records; private S3 stores finalized artifacts.
11. Authorize ownership before issuing any short-lived artifact download.
12. Treat report date bounds as inclusive and keep its status policy documented.

The mock service must model these rules, but it is never proof that the future API
enforces them.

## Layer boundaries

- HTTP routes translate transport concerns only.
- Application services own lifecycle decisions and transaction boundaries.
- Repositories own persistence and tenant-scoped queries.
- The pricing module is pure, deterministic, and independent of HTTP/database code.
- Artifact storage sits behind an interface with test and S3 implementations.
- React components consume an API client; they do not call `fetch` ad hoc.
- Mock handlers implement the planned API contract, not component-specific shortcuts.
- Components never import fixture data or mutate mock storage directly.

## Frontend direction and semantics

- Preserve the approved Option 1 evolution: editorial warmth, disciplined financial
  density, clear hierarchy, and restrained decoration.
- Source Sans 3 is the interface/data face; Source Serif 4 is an intentional editorial
  accent, not a replacement for legible tabular UI. Operational body copy should
  normally be 15-16px, with 12px reserved for short labels and supporting metadata.
- **Light** is the default operational workspace for creation and editing.
- **Dark** is a full low-glare workspace, not an inverted marketing skin; preserve
  contrast, semantic status meaning, and data hierarchy.
- **Reading** is a paper-like, reduced-chrome review mode for any document. It must
  suppress editing affordances rather than merely recolor them; lifecycle status
  remains visible and independent from the chosen mode.
- Use Phosphor icons consistently. Consequential or ambiguous actions require labels;
  icon-only controls require accessible names and tooltips where helpful.
- Keep server state in TanStack Query and form state in React Hook Form.
- Do not add Redux/Zustand without a demonstrated cross-cutting state problem.
- Render API/mock-returned totals. Any local preview must be labeled non-authoritative.
- Treat currency as immutable within each finalized document. Drafts may choose one
  supported document currency; never imply cross-currency conversion or sum mixed
  currencies into a single report total.
- Cover loading, empty, error, conflict, saving, saved, draft, and finalized states.
- Test 360, 768, 1024, and 1440 CSS pixels without horizontal page overflow.
- Keep the mock boundary replaceable: switching to FastAPI must not rewrite pages.

## Backend standards

- Use typed Pydantic request/response models and SQLAlchemy 2 style.
- Return decimal values as strings and consistent machine-readable error envelopes.
- Create all schema changes with Alembic; never rewrite an applied migration.
- Production startup must fail when configured with SQLite or local artifact storage.
- Hash passwords with a memory-hard algorithm and keep secrets out of logs.
- Do not hold database locks during long external I/O without documenting the
  consistency tradeoff.

## Change workflow

1. Read the relevant README, architecture note, research note, and ADRs.
2. Inspect `git status` and preserve unrelated and user-owned changes.
3. State assumptions when the task leaves a material choice open.
4. Make the smallest coherent change; avoid opportunistic rewrites.
5. Add a failing regression test before fixing a bug when practical.
6. Update examples, generated types, environment templates, and docs with the
   implementation they describe.
7. Run checks appropriate to the touched surface and report exact results.

Never add a dependency without recording why it is needed. Never commit secrets,
real customer data, `.env` files, databases, uploads, coverage output, or temporary
design-tool files. Never overwrite or discard unrelated changes to make a task easier.

## Current web commands

Run from `apps/web` after `npm ci`:

- `npm run dev` - local Vite development server.
- `npm run test` - Vitest suite.
- `npm run typecheck` - TypeScript checking without emission.
- `npm run lint` - ESLint.
- `npm run build` - production frontend/Sites-compatible build preparation.
- `npm run test:sites` - hosting-worker contract test.

These are manifest-defined commands, not a claim that they passed in a given handoff.
Report each command actually run and its observed result. Add backend commands only
after they exist and have been verified.

## Tests required by change type

- Pricing: exact `421.50` sample, boundary/rounding cases, fixed/percent discounts,
  tax order, and algebraic invariants.
- Persistence: SQLite plus PostgreSQL parity for constraints and migrations.
- API: auth, ownership isolation, validation errors, lifecycle conflicts, reports,
  and artifact authorization/failure.
- UI: protected routes, dynamic rows, returned totals, finalized read-only behavior,
  mode semantics, keyboard/focus behavior, and error/empty/loading states.
- End-to-end: sign up, reproduce `421.50`, finalize, reject editing, download the
  artifact, and see the document in the date report.

## Migrations and deployment safety

- Do not run production migrations or mutate Railway/AWS state without explicit user
  authorization.
- Keep migrations backward compatible with overlapping deploys.
- Never deploy SQLite to Railway production.
- Bind services to Railway's assigned port and expose explicit health checks.
- Keep S3 credentials API-only; every `VITE_*` variable is public.

## Definition of done

- Scope and approved UX acceptance criteria are satisfied.
- Formatting, lint, type checks, relevant tests, and production builds pass.
- Accessibility has no known serious/critical automated violations and keyboard,
  focus, responsive, and mode states are manually inspected.
- Relevant migrations upgrade cleanly on every supported database path.
- No secrets, local state, generated junk, or unrelated diffs are present.
- README, environment examples, ADRs, and API contract match actual behavior.
- Handoff lists changed files, commands run, results, assumptions, and remaining risk.
