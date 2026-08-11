# Pricing Desk web

React 19 + TypeScript frontend for the multi-rate pricing calculator. Its normal
runtime path is the FastAPI v1 service; MSW is retained only as an explicit,
in-memory contract double for browser/unit tests and visual exploration.

## Local development

Start FastAPI first (including the `CORS_ALLOWED_ORIGINS=http://localhost:5173`
value from [`../api/.env.example`](../api/.env.example)), then run:

```bash
npm ci
npm run dev
```

Vite development defaults to `http://localhost:8000` when `VITE_API_URL` is not
set. Railway production uses the same-origin Caddy `/api/*` proxy instead. Create
an account from `/signup`; there are no browser-stored demo credentials.

`VITE_API_MODE=mock` is permitted only for an isolated local visual/test session.
Production builds never start the MSW worker.

## Contract and session model

- `npm run generate:api` writes checked-in FastAPI OpenAPI declarations to
  `src/lib/generated/openapi.ts` (FastAPI must be running on port 8000).
- `npm run check:api` regenerates those declarations and fails if they are stale.
- `src/lib/api.ts` is the only component-facing HTTP client. It sends
  `credentials: "include"`, holds the API-provided CSRF value only in module
  memory, retries one stale-CSRF response, and never sends a bearer token.
- The editor submits only write fields and renders pricing totals returned by
  FastAPI. It discovers selectable currencies from `/api/v1/config/currencies`.
- Line-level tax is a direct percentage input. Money and rate controls retain natural
  partial edit states but do not accept more than two fractional digits; quantity accepts
  positive whole numbers only. FastAPI remains the authoritative validation and
  calculation boundary.
- Preview is the only printable output for drafts and finalized documents. It can open
  the browser print dialog and never requests a generated backend PDF.
- Line descriptions are multiline, wrap within the item column, and are capped at 240
  characters by both the UI and FastAPI.
- Reports render an explicit totals row for every currency in the selected period.
- The document-currency and report-status menus use the shared app-owned `AppSelect`
  listbox so their expanded states match the Light/Dark UI; they remain keyboard
  operable and expose selected state to assistive technology.

## Editor UX contract

- Source Sans 3 carries the operational UI and financial data; Source Serif 4 is a
  restrained document-identity accent. Desktop document titles stay within 30-34px.
- Light and Dark are the only appearance modes. Their icon-only controls live in the
  sidebar utility area formerly occupied by Settings and expose accessible labels,
  tooltips, and selection state.
- The right-hand calculation summary remains contained by the editor grid. No bottom
  action or status surface may span across or obscure it.
- Compound fields expose one outer focus border; nested inputs must not render a
  competing inner focus rectangle.
- Finalized documents use the normal detail view with editing disabled; read-only
  lifecycle behavior is independent from appearance.

## Checks

```bash
npm run test
npm run typecheck
npm run lint
npm run build
npm run test:sites
```

`npm run build` writes the browser bundle to `dist/client` and preserves the
Sites-hosting worker contract. Railway Railpack detects the Vite output, installs
Caddy, uses the checked-in Caddyfile for that output path, and proxies relative
`/api/*` requests to `API_UPSTREAM`. Leave the Railway web start command empty;
setting one disables Railpack's SPA/Caddy deployment path.

## Source map

- `src/pages`: auth, document register, editor, and reports.
- `src/components`: shell, Light/Dark theme controls, preview, and server-returned
  total UI.
- `src/lib/api.ts`: the real FastAPI adapter and browser-session boundary.
- `src/lib/generated/openapi.ts`: generated, checked-in FastAPI contract types.
- `src/mocks`: explicit MSW-only in-memory test fixture and fixed-point contract
  double. It does not persist browser data or use bearer authentication.

See the root [README](../../README.md),
[frontend/backend migration record](../../docs/frontend-backend-migration-plan.md),
and [deployment guide](../../docs/deployment.md).
