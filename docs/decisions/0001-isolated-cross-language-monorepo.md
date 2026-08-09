# ADR 0001: Isolated cross-language monorepo

- Status: Accepted
- Date: 2026-08-10

## Context

The web and API need one reviewable repository but use different languages, package
managers, build systems, and Railway service roots.

## Decision

Keep deployable applications in `apps/web` and `apps/api`. Share governance and docs
at the root, but do not create a runtime shared package. Each service owns its lockfile,
environment example, tests, container, and Railway configuration.

## Alternatives

Separate repositories add review and coordination overhead. A JavaScript workspace
cannot manage Python coherently. A root container that builds everything couples
otherwise independent deployments.

## Consequences

Service builds stay deterministic and changes can trigger only relevant deploys.
Cross-language contract drift must be controlled through OpenAPI generation and
contract tests instead of shared source types.

## Revisit triggers

Revisit if several deployable JavaScript packages genuinely share versioned runtime
code or release cadence can no longer be coordinated safely.
