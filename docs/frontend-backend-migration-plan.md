# Frontend-to-FastAPI migration plan

> **Read [AGENTS.md](../AGENTS.md) before changing any file.** This is an
> implementation guide for replacing the browser-only MSW/localStorage/Bearer-token
> boundary in `apps/web` with the FastAPI v1 contract. FastAPI's generated OpenAPI
> document is the eventual source of truth; this document records the agreed contract
> that the first OpenAPI version must expose.

## Scope and locked decisions

- The browser uses a server-managed, opaque cookie session. It does **not** receive,
  store, or send a Bearer access token.
- The raw session token lives only in the configured `pricing_session` `HttpOnly` cookie. The API
  stores only a hash of that token in its `sessions` table.
- `POST /auth/login`, `POST /auth/signup`, and `GET /auth/session` return a
  session-bound, server-derived `csrfToken` in JSON. FastAPI derives it from the
  opaque session cookie and a server secret; it is not a database column. The
  frontend retains it only in module memory and supplies it in `X-CSRF-Token` on
  authenticated `POST`, `PATCH`, and `DELETE` requests. A full-page reload calls
  `GET /auth/session` to restore the token. It is not stored in a readable cookie,
  `localStorage`, `sessionStorage`, a URL, or an error log.
- The production web app and API share an origin through Caddy's `/api/*` proxy.
  Direct local development uses the configured `VITE_API_URL` and `credentials:
  "include"`; FastAPI must permit that one explicit development origin with
  credentialed CORS. No secret belongs in a `VITE_*` variable.
- USD, INR, and AED are the only initially supported currencies. AED is the United
  Arab Emirates dirham. The backend enables them with environment configuration;
  the frontend gets the enabled list from `GET /api/v1/config/currencies` and must
  not hard-code its own selectable list.
- Every money, quantity, fixed-discount, percentage, rate, and calculated amount in
  JSON is a decimal **string**. Money, quantity, and percentage input precision is
  two decimal places. The backend returns normalized values with exactly two decimal
  places.
- The backend owns the one authoritative calculation module. The frontend submits
  inputs, renders returned calculations, and must never submit or locally derive
  authoritative totals.
- `PATCH /api/v1/documents/{documentId}` replaces the complete ordered line array
  for a draft. There are deliberately no separate line-item mutation routes in v1.
  A line `id` is optional in the request only to retain an existing server line;
  array order is authoritative, `position` is response-only, omitted IDs create new
  lines, and existing IDs omitted from the array are deleted.

## Wire rules

### HTTP, cookies, and CSRF

All browser calls go through `src/lib/api.ts`; pages and components must not call
`fetch` directly.

```ts
fetch(apiUrl(path), {
  ...init,
  credentials: "include",
  headers: {
    Accept: "application/json",
    ...(hasBody ? { "Content-Type": "application/json" } : {}),
    ...(isAuthenticatedMutation ? { "X-CSRF-Token": csrfToken } : {}),
  },
});
```

The API sets this cookie after successful sign-up or login and clears it on logout:

```text
Set-Cookie: pricing_session=<opaque-random-value>; HttpOnly; Secure; SameSite=Lax; Path=/api
```

`Secure` is required in production. Local development may use a non-secure cookie
only over `http://localhost`. The unauthenticated sign-up and login requests do not
need a pre-existing session CSRF token; every authenticated unsafe request does.

Never add an `Authorization` header. Never infer whether a user is signed in from
browser storage: `GET /api/v1/auth/session` is the single session-restoration check.

### Scalar conventions

| Value | Request form | Response form | Notes |
| --- | --- | --- | --- |
| Money | decimal string, e.g. `"19.99"` | exactly two decimals, e.g. `"19.99"` | USD cents, INR paise, and AED fils are integer minor units internally. |
| Quantity | decimal string, e.g. `"3"` or `"3.00"` | exactly two decimals, e.g. `"3.00"` | Minimum `"1.00"`; no exponent notation. |
| Percentage | decimal string without `%`, e.g. `"12.50"` | exactly two decimals, e.g. `"12.50"` | Percentage points, in the inclusive range `0.00`–`100.00`. |
| Date | `YYYY-MM-DD` string | `YYYY-MM-DD` string | Date bounds in reports are inclusive. |
| Timestamp | not accepted from the client | ISO 8601 UTC string | `updatedAt` and `finalizedAt`. |
| IDs/counts/bytes | IDs are strings; counts and `sizeBytes` are JSON integers | same | These are not monetary values. |

