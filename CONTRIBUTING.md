# Contributing

Thank you for improving Multi-Rate Pricing Calculator. This project values explicit
contracts, exact financial behavior, and small reviewable changes over clever
shortcuts.

## Start here

1. Read [AGENTS.md](AGENTS.md) in full. Its domain invariants take precedence over
   convenience.
2. Inspect `git status` and preserve unrelated work.
3. Read the relevant service README and supporting documentation before changing a
   subsystem:
   - [API README](apps/api/README.md)
   - [Web README](apps/web/README.md)
   - [Architecture](docs/architecture.md)
   - [Contract migration plan](docs/frontend-backend-migration-plan.md)
   - [Decision records](docs/decisions/README.md)
4. Check for a more specific `AGENTS.md` in the directory you will edit.

## Local setup

Use two terminals for the real local stack.

```bash
# Terminal 1 — API
cd apps/api
uv sync --all-groups
cp .env.example .env
uv run alembic upgrade head
uv run uvicorn pricing_api.main:app --reload --host 0.0.0.0 --port 8000

# Terminal 2 — web
cd apps/web
npm ci
npm run dev
```

Create an account at <http://localhost:5173/signup>. The normal development path
uses FastAPI. `VITE_API_MODE=mock` is an explicit in-memory test/visual mode only;
never represent it as backend enforcement or persistent data.

## Development workflow

- Branch from the current remote default branch unless the task explicitly requires a
  release or hotfix branch.
- Keep commits focused: do not mix formatting churn, dependency upgrades, and feature
  work without a documented reason.
- Preserve the layer boundaries: components use the API client, routes translate HTTP,
  services own transactions/lifecycle, repositories own persistence, and the pure
  pricing module is the only formula authority.
- Never use binary floating point for money or rates. Quantity is a positive whole
  integer. The server owns totals, ownership, and lifecycle state.
- Use Alembic for every schema change. Never rewrite an applied migration; document
  any data-conversion risk and test SQLite/PostgreSQL-compatible migration behavior.
- Keep line descriptions at 240 characters or fewer and preserve currency-separated
  reporting—there is no cross-currency conversion or aggregate money total.
- Do not commit secrets, `.env` files, local databases, coverage output, caches,
  generated temporary files, customer data, or artifacts.

## Verification

Run the checks for every touched surface and record the observed result in the handoff.

```bash
# From apps/api
uv run pytest
uv run ruff check src tests
uv run alembic check

# From apps/web
npm run typecheck
npm run lint
npm run test
npm run build
npm run test:sites
```

When a FastAPI route or schema changes, run the API locally on port 8000, then update
the checked-in browser contract:

```bash
cd apps/web
npm run generate:api
npm run check:api
```

For visible web work, inspect Light and Dark states, keyboard/focus behavior, and
360/768/1024/1440px widths without horizontal page overflow. Add a regression test for
bugs when practical.

## Documentation and review

Update the README, service docs, environment examples, deployment guide, ADRs, and
generated OpenAPI declarations whenever they describe a changed behavior. Add an ADR
for a cross-cutting, difficult-to-reverse decision or any change to a documented
invariant.

Before requesting review or handing off, include:

- What changed and why.
- The user or operational impact.
- Exact commands run and their results.
- Migrations, contract changes, or required environment changes.
- Remaining risks and unverified production steps.

For pull requests, include screenshots for visual changes and a clear migration plan
for data changes. Do not claim a production deployment, backend enforcement, or
Railway verification that has not actually occurred.
