import { CaretDown, CheckCircle } from "@phosphor-icons/react";

import { formatMoney, formatSignedMoney } from "../lib/format";
import type { PricingDocument } from "../types";

export function CalculationSummary({ document }: { document: PricingDocument }) {
  const taxableLines = document.lines.filter((line) => Number(line.taxRate) > 0);
  const taxableAmount = taxableLines.reduce(
    (sum, line) => sum + Number(line.subtotal) - Number(line.discount),
    0,
  );

  return (
    <aside className="calculation-summary" aria-label="Document calculation summary">
      <dl className="summary-totals">
        <div>
          <dt>Subtotal</dt>
          <dd>{formatMoney(document.totals.subtotal)}</dd>
        </div>
        <div>
          <dt>Discount</dt>
          <dd>{formatSignedMoney(document.totals.discount)}</dd>
        </div>
        <div>
          <dt>Tax</dt>
          <dd>{formatMoney(document.totals.tax)}</dd>
        </div>
        <div className="grand-total-row">
          <dt>Grand total</dt>
          <dd>{formatMoney(document.totals.grandTotal)}</dd>
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
            <dd>{formatMoney(document.totals.subtotal)}</dd>
            <small>Sum of line subtotals before discount</small>
          </div>
          <div>
            <dt>Discount</dt>
            <dd>{formatSignedMoney(document.totals.discount)}</dd>
            <small>
              {document.lines
                .filter((line) => Number(line.discount) > 0)
                .map((line) => `${formatMoney(line.discount)} on ${line.name}`)
                .join(" · ") || "No discounts"}
            </small>
          </div>
          <div>
            <dt>Tax</dt>
            <dd>{formatMoney(document.totals.tax)}</dd>
            <small>
              Applied after discount to {formatMoney(taxableAmount.toFixed(2))} taxable amount
            </small>
          </div>
          <div className="detail-grand-total">
            <dt>Grand total</dt>
            <dd>{formatMoney(document.totals.grandTotal)}</dd>
          </div>
        </dl>
      </details>

      <p className="rounding-note">
        Calculations are performed in USD. Rounding is applied at the line level.
      </p>
    </aside>
  );
}