The accepted input pattern for non-negative two-decimal strings is
`^\d+(?:\.\d{1,2})?$`. The backend normalizes accepted values rather than trusting
the browser's formatting. It rejects a third decimal place, negative values,
scientific notation, and JSON numeric input where a decimal string is required.

For percentage discounts, `"12.50"` means `12.50%`; for fixed discounts it means a
money amount in the document currency. The discriminator determines the meaning.

## Canonical API schemas

All property names below are camelCase on the wire. FastAPI/Pydantic may use Python
snake_case internally, but its aliases and OpenAPI schema must retain this API shape.
`CurrencyCode` is currently `"USD" | "INR" | "AED"`; UI options still come from the
currency-config response so backend configuration remains authoritative.

```ts
type CurrencyCode = "USD" | "INR" | "AED";
type DocumentStatus = "draft" | "finalized";
type DiscountType = "none" | "percentage" | "fixed";

type MoneyTotals = {
  subtotal: string;       // fixed, exactly two decimal places
  discount: string;       // calculated money amount, never a submitted total
  tax: string;            // calculated money amount, never a submitted total
  grandTotal: string;     // calculated money amount, never a submitted total
};

type User = {
  id: string;
  name: string;
  email: string;
  workspaceName: string;
  initials: string;
};

type SessionResponse = {
  user: User;
  csrfToken: string;
};

type CurrencyDefinition = {
  code: CurrencyCode;
  minorUnit: 2;
};

type CurrencyConfigResponse = {
  defaultCurrency: CurrencyCode;
  currencies: CurrencyDefinition[];
  moneyDecimalPlaces: 2;
  quantityDecimalPlaces: 2;
  rateDecimalPlaces: 2;
  roundingMode: "HALF_UP";
};
```

### Distinct write and response types

The request types intentionally cannot carry a status, owner, artifact key,
timestamp, line `position`, or any calculated monetary field. They reject unknown
properties rather than silently accepting stale response data.

```ts
type LineWrite = {
  id?: string;              // server-issued ID of an existing line only
  name: string;
  description: string;
  quantity: string;         // 1.00 or greater; at most two decimal places
  unitPrice: string;        // non-negative money string
  discountType: DiscountType;
  discountValue: string;    // 0.00 for "none"; money or percentage by type
  taxRate: string;          // 0.00 through 100.00 percentage points
};

type LineResponse = LineWrite & MoneyTotals & {
  id: string;
  position: number;         // server-normalized from array order; response-only
};

type CreateDocumentRequest = {
  title?: string;
  customerName?: string;
  documentDate?: string;
  validUntil?: string;
  currency?: CurrencyCode;
  lines?: LineWrite[];
};

// Complete replacement of a draft. Empty strings/lines are valid draft state;
// finalization, not autosave, enforces the complete-document requirements.
type ReplaceDocumentRequest = {
  title: string;
  customerName: string;
  documentDate: string;
  validUntil: string;
  currency: CurrencyCode;
  lines: LineWrite[];
};

// The API intentionally rejects omission, false, and any other value.
type DeleteDocumentRequest = {
  confirm: true;
};

type DocumentResponse = {
  id: string;
  number: string;
  title: string;
  customerName: string;
  documentDate: string;
  validUntil: string;
  currency: CurrencyCode;
  status: DocumentStatus;
  updatedAt: string;
  finalizedAt: string | null;
  lines: LineResponse[];
  totals: MoneyTotals;
  artifact: ArtifactMetadataResponse | null;
};

type DocumentSummary = MoneyTotals & {
  id: string;
  number: string;
  title: string;
  customerName: string;
  documentDate: string;
  currency: CurrencyCode;
  status: DocumentStatus;
};
```

For example, the browser saves this line input:

```json
{
  "name": "Design consultation",
  "description": "",
  "quantity": "3.00",
  "unitPrice": "19.99",
  "discountType": "percentage",
  "discountValue": "12.50",
  "taxRate": "8.25"
}
```

The returned line contains the server's exact calculation—not a browser preview:

```json
{
  "id": "b01234a5-6789-4abc-8def-0123456789ab",
  "position": 1,
  "name": "Design consultation",
  "description": "",
  "quantity": "3.00",
  "unitPrice": "19.99",
  "discountType": "percentage",
  "discountValue": "12.50",
  "taxRate": "8.25",
  "subtotal": "59.97",
  "discount": "7.50",
  "tax": "4.33",
  "grandTotal": "56.80"
}
```

