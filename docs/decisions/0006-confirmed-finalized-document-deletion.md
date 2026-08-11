# ADR 0006: Confirmed finalized-document deletion

- Status: Superseded in part by ADRs 0007 and 0008
- Date: 2026-08-10

> ADR 0007 retires Reading mode and supersedes only the presentation-specific deletion
> rule below. Confirmed deletion from both the register and normal detail view remains
> accepted.
>
> ADR 0008 removes the artifact-cleanup portion of deletion. Confirmed relational
> deletion and finalized immutability remain accepted.

## Context

The original lifecycle treated finalization as preventing every mutation, including
deletion. The product requirement now calls for deletion from both the document register
and detail view for drafts and finalized records. Editing a finalized document and
deleting the complete resource have different user intent and storage consequences.

## Decision

Keep metadata, line items, ordering, currency, totals, and status immutable after
finalization. Allow the authenticated owner to permanently delete the whole document as
a separate lifecycle operation. Both register and detail surfaces require an explicit
confirmation that names the document and status. The original decision made the former
Reading-mode surface suppress the delete control; ADR 0007 supersedes that exception,
so the normal finalized detail view exposes the same deliberately confirmed deletion.

The API contract uses `DELETE /api/v1/documents/{document_id}` for both draft and
finalized documents. FastAPI must authorize ownership
before deletion, return `404` for another owner's resource, and coordinate relational
deletion with removal of any finalized S3 artifact.

## Alternatives

Restricting deletion to drafts preserves the original invariant but does not satisfy the
required lifecycle. Reopening finalized documents would weaken auditability. Soft delete
would improve recovery and retention controls, but it adds visibility, reporting, and
artifact-retention semantics that are outside this frontend-first assignment.

## Consequences

Users can clean up both lifecycle states without treating finalized content as editable.
The action is irreversible and therefore uses danger styling and deliberate
confirmation. The backend defines a compensating workflow for database and S3 cleanup;
production deployment and live S3 behavior still require verification.

## Revisit triggers

Revisit when retention policy, audit logs, restore, legal hold, or soft-delete requirements
are introduced. Those features must define whether deleted documents participate in
reports and how long finalized artifacts remain recoverable.
