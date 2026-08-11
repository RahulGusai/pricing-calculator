import { CaretDown, CheckCircle } from "@phosphor-icons/react";

import { formatMoney, formatSignedMoney } from "../lib/format";
import type { PricingDocument } from "../types";

export function CalculationSummary({ document }: { document: PricingDocument }) {
  const taxedLineCount = document.lines.filter((line) => line.tax !== "0.00").length;

  return (
    <aside className="calculation-summary" aria-label="Document calculation summary">
      <h2>Summary</h2>
      <dl className="summary-totals">
        <div>
          <dt>Subtotal</dt>
          <dd>{formatMoney(document.totals.subtotal, document.currency)}</dd>
        </div>
        <div>
          <dt>Discount</dt>
          <dd>{formatSignedMoney(document.totals.discount, document.currency)}</dd>
        </div>
        <div>
          <dt>Tax</dt>
          <dd>{formatMoney(document.totals.tax, document.currency)}</dd>
        </div>
        <div className="grand-total-row">
          <dt>Grand total</dt>
          <dd>{formatMoney(document.totals.grandTotal, document.currency)}</dd>
        </div>
      </dl>

      <p className="verified-total">
        <CheckCircle size={20} weight="fill" aria-hidden="true" />
        <span>Server calculated</span>
      </p>

      <details className="calculation-details" open>
        <summary>
          <span>How this is calculated</span>
          <CaretDown aria-hidden="true" size={18} />
        </summary>
        <dl>
          <div>
            <dt>Subtotal</dt>
            <dd>{formatMoney(document.totals.subtotal, document.currency)}</dd>
            <small>Sum of line subtotals before discount</small>
          </div>
          <div>
            <dt>Discount</dt>
            <dd>{formatSignedMoney(document.totals.discount, document.currency)}</dd>
            <small>
              {document.lines
                .filter((line) => line.discount !== "0.00")
                .map((line) => `${formatMoney(line.discount, document.currency)} on ${line.name}`)
                .join(" · ") || "No discounts"}
            </small>
          </div>
          <div>
            <dt>Tax</dt>
            <dd>{formatMoney(document.totals.tax, document.currency)}</dd>
            <small>
              {taxedLineCount > 0
                ? `Applied after discount on ${taxedLineCount} tax-bearing ${taxedLineCount === 1 ? "line" : "lines"}`
                : "No tax-bearing lines"}
            </small>
          </div>
          <div className="detail-grand-total">
            <dt>Grand total</dt>
            <dd>{formatMoney(document.totals.grandTotal, document.currency)}</dd>
          </div>
        </dl>
      </details>

      <p className="rounding-note">
        Calculations are performed in {document.currency}. Rounding is applied at the line level.
      </p>
    </aside>
  );
}