The calculation behind that response is `5,997` cents subtotal, `750` cents
discount, `433` cents tax, and `5,680` cents grand total. Discount is calculated
before tax, and each line component uses backend `ROUND_HALF_UP` rounding.

### Reports and artifacts

There is no cross-currency top-level money total. Only a document count can span
currencies.

```ts
type CurrencyReportTotal = MoneyTotals & {
  currency: CurrencyCode;
  documentCount: number;
};

type ReportResponse = {
  startDate: string;
  endDate: string;
  status: DocumentStatus | "all";
  customer: string;
  documentCount: number;
  currencyTotals: CurrencyReportTotal[];
  documents: DocumentSummary[];
};

type ArtifactMetadataResponse = {
  state: "ready";
  filename: string;
  contentType: "application/pdf";
  sizeBytes: number;
  checksum: string;
  createdAt: string;
};

type ArtifactDownloadResponse = {
  url: string;          // production: short-lived presigned URL; local: authorized API route
  expiresAt: string;    // ISO 8601 UTC
};

type ApiErrorBody = {
  error: {
    code: string;
    message: string;
    fields?: Record<string, string>;
  };
};
```

## Endpoint matrix

All document, report, and artifact routes require the session cookie. A resource
belonging to another user returns the same `404` envelope as a nonexistent resource.

| Method and path | Request | Success response | Expected failure behavior |
| --- | --- | --- | --- |
| `GET /health` | — | `200 { "status": "ok" }` | Operational endpoint; the SPA does not use it for authentication. |
| `GET /api/v1/config/currencies` | — | `200 CurrencyConfigResponse` | Public, cacheable configuration. |
| `POST /api/v1/auth/signup` | `{ email, password, name?, workspaceName? }`; password is 12–256 characters | `201 SessionResponse` plus session cookie | `422 VALIDATION_ERROR` for fields; no access token in JSON. |
| `POST /api/v1/auth/login` | `{ email, password }` | `200 SessionResponse` plus session cookie | `401 INVALID_CREDENTIALS`; no access token in JSON. |
| `GET /api/v1/auth/session` | cookie only | `200 SessionResponse` | `401 AUTHENTICATION_REQUIRED`; client clears in-memory CSRF/session state and treats it as signed out. |
| `POST /api/v1/auth/logout` | CSRF header, cookie | `204 No Content`, clears cookie | `401` when no session; `403 CSRF_VALIDATION_FAILED` for absent/invalid CSRF token. |
| `GET /api/v1/documents` | cookie | `200 DocumentSummary[]`, newest updated first | `401` when unauthenticated. |
| `POST /api/v1/documents` | `CreateDocumentRequest`; `{}` is valid; CSRF header | `201 DocumentResponse` | `422 VALIDATION_ERROR` for malformed supplied fields. |
| `GET /api/v1/documents/{documentId}` | cookie | `200 DocumentResponse` | `404 DOCUMENT_NOT_FOUND` for absent or other-owner document. |
| `PATCH /api/v1/documents/{documentId}` | `ReplaceDocumentRequest`, CSRF header | `200 DocumentResponse` with server-normalized lines/totals | `404 DOCUMENT_NOT_FOUND`; `409 DOCUMENT_FINALIZED`; `422 VALIDATION_ERROR`. |
| `DELETE /api/v1/documents/{documentId}` | `{ confirm: true }`, CSRF header, cookie | `204 No Content` | `422 VALIDATION_ERROR` without deliberate confirmation; `404 DOCUMENT_NOT_FOUND`; `502 ARTIFACT_DELETION_FAILED` if a finalized PDF cannot be removed; `502 DOCUMENT_DELETION_PENDING` when the object was removed but a retry is needed to remove the database record. The UI must keep its permanent-deletion confirmation for drafts and finalized documents. |
| `POST /api/v1/documents/{documentId}/finalize` | no body; CSRF header | `200 DocumentResponse` with `status: "finalized"`; repeating it for an already finalized document is idempotent | `404 DOCUMENT_NOT_FOUND`; `422 DOCUMENT_INCOMPLETE` or `DOCUMENT_HAS_NO_LINES`; `409 DOCUMENT_CONFLICT` if a concurrent draft edit wins. |
| `POST /api/v1/documents/{documentId}/duplicate` | no body; CSRF header | `201 DocumentResponse` for the new draft | `404 DOCUMENT_NOT_FOUND`; `409 DOCUMENT_NOT_FINALIZED` when source is not finalized. |
| `GET /api/v1/documents/{documentId}/artifact` | cookie | `200 ArtifactMetadataResponse` | `404` for an unowned/nonexistent document; `409 ARTIFACT_NOT_READY` when unavailable. Never reveal an object key. |
| `GET /api/v1/documents/{documentId}/artifact/download` | cookie | `200 ArtifactDownloadResponse` | `404` for an unowned/nonexistent document; `409 ARTIFACT_NOT_READY` when unavailable. The presigned URL is never stored in frontend state beyond initiating the download. |
| `GET /api/v1/artifacts/local/{objectKey}` | generated development URL only; cookie | `200 application/pdf` | The frontend must never construct this path. It is an API-authorized local-storage substitute for a production presigned URL. |
| `GET /api/v1/reports/summary?startDate={date}&endDate={date}&status={all\|draft\|finalized}&customer={text}` | cookie; dates are required, `status` defaults to `all`, `customer` to empty | `200 ReportResponse` | `422 INVALID_DATE_RANGE` when start is after end; `422 VALIDATION_ERROR` for malformed values. |

