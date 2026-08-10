# Frontend product-pattern research

- Reviewed: 2026-08-10
- Scope: document creation, line-item editing, lifecycle state, duplication/download,
  and date-filtered reporting
- Evidence policy: first-party vendor documentation only; visual identities and
  proprietary copy are not reproduced

## Evidence by product

### Stripe Quotes

Stripe documents an explicit quote lifecycle: a draft is editable, finalization
moves it to a restricted open state, later transitions are named, and a quote PDF is
downloadable. This validates making status and finalization a first-class workflow
rather than a cosmetic badge.

- Source: [How quotes work](https://docs.stripe.com/quotes)
- Adopt: explicit draft/finalized language, irreversible-action confirmation,
  read-only post-finalization behavior, and a visible artifact action.
- Avoid: importing Stripe's broader acceptance/subscription lifecycle, which is
  outside this assignment.

### Xero

Xero emphasizes well-laid-out documents, cross-device creation, visible invoice
status, lists that separate outstanding states, and converting quotes without
re-entering information. This supports a scanable document index and duplication as
a continuity action.

- Source: [Xero invoicing software](https://www.xero.com/us/explore/invoicing-software-for-small-businesses/)
- Source: [Xero online invoicing](https://www.xero.com/us/accounting-software/send-invoices/)
- Adopt: prominent status, customer/document context in lists, responsive creation,
  and reuse without mutating the source.
- Avoid: payment, reminders, and accounts-receivable features not required here.

### QuickBooks

QuickBooks' current guidance keeps estimates/invoices as focused forms, surfaces
status after sending, supports estimate-to-invoice continuity, and describes mobile
autosave. This reinforces persistent save feedback and a task-centered editor.

- Source: [Create and send estimates in QuickBooks Online](https://quickbooks.intuit.com/learn-support/en-us/help-article/job-estimates/create-send-estimates-quickbooks-online/L50QFW1vW_US_en_US)
- Source: [What's new with estimates and invoices](https://quickbooks.intuit.com/learn-support/en-us/help-article/job-estimates/see-whats-new-estimates-invoices-quickbooks-online/L9jVVT2GY_US_en_US)
- Adopt: visible save continuity, one primary form task, and status available after
  returning to the list.
- Avoid: silent business-state transitions; this assignment requires deliberate
  finalization and clear API rejection.

### FreshBooks

FreshBooks structures invoice creation into business/client details, item rows,
subtotal/total, notes, settings, and an explicit save-or-send choice. Its documented
line interactions include add, reorder, and remove, while management actions include
duplicate and PDF download.

- Source: [Create an invoice](https://support.freshbooks.com/hc/en-us/articles/216631328-How-do-I-create-an-invoice)
- Source: [Manage invoices](https://support.freshbooks.com/hc/en-us/articles/4404632032013-How-do-I-manage-my-invoices)
- Adopt: progressive document sections, direct line manipulation, anchored totals,
  explicit draft persistence, duplicate, and download actions.
- Avoid: payment schedules, credits, attachments, reminders, and invoice-level
  accounting behavior beyond the assignment.

### Zoho Invoice

Zoho documents filterable quote statuses, cloning/PDF actions, line-level quantity,
rate, discount amount-or-percentage, and tax fields. Its reporting guidance uses
adjustable date ranges with a summarized result. This closely supports the required
document list, mixed line rules, and report workflow.

- Source: [Manage quotes](https://www.zoho.com/invoice/help/estimate/managing-estimates.html)
- Source: [Create an invoice](https://www.zoho.com/en-sg/invoice/help/invoice/new-invoice.html)
- Source: [Sales tax](https://www.zoho.com/invoice/help/sales-tax/)
- Adopt: status filters, inline discount/tax controls, explicit amount-versus-percent
  choice, date controls adjacent to report results, and clone/PDF affordances.
- Avoid: exposing the full accounting configuration surface or tax-jurisdiction
  concepts; no tax-compliance expertise is required.

## Synthesized design rules

The sources converge on several durable patterns:

1. Document state should be immediately visible in lists and detail views.
2. Creation works best as one coherent document surface with grouped metadata, line
   items, and a stable totals region.
3. Save/finalize/send-like transitions require distinct language and feedback.
4. Duplication preserves continuity without reopening an immutable source.
5. Reports need nearby date filters plus both headline totals and traceable rows.
6. Mobile layouts must preserve the task, not compress a desktop table until it is
   unreadable.

Pricing Desk adopts these interaction principles while using its own Option 1 visual
system. It intentionally excludes payments, reminders, compliance, accounting
ledgers, and vendor-specific lifecycle states.
