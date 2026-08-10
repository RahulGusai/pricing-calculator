import { Printer, X } from "@phosphor-icons/react";
import { forwardRef } from "react";

import { formatDate, formatMoney } from "../lib/format";
import type { PricingDocument } from "../types";

export const DocumentPreviewDialog = forwardRef<
  HTMLDialogElement,
  { document: PricingDocument }
>(function DocumentPreviewDialog({ document }, ref) {
  return (
    <dialog className="document-preview-dialog" ref={ref} aria-labelledby="preview-title">
      <div className="dialog-toolbar">
        <div>
          <span className="eyebrow">Document preview</span>
          <strong id="preview-title">{document.number}</strong>
        </div>
        <div>
          <button type="button" className="button secondary" onClick={() => window.print()}>
            <Printer size={18} aria-hidden="true" />
            Print
          </button>
          <form method="dialog">
            <button type="submit" className="icon-button" aria-label="Close preview">
              <X size={20} aria-hidden="true" />
            </button>
          </form>
        </div>
      </div>

      <article className="preview-paper">
        <header>
          <div>
            <span className="preview-brand">Pricing Desk</span>
            <h2>{document.title}</h2>
          </div>
          <div className="preview-meta">
            <span>{document.status === "finalized" ? "Finalized" : "Draft preview"}</span>
            <strong>{document.number}</strong>
          </div>
        </header>

        <dl className="preview-recipient">
          <div><dt>Prepared for</dt><dd>{document.customerName}</dd></div>
          <div><dt>Document date</dt><dd>{formatDate(document.documentDate)}</dd></div>
          <div><dt>Valid until</dt><dd>{formatDate(document.validUntil)}</dd></div>
        </dl>

        <table>
          <thead>
            <tr><th>Item</th><th>Qty</th><th>Rate</th><th>Disc.</th><th>Tax</th><th>Total</th></tr>
          </thead>
          <tbody>
            {document.lines.map((line) => (
              <tr key={line.id}>
                <td><strong>{line.name}</strong><small>{line.description}</small></td>
                <td>{line.quantity}</td>
                <td>{formatMoney(line.unitPrice)}</td>
                <td>{formatMoney(line.discount)}</td>
                <td>{formatMoney(line.tax)}</td>
                <td>{formatMoney(line.grandTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <footer>
          <p>Thank you for the opportunity to work together.</p>
          <dl>
            <div><dt>Subtotal</dt><dd>{formatMoney(document.totals.subtotal)}</dd></div>
            <div><dt>Discount</dt><dd>−{formatMoney(document.totals.discount)}</dd></div>
            <div><dt>Tax</dt><dd>{formatMoney(document.totals.tax)}</dd></div>
            <div><dt>Total</dt><dd>{formatMoney(document.totals.grandTotal)}</dd></div>
          </dl>
        </footer>
      </article>
    </dialog>
  );
});
