# ADR 0002: React/Vite with contract-first mocks

- Status: Accepted (implemented; FastAPI cutover completed)
- Date: 2026-08-10

## Context

The product is an authenticated interactive workspace, not an SEO content site.
FastAPI owns the server boundary, and the user wants to validate UX before building
the backend.

## Decision

Use React 19, TypeScript, and Vite with React Router, TanStack Query, React Hook Form,
and Zod. Develop first against Mock Service Worker handlers that mirror the planned
REST contract and preserve deterministic state locally. Generate the final API types
from FastAPI OpenAPI when the backend exists.

Library responsibilities stay deliberately narrow:

- React Router owns protected layouts and URL-addressable workflow state.
- TanStack Query owns request state, caching, invalidation, and mutations.
- React Hook Form owns dynamic line-item and field interaction state.
- Zod validates the browser boundary without replacing backend validation.
- MSW supplies an explicit test/visual request boundary; normal development and
  production use FastAPI.
- Phosphor supplies one icon vocabulary; labels remain for consequential actions.
- Bundled Source Sans 3 and Source Serif 4 variable fonts provide interface and editorial roles
  without a third-party runtime request.
- Vitest, Testing Library, jest-dom, user-event, and jsdom exercise behavior and
  accessibility-oriented semantics.

## Alternatives

Next.js adds a second server runtime without a current SSR requirement. Redux adds
global client state machinery before a need exists. Component-level fixture imports
would couple presentation to fake data and make the backend switch costly.

## Consequences

The UX can be tested early with realistic latency, errors, and lifecycle behavior.
Mocks require disciplined contract ownership. The completed cutover uses generated
FastAPI OpenAPI types and leaves MSW as an explicit in-memory test/visual double.

## Revisit triggers

Revisit the rendering framework if public SEO pages, route-level SSR, or React Server
Components become product requirements. Add global client state only for a proven
cross-route state problem.