The server may return `400 INVALID_JSON` for invalid JSON and `500 INTERNAL_ERROR`
for an unexpected failure. Both use `ApiErrorBody`; frontend code must still retain a
stable fallback error if a proxy returns non-JSON.

An invalid UUID in a `{documentId}` or supplied line `id` is a request-shape error and
therefore returns `422 VALIDATION_ERROR`; a syntactically valid UUID that is absent or
belongs to another owner returns `404 DOCUMENT_NOT_FOUND`.

## Frontend implementation sequence

### 1. Lock and generate the contract

1. Implement the FastAPI Pydantic aliases and expose `/openapi.json` before changing
   components.
2. Add `openapi-typescript` as an `apps/web` **development** dependency solely to
   generate checked-in type declarations from FastAPI OpenAPI. It adds no browser
   runtime dependency.
3. Add a `generate:api` script that writes a generated module such as
   `src/lib/generated/openapi.ts`. CI should regenerate it and fail on a diff.
4. Keep `src/lib/api.ts` as the handwritten, component-facing adapter. It maps the
   generated schemas to focused functions such as `updateDocument`; pages must not
   import generated transport types directly.
5. Replace hand-maintained `PricingDocument`, `LineItem`, and
   `UpdateDocumentInput` definitions with response and write types derived from the
   generated schema. Retain only UI-only types such as `WorkspaceMode` locally.

### 2. Replace the transport and authentication boundary

1. Remove `SESSION_TOKEN_KEY`, `accessToken`, `setAccessToken`, and every
   `localStorage` authentication read/write from `src/lib/api.ts`.
2. Add a private in-memory `csrfToken` holder. Successful sign-up, login, and
   `getSession()` set it; logout, a `401`, and an explicit reset clear it.
3. Make every request use `credentials: "include"`. Add `X-CSRF-Token` only for
   authenticated unsafe methods. Do not send an authorization header.
4. Have `getSession()` always call the API rather than returning early because a
   stored token is absent. The existing protected-route query then restores both the
   user and CSRF token after reload.
5. On a `401`, clear TanStack Query's session-sensitive caches and redirect protected
   routes to `/login` with the current path preserved. On a `403
   CSRF_VALIDATION_FAILED`, refresh `GET /auth/session` and retry the original unsafe
   request once; if it still fails, show the error and do not loop.
6. Add `signUp()` and a real sign-up route/form. Login/signup success populates the
   `['session']` query and navigates to `/documents`; logout awaits the API call,
   clears cached session/document/report data, and navigates to `/login`.

### 3. Convert the editor to input-only writes

1. Replace the static `SUPPORTED_CURRENCIES` constant with a `useQuery` for
   `CurrencyConfigResponse` (key `['currency-config']`, long stale time). Render only
   the returned USD/INR/AED options and format with the document's returned currency.
2. Change the form's line shape to `LineWrite`. `newLine()` must omit `id` and must
   not create a fake UUID, `position`, `subtotal`, `discount`, `tax`, or
   `grandTotal`.
3. Build `ReplaceDocumentRequest` explicitly before PATCH. Preserve an existing line
   `id`, strip `position` and every calculated field, and use the form array order as
   the order sent to FastAPI.
4. After a successful save, reset form inputs from the returned normalized document
   and use the returned `lines`/`totals` for every calculated display. Do not retain
   a client-side calculated preview.
5. Allow an incomplete draft to autosave. Client validation should reject malformed
   values, not enforce finalization-only requirements such as a non-empty line list
   or customer. Render finalization's `422` field errors in the editor/confirmation
   flow.
