import {
  ArrowClockwise,
  ArrowUpRight,
  CalendarBlank,
  ChartBar,
  Funnel,
  SpinnerGap,
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { Link } from "react-router-dom";

import { getReport } from "../lib/api";
import { formatMoney } from "../lib/format";
import type { DocumentStatus } from "../types";

interface ReportFilters {
  startDate: string;
  endDate: string;
  status: DocumentStatus | "all";
  customer: string;
}

function localIsoDate(date: Date) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function initialFilters(): ReportFilters {
  const now = new Date();
  return {
    startDate: localIsoDate(new Date(now.getFullYear(), 0, 1)),
    endDate: localIsoDate(now),
    status: "all",
    customer: "",
  };
}

function formatDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function reportError(error: unknown) {
  return error instanceof Error
    ? error.message
    : "We could not prepare this report. Please try again.";
}

export function ReportsPage() {
  const [draftFilters, setDraftFilters] = useState<ReportFilters>(initialFilters);
  const [appliedFilters, setAppliedFilters] = useState<ReportFilters>(initialFilters);
  const [formError, setFormError] = useState<string | null>(null);

  const reportQuery = useQuery({
    queryKey: ["report", appliedFilters],
    queryFn: () => getReport(appliedFilters),
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (draftFilters.startDate > draftFilters.endDate) {
      setFormError("Start date must be on or before end date.");
      return;
    }
    setFormError(null);
    setAppliedFilters({ ...draftFilters, customer: draftFilters.customer.trim() });
  }

  const report = reportQuery.data;

  return (
    <section className="ancillary-page" aria-labelledby="reports-title">
      <header className="ancillary-page-header report-page-header">
        <div>
          <p className="ancillary-eyebrow">Portfolio view</p>
          <h1 id="reports-title">Pricing report</h1>
          <p className="ancillary-page-lede">
            Review document value across an inclusive date range and a precise client slice.
          </p>
        </div>
        {reportQuery.isFetching && !reportQuery.isLoading ? (
          <span className="report-refreshing" role="status">
            <SpinnerGap className="ancillary-spinner" size={17} aria-hidden="true" />
            Refreshing
          </span>
        ) : null}
      </header>

      <form className="report-filters" onSubmit={submit} aria-label="Report filters">
        <div className="report-filter-heading">
          <Funnel size={20} aria-hidden="true" />
          <div>
            <strong>Report scope</strong>
            <span id="inclusive-date-help">Start and end dates are both included.</span>
          </div>
        </div>

        <label htmlFor="report-start-date">
          <span>Start date</span>
          <input
            id="report-start-date"
            type="date"
            value={draftFilters.startDate}
            max={draftFilters.endDate}
            aria-describedby="inclusive-date-help"
            aria-invalid={Boolean(formError) || undefined}
            onChange={(event) =>
              setDraftFilters((current) => ({ ...current, startDate: event.target.value }))
            }
            required
          />
        </label>

        <label htmlFor="report-end-date">
          <span>End date</span>
          <input
            id="report-end-date"
            type="date"
            value={draftFilters.endDate}
            min={draftFilters.startDate}
            aria-describedby="inclusive-date-help"
            aria-invalid={Boolean(formError) || undefined}
            onChange={(event) =>
              setDraftFilters((current) => ({ ...current, endDate: event.target.value }))
            }
            required
          />
        </label>

        <label htmlFor="report-status">
          <span>Status</span>
          <select
            id="report-status"
            value={draftFilters.status}
            onChange={(event) =>
              setDraftFilters((current) => ({
                ...current,
                status: event.target.value as ReportFilters["status"],
              }))
            }
          >
            <option value="all">All statuses</option>
            <option value="draft">Draft</option>
            <option value="finalized">Finalized</option>
          </select>
        </label>

        <label htmlFor="report-customer">
          <span>Customer</span>
          <input
            id="report-customer"
            type="search"
            value={draftFilters.customer}
            placeholder="All customers"
            onChange={(event) =>
              setDraftFilters((current) => ({ ...current, customer: event.target.value }))
            }
          />
        </label>

        <button
          className="ancillary-button ancillary-button-primary report-run-button"
          type="submit"
          disabled={reportQuery.isFetching}
        >
          {reportQuery.isFetching ? (
            <SpinnerGap className="ancillary-spinner" size={18} aria-hidden="true" />
          ) : (
            <ChartBar size={18} aria-hidden="true" />
          )}
          {reportQuery.isFetching ? "Running…" : "Run report"}
        </button>

        {formError ? (
          <p className="report-filter-error" role="alert">
            {formError}
          </p>
        ) : null}
      </form>

      {reportQuery.isLoading ? (
        <div className="ancillary-state ancillary-loading-state" role="status" aria-live="polite">
          <SpinnerGap className="ancillary-spinner" size={26} aria-hidden="true" />
          <p>Calculating your report…</p>
        </div>
      ) : null}

      {reportQuery.isError ? (
        <div className="ancillary-state" role="alert">
          <ChartBar size={32} aria-hidden="true" />
          <h2>Report unavailable</h2>
          <p>{reportError(reportQuery.error)}</p>
          <button
            className="ancillary-button ancillary-button-secondary"
            type="button"
            onClick={() => void reportQuery.refetch()}
          >
            <ArrowClockwise size={18} aria-hidden="true" />
            Try again
          </button>
        </div>
      ) : null}

      {report ? (
        <div className="report-results" aria-live="polite">
          <div className="report-period">
            <CalendarBlank size={20} aria-hidden="true" />
            <p>
              <span>Inclusive period</span>
              <strong>
                {formatDate(report.startDate)} – {formatDate(report.endDate)}
              </strong>
            </p>
          </div>

          <section className="report-summary" aria-labelledby="report-summary-title">
            <div className={`report-summary-primary ${report.currencyTotals.length > 1 ? "is-mixed" : ""}`}>
              <p id="report-summary-title">
                {report.currencyTotals.length > 1 ? "Currency groups" : "Grand total"}
              </p>
              <strong>
                {report.currencyTotals.length > 1
                  ? `${report.currencyTotals.length} currencies`
                  : formatMoney(
                      report.currencyTotals[0]?.grandTotal ?? "0.00",
                      report.currencyTotals[0]?.currency ?? "USD",
                    )}
              </strong>
              <span>
                Across {report.totals.documentCount} document
                {report.totals.documentCount === 1 ? "" : "s"}
              </span>
            </div>
            {report.currencyTotals.length > 1 ? (
              <dl className="report-summary-breakdown currency-breakdown">
                {report.currencyTotals.map((total) => (
                  <div key={total.currency}>
                    <dt>{total.currency} total</dt>
                    <dd>{formatMoney(total.grandTotal, total.currency)}</dd>
                    <small>{total.documentCount} document{total.documentCount === 1 ? "" : "s"}</small>
                  </div>
                ))}
              </dl>
            ) : (
              <dl className="report-summary-breakdown">
                <div>
                  <dt>Subtotal</dt>
                  <dd>{formatMoney(report.totals.subtotal, report.currencyTotals[0]?.currency)}</dd>
                </div>
                <div>
                  <dt>Discounts</dt>
                  <dd>{formatMoney(report.totals.discount, report.currencyTotals[0]?.currency)}</dd>
                </div>
                <div>
                  <dt>Tax</dt>
                  <dd>{formatMoney(report.totals.tax, report.currencyTotals[0]?.currency)}</dd>
                </div>
                <div>
                  <dt>Documents</dt>
                  <dd>{report.totals.documentCount}</dd>
                </div>
              </dl>
            )}
          </section>

          <section className="report-detail" aria-labelledby="report-detail-title">
            <div className="report-detail-heading">
              <div>
                <p className="ancillary-eyebrow">Report detail</p>
                <h2 id="report-detail-title">Included documents</h2>
              </div>
              <span>{report.documents.length} results</span>
            </div>

            {report.documents.length === 0 ? (
              <div className="ancillary-state report-empty-state">
                <ChartBar size={32} aria-hidden="true" />
                <h3>No documents in this range</h3>
                <p>Adjust the date, status, or customer filters and run the report again.</p>
              </div>
            ) : (
              <div className="ancillary-table-wrap">
                <table className="ancillary-table report-table">
                  <caption className="ancillary-sr-only">
                    Documents included in the current report
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Document</th>
                      <th scope="col">Customer</th>
                      <th scope="col">Date</th>
                      <th scope="col">Status</th>
                      <th scope="col" className="ancillary-money-cell">Total</th>
                      <th scope="col"><span className="ancillary-sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.documents.map((document) => (
                      <tr key={document.id}>
                        <td>
                          <Link className="document-primary-link" to={`/documents/${document.id}`}>
                            <span>{document.number}</span>
                            <strong>{document.title}</strong>
                          </Link>
                        </td>
                        <td>{document.customerName}</td>
                        <td>{formatDate(document.documentDate)}</td>
                        <td>
                          <span className={`ancillary-status ancillary-status-${document.status}`}>
                            {document.status === "finalized" ? "Finalized" : "Draft"}
                          </span>
                        </td>
                        <td className="ancillary-money-cell">
                          {formatMoney(document.grandTotal, document.currency)}
                        </td>
                        <td className="ancillary-action-cell">
                          <Link
                            className="ancillary-icon-link"
                            to={`/documents/${document.id}`}
                            aria-label={`Open ${document.number} for ${document.customerName}`}
                          >
                            <ArrowUpRight size={19} aria-hidden="true" />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      ) : null}
    </section>
  );
}
