# AGENTS.md

These instructions apply to the entire repository. A more deeply nested
`AGENTS.md` may add stricter, directory-specific rules but must not weaken these
invariants.

## Mission and current gate

Build a correct, reviewable pricing-document application while keeping business
rules centralized and deployment reproducible.

The repository is currently at the **design approval checkpoint**. Do not create
frontend source, manifests, generated clients, or a runnable prototype until the
user explicitly selects and approves a visual direction. Documentation and design
artifacts may be refined without crossing that gate.

## Directory ownership

- `apps/web`: React UI, mocked API, accessibility, browser tests.
- `apps/api`: FastAPI routes, domain services, persistence, migrations, storage.
- `docs`: architecture, design rationale, and ADRs.
- Root: cross-service policies, contributor workflow, CI, and deployment entrypoints.

Keep frontend and backend deployable as isolated Railway services. Do not introduce
a shared runtime package merely to share cross-language types; generate the web API
contract from FastAPI OpenAPI when the backend exists.

## Non-negotiable domain invariants

1. Never use binary floating point for authoritative money or rates.
2. Never trust client-submitted totals, status, ownership, or artifact keys.
3. Calculate discount before tax; tax applies to the discounted line amount.
4. Only one pure backend pricing module may implement the formulas and rounding.
5. Sum already-rounded line components to obtain document totals.
6. Reject fixed discounts greater than their rounded line subtotal.
7. Scope every document, report, and artifact query by authenticated owner.
8. Return `404` for another user's resource; do not disclose its existence.
9. Finalized documents are immutable across metadata, lines, ordering, and deletion.
10. PostgreSQL/SQLite stores canonical records; private S3 stores finalized artifacts.
11. Authorize ownership before issuing any short-lived artifact download.
12. Treat report date bounds as inclusive and keep its status policy documented.

## Layer boundaries

- HTTP routes translate transport concerns only.
- Application services own lifecycle decisions and transaction boundaries.
- Repositories own persistence and tenant-scoped queries.
- The pricing module is pure, deterministic, and independent of HTTP/database code.
- Artifact storage sits behind an interface with local test and S3 implementations.
- React components consume an API client; they do not call `fetch` ad hoc.
- Mock handlers implement the planned API contract rather than component-specific
  shortcuts.

## Frontend standards

- Keep server state in TanStack Query and form state in React Hook Form.
- Do not add Redux/Zustand without a demonstrated cross-cutting state problem.
- Render server-returned totals; any preview must be clearly non-authoritative.
- Every interaction must work by keyboard and expose a visible focus state.
- Meet WCAG 2.2 AA contrast and semantics.
- Cover loading, empty, error, conflict, saving, saved, draft, and finalized states.
- Test at 360, 768, 1024, and 1440 CSS pixels without horizontal page overflow.
- Use deterministic mock fixtures derived from the assignment, including `421.50`.
- Keep the mock boundary replaceable: switching to FastAPI must not rewrite pages.

## Backend standards

- Use typed Pydantic request/response models and SQLAlchemy 2 style.
- Return decimal values as strings and consistent machine-readable error envelopes.
- Create all schema changes with Alembic; never rewrite an applied migration.
- Production startup must fail when configured with SQLite or local artifact storage.
- Hash passwords with a memory-hard algorithm and keep secrets out of logs.
- Do not hold database locks while performing long external I/O without documenting
  the consistency tradeoff.

## Change workflow

1. Read the relevant README, architecture note, and ADRs.
2. Inspect `git status` and preserve unrelated/user-owned changes.
3. State assumptions when the task leaves a material choice open.
4. Make the smallest coherent change; avoid opportunistic rewrites.
5. Add a failing regression test before fixing a bug when practical.
6. Update examples, OpenAPI-derived types, environment templates, and docs with the
   implementation they describe.
7. Run the checks appropriate to the touched surface and report exact results.

Never add a dependency without recording why it is needed. Never commit secrets,
real customer data, `.env` files, databases, uploads, coverage output, or temporary
Superdesign files.

## Commands

Do not invent commands. The repository intentionally has no runnable application at
this checkpoint. When manifests and root automation are added, document and verify
the canonical setup, format, lint, typecheck, test, build, migration, and development
commands here and in the README from a clean environment.

## Tests required by change type

- Pricing: exact sample, boundary/rounding cases, fixed/percent discounts, tax order,
  and algebraic invariants.
- Persistence: SQLite plus PostgreSQL parity for constraints and migrations.
- API: auth, ownership isolation, validation errors, lifecycle conflicts, reports,
  and artifact authorization/failure.
- UI: protected routes, dynamic rows, server totals, finalized read-only behavior,
  keyboard/focus behavior, and error/empty/loading states.
- End-to-end: sign up, reproduce `421.50`, finalize, reject editing, download the
  artifact, and see the document in the date report.

## Migrations and deployment safety

- Do not run production migrations or mutate Railway/AWS state without explicit
  user authorization.
- Keep migrations backward compatible with overlapping deploys.
- Never deploy SQLite to Railway production.
- Bind services to Railway's assigned port and expose explicit health checks.
- Keep S3 credentials API-only; every `VITE_*` variable is public.

## Definition of done

- Scope and UX acceptance criteria are satisfied.
- Formatting, lint, type checks, unit/integration tests, and production builds pass.
- The relevant migration upgrades cleanly on both supported database paths.
- Accessibility and responsive states are manually inspected.
- No secrets, local state, generated junk, or unrelated diffs are present.
- README, environment examples, ADRs, and API contract match the change.
- Handoff lists changed files, commands run, results, assumptions, and remaining risk.