6. Serialize autosaves so an older PATCH response cannot overwrite a newer edit.
   Coalesce edits made while one mutation is in flight, then send the latest complete
   snapshot. A `409 DOCUMENT_FINALIZED` must invalidate/refetch the document and
   transition the UI to read-only rather than continue retrying.
7. Add a finalized-only download action: load artifact metadata, request the
   authorized download URL only after user intent, then navigate to that URL. Do not
   display a storage key or treat a browser preview/`window.print()` as a finalized
   artifact download.

### 4. Make browser validation match the contract

Use text inputs with `inputMode="decimal"`, not `type="number"`. Validate strings
on blur and before a save using fixed-string/`bigint` comparison helpers—never
`Number()` for money, quantities, or rates.

| Field | Browser rule | Server remains authoritative for |
| --- | --- | --- |
| `quantity` | non-negative decimal string with at most two decimals and value `>= 1.00` | canonical normalization and all arithmetic |
| `unitPrice` | non-negative decimal string with at most two decimals | amount bounds and line subtotal |
| fixed `discountValue` | non-negative decimal string with at most two decimals | rejection when it exceeds the rounded line subtotal |
| percentage `discountValue` | `0.00`–`100.00`, at most two decimals | percentage rounding |
| `none` `discountValue` | exactly `"0.00"` after normalization | no-discount representation is never silently ignored |
| `taxRate` | `0.00`–`100.00`, at most two decimals | tax calculation after discount |
| dates | valid ISO date and `validUntil >= documentDate` when both are present | final lifecycle validation and calendar rules |

Do not calculate the taxable base with `Number()` in `CalculationSummary`. Replace
the current derived display with server-returned line/totals values or neutral copy
such as “Tax is calculated after discount at the line level.” Likewise, make money
formatting string-safe (parse fixed decimal strings to an integer/`bigint` display
representation before grouping) so presentation code does not introduce a floating
point calculation path.

### 5. Correct report semantics

Replace the current root `report.totals` shape with `report.documentCount` and
`report.currencyTotals`. Render each returned currency group separately, including
subtotal, discount, tax, grand total, and its own document count. Never manufacture a
combined USD/INR/AED amount, even when exactly two groups happen to have the same
numeric value. The documents table continues to format each row using its own
currency.

### 6. Retire mock persistence safely

MSW remains useful for deterministic component tests, but it must mirror the cookie
and CSRF contract. It must not be a browser-persistent alternate database in the real
application:

- delete the Bearer-token fixture and localStorage-backed mock database/session code;
- make test authentication exercise `POST /auth/login` or a test-only handler that
  establishes an equivalent in-memory session, rather than seeding storage;
- make MSW return `SessionResponse` without an `accessToken`, require the CSRF header
  for authenticated mutations, and return the exact new report/write schemas;
- retain second-tenant fixtures only to verify that the UI handles a server `404`
  without leaking ownership; and
- keep `VITE_API_MODE=mock` as an explicit local visual-test option only. Integration
  and production builds use FastAPI; production must never silently start the mock
  worker.

## Expected frontend file changes

