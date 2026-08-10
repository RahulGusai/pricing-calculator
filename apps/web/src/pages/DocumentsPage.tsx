import {
  ArrowClockwise,
  ArrowUpRight,
  FileText,
  MagnifyingGlass,
  Plus,
  SpinnerGap,
  Trash,
  X,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { createDocument, deleteDocument, listDocuments } from "../lib/api";
import { formatMoney } from "../lib/format";
import type { DocumentStatus, DocumentSummary } from "../types";

type StatusFilter = DocumentStatus | "all";

function formatDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function queryError(error: unknown) {
  return error instanceof Error
    ? error.message
    : "We could not load your documents. Please try again.";
}

function matchesSearch(document: DocumentSummary, search: string) {
  const needle = search.trim().toLocaleLowerCase();
  if (!needle) return true;
  return [document.number, document.title, document.customerName].some((value) =>
    value.toLocaleLowerCase().includes(needle),
  );
}

export function DocumentsPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [pendingDelete, setPendingDelete] = useState<DocumentSummary | null>(null);
  const deleteRef = useRef<HTMLDialogElement>(null);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const documentsQuery = useQuery({
    queryKey: ["documents"],
    queryFn: listDocuments,
  });

  const createMutation = useMutation({
    mutationFn: createDocument,
    onSuccess: (document) => {
      void queryClient.invalidateQueries({ queryKey: ["documents"] });
      navigate(`/documents/${document.id}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (document: DocumentSummary) => deleteDocument(document.id),
    onSuccess: (_result, deletedDocument) => {
      queryClient.setQueryData<DocumentSummary[]>(["documents"], (current) =>
        current?.filter((document) => document.id !== deletedDocument.id),
      );
      void queryClient.invalidateQueries({ queryKey: ["report"] });
      deleteRef.current?.close();
      setPendingDelete(null);
    },
  });

  useEffect(() => {
    if (pendingDelete && !deleteRef.current?.open) deleteRef.current?.showModal();
  }, [pendingDelete]);

  function openDeleteConfirmation(document: DocumentSummary) {
    deleteMutation.reset();
    setPendingDelete(document);
  }

  function closeDeleteConfirmation() {
    if (deleteMutation.isPending) return;
    deleteRef.current?.close();
    setPendingDelete(null);
  }

  const documents = useMemo(() => documentsQuery.data ?? [], [documentsQuery.data]);
  const visibleDocuments = useMemo(
    () =>
      documents.filter(
        (document) =>
          (status === "all" || document.status === status) && matchesSearch(document, search),
      ),
    [documents, search, status],
  );

  const finalizedCount = documents.filter((document) => document.status === "finalized").length;
  const draftCount = documents.length - finalizedCount;
  const filtering = Boolean(search.trim()) || status !== "all";

  return (
    <section className="ancillary-page" aria-labelledby="documents-title">
      <header className="ancillary-page-header">
        <div>
          <p className="ancillary-eyebrow">Document register</p>
          <h1 id="documents-title">Pricing documents</h1>
          <p className="ancillary-page-lede">
            Find a client document, continue a draft, or begin a new pricing record.
          </p>
        </div>
        <button
          className="ancillary-button ancillary-button-primary"
          type="button"
          onClick={() => createMutation.mutate()}
          disabled={createMutation.isPending}
        >
          {createMutation.isPending ? (
            <SpinnerGap className="ancillary-spinner" size={19} aria-hidden="true" />
          ) : (
            <Plus size={19} weight="bold" aria-hidden="true" />
          )}
          {createMutation.isPending ? "Creating…" : "New document"}
        </button>
      </header>

      {createMutation.isError ? (
        <div className="ancillary-notice ancillary-notice-error" role="alert">
          <p>{queryError(createMutation.error)}</p>
          <button type="button" onClick={() => createMutation.reset()}>
            Dismiss
          </button>
        </div>
      ) : null}

      <div className="document-overview" aria-label="Document counts">
        <p>
          <strong>{documents.length}</strong>
          <span>Total</span>
        </p>
        <p>
          <strong>{draftCount}</strong>
          <span>Drafts</span>
        </p>
        <p>
          <strong>{finalizedCount}</strong>
          <span>Finalized</span>
        </p>
      </div>

      <div className="document-toolbar">
        <label className="ancillary-search" htmlFor="document-search">
          <span className="ancillary-sr-only">Search documents</span>
          <MagnifyingGlass size={19} aria-hidden="true" />
          <input
            id="document-search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search number, title, or customer"
          />
        </label>

        <label className="ancillary-select-label" htmlFor="document-status">
          <span>Status</span>
          <select
            id="document-status"
            value={status}
            onChange={(event) => setStatus(event.target.value as StatusFilter)}
          >
            <option value="all">All documents</option>
            <option value="draft">Drafts</option>
            <option value="finalized">Finalized</option>
          </select>
        </label>
      </div>

      <div className="document-result-line" aria-live="polite">
        {documentsQuery.isSuccess ? (
          <span>
            Showing {visibleDocuments.length} of {documents.length} document
            {documents.length === 1 ? "" : "s"}
          </span>
        ) : (
          <span>&nbsp;</span>
        )}
        {filtering ? (
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setStatus("all");
            }}
          >
            Clear filters
          </button>
        ) : null}
      </div>

      {documentsQuery.isLoading ? (
        <div className="ancillary-state ancillary-loading-state" role="status" aria-live="polite">
          <SpinnerGap className="ancillary-spinner" size={26} aria-hidden="true" />
          <p>Gathering your documents…</p>
        </div>
      ) : null}

      {documentsQuery.isError ? (
        <div className="ancillary-state" role="alert">
          <FileText size={32} aria-hidden="true" />
          <h2>Documents are unavailable</h2>
          <p>{queryError(documentsQuery.error)}</p>
          <button
            className="ancillary-button ancillary-button-secondary"
            type="button"
            onClick={() => void documentsQuery.refetch()}
          >
            <ArrowClockwise size={18} aria-hidden="true" />
            Try again
          </button>
        </div>
      ) : null}

      {documentsQuery.isSuccess && visibleDocuments.length === 0 ? (
        <div className="ancillary-state">
          <FileText size={32} aria-hidden="true" />
          <h2>{filtering ? "No documents match" : "Your register is ready"}</h2>
          <p>
            {filtering
              ? "Try a different customer, document number, or status."
              : "Create the first pricing document for this workspace."}
          </p>
          {filtering ? (
            <button
              className="ancillary-button ancillary-button-secondary"
              type="button"
              onClick={() => {
                setSearch("");
                setStatus("all");
              }}
            >
              Clear filters
            </button>
          ) : (
            <button
              className="ancillary-button ancillary-button-primary"
              type="button"
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending}
            >
              <Plus size={18} aria-hidden="true" />
              New document
            </button>
          )}
        </div>
      ) : null}

      {documentsQuery.isSuccess && visibleDocuments.length > 0 ? (
        <div className="ancillary-table-wrap">
          <table className="ancillary-table document-table">
            <caption className="ancillary-sr-only">Pricing documents in this workspace</caption>
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
              {visibleDocuments.map((document) => (
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
                    <div className="document-row-actions">
                      <Link
                        className="ancillary-icon-link"
                        to={`/documents/${document.id}`}
                        aria-label={`Open ${document.number} for ${document.customerName}`}
                        title="Open document"
                      >
                        <ArrowUpRight size={19} aria-hidden="true" />
                      </Link>
                      <button
                        className="ancillary-icon-button ancillary-icon-button-danger"
                        type="button"
                        aria-label={`Delete ${document.number} for ${document.customerName}`}
                        title="Delete document"
                        onClick={() => openDeleteConfirmation(document)}
                      >
                        <Trash size={18} aria-hidden="true" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <dialog
        className="confirmation-dialog document-delete-dialog"
        ref={deleteRef}
        aria-labelledby="register-delete-title"
        onClose={() => {
          if (!deleteMutation.isPending) setPendingDelete(null);
        }}
      >
        <button
          className="icon-button dialog-close"
          type="button"
          aria-label="Close confirmation"
          onClick={closeDeleteConfirmation}
        >
          <X size={20} aria-hidden="true" />
        </button>
        <span className="dialog-icon danger"><Trash size={24} aria-hidden="true" /></span>
        <h2 id="register-delete-title">Delete this document?</h2>
        <p>
          This permanently removes the document from this workspace and cannot be undone.
        </p>
        {pendingDelete ? (
          <dl>
            <div><dt>Document</dt><dd>{pendingDelete.number}</dd></div>
            <div><dt>Status</dt><dd>{pendingDelete.status === "finalized" ? "Finalized" : "Draft"}</dd></div>
            <div><dt>Customer</dt><dd>{pendingDelete.customerName || "Not set"}</dd></div>
          </dl>
        ) : null}
        {deleteMutation.isError ? (
          <p className="dialog-error" role="alert">{queryError(deleteMutation.error)}</p>
        ) : null}
        <div className="dialog-actions">
          <button className="button secondary" type="button" onClick={closeDeleteConfirmation} disabled={deleteMutation.isPending}>
            Cancel
          </button>
          <button
            className="button danger"
            type="button"
            onClick={() => pendingDelete && deleteMutation.mutate(pendingDelete)}
            disabled={!pendingDelete || deleteMutation.isPending}
          >
            <Trash size={18} aria-hidden="true" />
            {deleteMutation.isPending ? "Deleting…" : "Delete permanently"}
          </button>
        </div>
      </dialog>
    </section>
  );
}
