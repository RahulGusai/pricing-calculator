# Pricing Desk web

React 19 + TypeScript frontend for the multi-rate pricing calculator. This phase is
fully runnable against an in-browser Mock Service Worker boundary; FastAPI does not
exist yet.

## Run locally

```bash
npm ci
npm run dev
```

Open `http://localhost:5173` and use:

- email: `avery@northstar.example`
- password: `pricing123`

Mock documents persist in browser `localStorage`. Clear site data to restore the
seeded workspace. Tests reset the mock store before each case.

## Checks

```bash
npm run test
npm run typecheck
npm run lint
npm run build
npm run test:sites
```

`npm run build` writes the browser bundle to `dist/client` and preserves the
Product Design hosting worker contract. The Railway image serves `dist/client` with
Caddy and proxies relative `/api/*` requests to `API_UPSTREAM`.

## Source map

- `src/pages`: login, document register, editor, and reports.
- `src/components`: shared shell, mode switch, preview, and calculation summary.
- `src/lib/api.ts`: the only component-facing HTTP client.
- `src/mocks`: deterministic fixtures, fixed-point pricing, tenant-scoped store, and
  MSW handlers.
- `src/types.ts`: temporary mock/API contract types; replace from FastAPI OpenAPI in
  the backend conformance pass.

## Mock contract

The mock uses `/api/v1` routes, realistic latency, bearer session behavior, owner
scoping, structured error envelopes, draft/finalized conflicts, duplication, and
inclusive report filtering. It returns decimal strings and calculates money with
fixed-point `bigint` arithmetic. React components never import fixtures or calculate
authoritative totals.

The selected sample must remain `450.00` subtotal, `40.00` discount, `11.50` tax,
and `421.50` grand total.

## Environment

- Local development uses mocks by default.
- Set `VITE_API_MODE=real` (and optionally `VITE_API_URL`) when intentionally calling
  a real API during development.
- A production mock bundle requires `VITE_API_MODE=mock`; normal production builds
  expect Caddy to proxy `/api` to FastAPI.
- Never put database or object-storage credentials in `VITE_*` variables.

See the root [README](../../README.md), [frontend design brief](../../docs/frontend-design-brief.md),
and [deployment guide](../../docs/deployment.md).
