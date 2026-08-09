# Contributing

## Before changing code

Read `AGENTS.md`, the relevant service README, `docs/architecture.md`, and applicable
ADRs. Confirm that the current phase gate permits the intended work.

## Working agreement

- Branch from the remote default branch and keep commits focused.
- Preserve unrelated working-tree changes.
- Never commit credentials, local databases, uploaded artifacts, or generated caches.
- Add dependencies only when the need and tradeoff are documented.
- Add an ADR for decisions that are cross-cutting, costly to reverse, or change a
  documented invariant.

## Pull requests

Describe what changed, why, user/developer impact, validation performed, and known
limitations. Include screenshots for visible changes and migrations for schema
changes. A pull request is not ready while its docs describe behavior that does not
exist.

Canonical development commands will be added only after the first approved
implementation and verified from a clean clone.
