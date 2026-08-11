# ADR 0003: Relational canonical state and S3 artifacts

- Status: Superseded by ADR 0008
- Date: 2026-08-10

> The relational-source-of-truth decision remains valid. ADR 0008 removes generated
> PDF storage, artifact metadata, and download authorization.

## Context

Documents must support ownership-scoped CRUD, lifecycle enforcement, and date-range
aggregation, while finalized printable files require durable object storage.

## Decision

Keep users, documents, lines, status, and calculated totals in PostgreSQL/SQLite.
Store immutable finalized PDFs in a private S3-compatible bucket and persist only
artifact metadata/object keys in the database. Authorize every download before issuing
a short-lived URL.

## Alternatives

Storing mutable business documents only in S3 makes transactional edits, ownership,
locking, and reports needlessly fragile. Storing PDFs in the database increases backup
and query load. Railway's ephemeral application filesystem is not durable storage.

## Consequences

Reports and lifecycle rules remain transactional and queryable. Artifact creation
introduces a cross-system consistency boundary that must have explicit failure and
retry behavior.

## Revisit triggers

Adopt an outbox/worker when artifact generation latency, retries, or scale make a
synchronous take-home implementation inappropriate.
