# Contributing

## Before changing code

Read `AGENTS.md`, the relevant service README, `docs/architecture.md`, the frontend
research/brief when touching UI, and applicable ADRs. The Option 1 evolved frontend
direction is approved; backend and deployment work remain separate phases.

## Frontend setup and checks

From the repository root:

```bash
cd apps/web
npm ci
npm run dev
```

Before handing off a frontend change, run the checks relevant to it:

```bash
npm run test
npm run typecheck
npm run lint
npm run build
npm run test:sites
```

Record observed outcomes; the presence of a command here is not evidence that it
passed. Backend setup commands will be added only after that service exists and they
have been verified from a clean environment.

## Working agreement

- Branch from the remote default branch and keep commits focused.
- Preserve unrelated and user-owned working-tree changes.
- Never commit credentials, local databases, uploaded artifacts, or generated caches.
- Add dependencies only when the need and tradeoff are documented.
- Add an ADR for decisions that are cross-cutting, costly to reverse, or change a
  documented invariant.
- Keep mock handlers contract-shaped; do not bypass them with direct fixture imports.
- Update screenshots and the design brief when an approved visible pattern changes.

## Pull requests

Describe what changed, why, user/developer impact, validation performed, and known
limitations. Include screenshots for visible changes and migrations for schema
changes. A pull request is not ready while its docs describe behavior that does not
exist or while mock-only behavior is presented as backend enforcement.
