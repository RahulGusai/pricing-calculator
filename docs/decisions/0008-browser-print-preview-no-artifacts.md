# ADR 0008: Browser print preview without generated artifacts

- Status: Accepted
- Date: 2026-08-11

## Context

The product needs a clear printable representation of a pricing document, but it does
not need a durable generated PDF, download authorization, or object-storage lifecycle.
Keeping those capabilities added backend dependencies, database state, deployment
credentials, failure modes, and deletion compensation that were not required by the
approved workflow.

## Decision

- Keep PostgreSQL/SQLite as the complete canonical store for documents and totals.
- Render the printable representation in the React preview dialog from an authorized
  API response.
- Use the browser print dialog when the user chooses to print.
- Do not generate PDFs in FastAPI, expose artifact routes, store artifact metadata,
  create local artifact directories, or require S3-compatible storage.
- Finalization remains a server-authoritative, transactional lifecycle transition.
- Remove the legacy `artifacts` table with a forward Alembic migration rather than
  rewriting the applied initial migration.

## Alternatives

- Keep private S3 PDFs and presigned downloads. Rejected because the workflow no
  longer requires a downloadable artifact and the operational surface is disproportionate.
- Generate a PDF on demand without storage. Rejected because the browser print preview
  already satisfies the requested output and avoids a second renderer.
- Store PDF bytes in PostgreSQL. Rejected because it retains unnecessary generation and
  storage work while bloating canonical backups.

## Consequences

- Railway needs only the web service, API service, and PostgreSQL.
- Finalization and deletion no longer perform external object-storage I/O.
- The printable appearance depends on the browser's print engine and print stylesheet.
- A future requirement for immutable signed exports requires a new decision and a
  deliberate artifact lifecycle rather than silently reintroducing storage.

## Revisit triggers

Revisit only if customers require immutable downloaded records, signed documents,
email attachments, regulatory retention, or pixel-identical server-rendered exports.
