# Pricing Calculator API

> **Read [the repository AGENTS.md](../../AGENTS.md) before running or changing
> anything in this service.** It defines the pricing, ownership, lifecycle, and
> deployment invariants.

FastAPI service for the pricing-calculator monorepo. It owns authentication,
server-authoritative integer pricing, document lifecycle, reports, and private PDF
artifact authorization. The React app remains on MSW until the planned contract
migration is completed.

## Local setup

Requires Python 3.12+ and [uv](https://docs.astral.sh/uv/).

```bash
uv sync --all-groups
cp .env.example .env
uv run alembic upgrade head
uv run uvicorn pricing_api.main:app --reload --host 0.0.0.0 --port 8000
```

OpenAPI is available at <http://localhost:8000/openapi.json> and interactive docs at
<http://localhost:8000/docs>. The local defaults use SQLite and `./.artifacts`; they
are intentionally invalid when `APP_ENVIRONMENT=production`.

## Contract and calculations

- Auth uses an opaque `pricing_session` `HttpOnly` cookie. The database stores only a
  hash; authenticated mutations additionally require `X-CSRF-Token`.
- JSON money, quantities, and rates are decimal strings. Inputs accept at most two
  decimals, and responses normalize them to exactly two decimals.
- USD, INR, and AED are the allowed deployment currencies. Internally their amounts
  are cents, paise, and fils; all use scale 100. Quantity and percentage points also
  use integer scale 100.
- The pure `pricing_api.pricing` module uses half-up line rounding, applies discount
  before tax, and sums already-rounded line components for document totals.
- Documents use full ordered-line `PATCH` replacement while draft. Finalized content
  is immutable; permanent whole-document deletion needs `{ "confirm": true }`.
- Reports group totals by currency and never construct a mixed-currency money total.

The complete browser-facing schema and frontend migration sequence are in
[the frontend-to-FastAPI migration plan](../../docs/frontend-backend-migration-plan.md).

## Checks

```bash
uv run pytest
uv run ruff check src tests
uv run alembic check
```

## Railway

The service ships with a Dockerfile and `railway.json`. Production must set
`APP_ENVIRONMENT=production`, a Railway PostgreSQL `DATABASE_URL`,
`ARTIFACT_STORAGE=s3`, a private S3-compatible bucket configuration,
`SESSION_COOKIE_SECURE=true`, and a unique `CSRF_SECRET`. See
[the deployment guide](../../docs/deployment.md); do not run migrations against a
live Railway database without explicit authorization.