| File | Migration work |
| --- | --- |
| `apps/web/package.json` and lockfile | Add the OpenAPI type-generator dev dependency and generation/check scripts, documenting that it prevents contract drift. |
| `apps/web/.env.example` | Describe real same-origin/direct-local API settings and keep mock mode explicitly development-only. |
| `apps/web/src/lib/generated/openapi.ts` (new) | Checked-in generated FastAPI type declarations. |
| `apps/web/src/types.ts` | Keep UI-only types; replace hard-coded currencies and mixed read/write DTOs with contract-derived types. |
| `apps/web/src/lib/api.ts` | Cookie credentials, in-memory CSRF state, stable error parsing, all v1 endpoint functions, and artifact download request. |
| `apps/web/src/lib/api.test.ts` | Assert no Bearer/localStorage behavior, CSRF headers, session rehydration, error mapping, and write payload stripping. |
| `apps/web/src/main.tsx` | Start MSW only when explicitly requested for mock development; preserve real FastAPI mode. |
| `apps/web/src/App.tsx` | Restore session/CSRF before protected routes and route `/` to `/documents`, not a fixture ID. Add the sign-up route. |
| `apps/web/src/pages/LoginPage.tsx` and `apps/web/src/pages/SignupPage.tsx` (new) | Replace demo-only assumptions with login/sign-up, session errors, and redirect handling. |
| `apps/web/src/components/AppShell.tsx` | Use cookie-session logout, clear query data, and handle its CSRF/error state. |
| `apps/web/src/pages/DocumentEditorPage.tsx` | Dynamic currency config, two-decimal input validation, input-only PATCH payloads, serialized autosave, server-returned totals, conflict recovery, and artifact download. |
| `apps/web/src/components/CalculationSummary.tsx` | Remove floating-derived taxable amount; render returned values only. |
| `apps/web/src/components/DocumentPreviewDialog.tsx` | Keep it a local draft/print preview and distinguish it from the authorized finalized PDF download. |
| `apps/web/src/pages/DocumentsPage.tsx` | Create/delete against cookie/CSRF API and preserve deliberate deletion confirmation/error states. |
| `apps/web/src/pages/ReportsPage.tsx` | Consume `documentCount + currencyTotals[]` and remove every use of a mixed root money total. |
| `apps/web/src/lib/format.ts` | Keep formatting decimal-string safe and support dynamically configured currency codes. |
| `apps/web/src/mocks/{handlers,store,fixtures,pricing}.ts` | Update or retire localStorage/Bearer behavior while preserving contract-level test coverage. |
| `apps/web/src/test/setup.ts`, `src/pages/*.test.tsx`, and `src/mocks/pricing.test.ts` | Authenticate through the new contract and cover the API/UI regression matrix below. |

`apps/web/Caddyfile` should only be verified: its existing `/api/*` reverse proxy is
the desired production same-origin boundary unless deployment changes the API prefix.

## Required test matrix

1. **Contract generation:** generated OpenAPI types are current in CI; camelCase
   request/response fields compile against FastAPI schema.
2. **Cookie session:** sign-up/login set a usable session, reload rehydrates via
   `GET /auth/session`, logout clears application state, and no test uses
   `pricing-calculator.access-token.v1` or an `Authorization` header.
3. **CSRF:** PATCH, finalization, duplication, deletion, and logout include the
   in-memory header; a stale token refreshes once; a repeated `403` is visible to the
   user.
4. **Ownership/auth errors:** unauthenticated data calls redirect to login; `404`
   opens the existing neutral “couldn't open” state without naming another user's
   resource.
5. **Input boundary:** `19.99`, `19.9`, and `19` are accepted/normalized; `19.999`,
   negatives, exponent notation, and rates above `100.00` are rejected before save.
   The API's `422` field paths appear next to the relevant React Hook Form field.
6. **Calculation response:** the reference document still renders server-returned
   `450.00` subtotal, `40.00` discount, `11.50` tax, and `421.50` grand total. A
   test inspects the PATCH body to prove it excludes calculated totals and
   `position`.
7. **Lifecycle:** draft autosave, finalization, returned read-only state, `409`
   reconciliation, duplication into an independent draft, and confirmed permanent
   deletion of both draft and finalized records.
8. **Currency:** options are USD/INR/AED from config, not the old six-currency
   constant; an AED document formats correctly; finalized currency is not editable.
9. **Reports:** inclusive bounds, filters, zero results, and two or more currency
   groups; no DOM/API code accesses `report.totals.grandTotal`.
10. **Artifact:** only an owned finalized document can obtain metadata/download URL;
    unavailable artifacts and download failures have accessible error states.
11. **Browser/accessibility:** run the existing 360, 768, 1024, and 1440 px checks;
    preserve keyboard ordering, focus after mutation errors, loading/empty/error
    states, dark mode, and reading-mode suppression of editing controls.
12. **Real-service integration:** run the same critical sign-up → `421.50` →
    finalize → rejected edit → authorized download → inclusive report path against a
    FastAPI test environment, not MSW alone.

## Cutover checklist

1. Finish FastAPI routes, migrations, and OpenAPI export; compare every endpoint in
   this document before changing UI calls.
2. Generate types, implement the adapter/session/CSRF layer, and make API-unit tests
   pass against contract-correct MSW handlers.
3. Migrate the editor and report view without altering the approved visual direction.
4. Point local `VITE_API_MODE=real` at FastAPI, run the real-service integration
   tests, then remove localStorage/Bearer assertions and fixture-ID routing.
5. Run `npm run test`, `npm run typecheck`, `npm run lint`, `npm run build`, and
   `npm run test:sites` from `apps/web`; also run the backend API/migration checks.
6. Only after the real API conformance pass succeeds, treat the mock worker as an
   optional isolated UI-test tool rather than the application's source of state.
