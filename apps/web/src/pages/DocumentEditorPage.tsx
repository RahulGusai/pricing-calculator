import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowLeft,
  CalendarBlank,
  CaretDown,
  Check,
  CheckCircle,
  Columns,
  Copy,
  DotsSixVertical,
  DotsThree,
  Eye,
  Info,
  LockKey,
  Plus,
  Trash,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { Link, useNavigate, useParams } from "react-router-dom";
import { z } from "zod";

import { CalculationSummary } from "../components/CalculationSummary";
import { DocumentPreviewDialog } from "../components/DocumentPreviewDialog";
import { ModeSwitch } from "../components/ModeSwitch";
import { useWorkspaceMode } from "../context/ModeContext";
import {
  deleteDocument,
  duplicateDocument,
  finalizeDocument,
  getDocument,
  updateDocument,
} from "../lib/api";
import { formatCurrencySymbol, formatDate, formatMoney } from "../lib/format";
import {
  SUPPORTED_CURRENCIES,
  type LineItem,
  type PricingDocument,
  type UpdateDocumentInput,
} from "../types";

const decimalPattern = /^\d+(?:\.\d{1,4})?$/;
const moneyPattern = /^\d+(?:\.\d{1,2})?$/;

const lineSchema = z.object({
  id: z.string().min(1),
  position: z.number().int().positive(),
  name: z.string().trim().min(1, "Enter an item name"),
  description: z.string(),
  quantity: z.string().regex(decimalPattern, "Use a positive number with up to 4 decimals"),
  unitPrice: z.string().regex(moneyPattern, "Use an amount with up to 2 decimals"),
  discountType: z.enum(["none", "percentage", "fixed"]),
  discountValue: z.string().regex(moneyPattern, "Use a value with up to 2 decimals"),
  taxRate: z.string().regex(moneyPattern, "Use a rate with up to 2 decimals"),
  subtotal: z.string(),
  discount: z.string(),
  tax: z.string(),
  grandTotal: z.string(),
});

const documentSchema = z.object({
  title: z.string().trim().min(2, "Give this document a title"),
  customerName: z.string().trim().min(2, "Enter a customer name"),
  documentDate: z.iso.date("Choose a valid date"),
  validUntil: z.iso.date("Choose a valid date"),
  currency: z.enum(SUPPORTED_CURRENCIES),
  lines: z.array(lineSchema).min(1, "Add at least one line item"),
});

function toFormValues(document: PricingDocument): UpdateDocumentInput {
  return {
    title: document.title,
    customerName: document.customerName,
    documentDate: document.documentDate,
    validUntil: document.validUntil,
    currency: document.currency,
    lines: document.lines,
  };
}

function newLine(position: number): LineItem {
  return {
    id: crypto.randomUUID(),
    position,
    name: "New item",
    description: "",
    quantity: "1",
    unitPrice: "0.00",
    discountType: "none",
    discountValue: "0.00",
    taxRate: "0.00",
    subtotal: "0.00",
    discount: "0.00",
    tax: "0.00",
    grandTotal: "0.00",
  };
}

function EditorSkeleton() {
  return (
    <div className="editor-skeleton" role="status">
      <span className="sr-only">Loading pricing document</span>
      <div />
      <div />
      <div />
      <div />
    </div>
  );
}

export function DocumentEditorPage() {
  const { documentId = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { mode } = useWorkspaceMode();
  const [showDescription, setShowDescription] = useState(true);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const previewRef = useRef<HTMLDialogElement>(null);
  const finalizeRef = useRef<HTMLDialogElement>(null);
  const deleteRef = useRef<HTMLDialogElement>(null);
  const initializedDocument = useRef<string | null>(null);

  const documentQuery = useQuery({
    queryKey: ["document", documentId],
    queryFn: () => getDocument(documentId),
    enabled: Boolean(documentId),
  });

  const form = useForm<UpdateDocumentInput>({
    resolver: zodResolver(documentSchema),
    mode: "onBlur",
    defaultValues: {
      title: "",
      customerName: "",
      documentDate: "",
      validUntil: "",
      currency: "USD",
      lines: [],
    },
  });

  const { fields, append, remove, move } = useFieldArray({
    control: form.control,
    name: "lines",
    keyName: "formKey",
  });
  const watchedValues = useWatch({ control: form.control });

  useEffect(() => {
    if (documentQuery.data && initializedDocument.current !== documentQuery.data.id) {
      form.reset(toFormValues(documentQuery.data));
      initializedDocument.current = documentQuery.data.id;
      setLastSavedAt(new Date(documentQuery.data.updatedAt));
    }
  }, [documentQuery.data, form]);

  const saveMutation = useMutation({
    mutationFn: (values: UpdateDocumentInput) => updateDocument(documentId, values),
    onSuccess: (saved) => {
      queryClient.setQueryData(["document", documentId], saved);
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      form.reset(toFormValues(saved), { keepValues: true });
      setLastSavedAt(new Date());
      setNotice(null);
    },
    onError: (error) => setNotice(error instanceof Error ? error.message : "Could not save changes"),
  });

  const finalizeMutation = useMutation({
    mutationFn: () => finalizeDocument(documentId),
    onSuccess: (finalized) => {
      queryClient.setQueryData(["document", documentId], finalized);
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      queryClient.invalidateQueries({ queryKey: ["report"] });
      form.reset(toFormValues(finalized));
      finalizeRef.current?.close();
      setNotice("Document finalized. Editing is now locked.");
    },
    onError: (error) => setNotice(error instanceof Error ? error.message : "Could not finalize document"),
  });

  const duplicateMutation = useMutation({
    mutationFn: () => duplicateDocument(documentId),
    onSuccess: (copy) => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      navigate(`/documents/${copy.id}`);
    },
    onError: (error) => setNotice(error instanceof Error ? error.message : "Could not duplicate document"),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteDocument(documentId),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: ["document", documentId] });
      void queryClient.invalidateQueries({ queryKey: ["documents"] });
      void queryClient.invalidateQueries({ queryKey: ["report"] });
      deleteRef.current?.close();
      navigate("/documents");
    },
    onError: (error) => setNotice(error instanceof Error ? error.message : "Could not delete document"),
  });

  const document = documentQuery.data;
  const isFinalized = document?.status === "finalized";
  const isReading = mode === "reading";
  const isReadOnly = Boolean(isFinalized || isReading);
  const selectedCurrency = watchedValues.currency ?? document?.currency ?? "USD";
  const currencySymbol = formatCurrencySymbol(selectedCurrency);

  useEffect(() => {
    if (!document || isReadOnly || !form.formState.isDirty || saveMutation.isPending) return;

    const timeout = window.setTimeout(() => {
      void form.handleSubmit((values) => saveMutation.mutate(values))();
    }, 850);
    return () => window.clearTimeout(timeout);
  }, [document, form, form.formState.isDirty, isReadOnly, saveMutation, watchedValues]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.shiftKey && event.key === "Enter" && !isReadOnly) {
        const target = event.target as HTMLElement;
        if (target.tagName === "TEXTAREA") return;
        event.preventDefault();
        append(newLine(fields.length + 1), { shouldFocus: true });
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [append, fields.length, isReadOnly]);

  const saveLabel = useMemo(() => {
    if (saveMutation.isPending) return "Saving changes…";
    if (form.formState.isDirty) return "Changes pending";
    if (!lastSavedAt) return "Saved";
    return "Saved just now";
  }, [form.formState.isDirty, lastSavedAt, saveMutation.isPending]);

  async function saveCurrent() {
    if (!form.formState.isDirty || isFinalized) return document;
    let result: PricingDocument | undefined;
    await form.handleSubmit(async (values) => {
      result = await saveMutation.mutateAsync(values);
    })();
    return result;
  }

  async function openPreview() {
    const saved = await saveCurrent();
    if (saved || document) previewRef.current?.showModal();
  }

  async function confirmFinalize() {
    const saved = await saveCurrent();
    if (!saved && form.formState.isDirty) return;
    await finalizeMutation.mutateAsync();
  }

  function reorderLine(from: number, to: number) {
    if (to < 0 || to >= fields.length) return;
    move(from, to);
    window.requestAnimationFrame(() => {
      form.getValues("lines").forEach((_line, index) => {
        form.setValue(`lines.${index}.position`, index + 1, { shouldDirty: true });
      });
    });
  }

  if (documentQuery.isLoading) return <EditorSkeleton />;

  if (documentQuery.isError || !document) {
    return (
      <section className="route-error">
        <WarningCircle size={34} aria-hidden="true" />
        <h1>We couldn’t open that document</h1>
        <p>{documentQuery.error instanceof Error ? documentQuery.error.message : "Try again."}</p>
        <Link className="button secondary" to="/documents">Back to documents</Link>
      </section>
    );
  }

  return (
    <div className={`editor-page ${isReading ? "is-reading" : ""}`}>
      <header className="editor-toolbar">
        <div className="editor-toolbar-context">
          <Link to="/documents" className="mobile-back" aria-label="Back to documents">
            <ArrowLeft size={20} aria-hidden="true" />
          </Link>
          <nav aria-label="Breadcrumb">
            <Link to="/documents">Documents</Link>
            <span aria-hidden="true">/</span>
            <strong>{document.title}</strong>
          </nav>
          <div className="document-state">
            <span className={`status-badge ${document.status}`}>
              {isFinalized && <LockKey size={14} aria-hidden="true" />}
              {isFinalized ? "Finalized" : "Draft"}
            </span>
            <span className="save-state" aria-live="polite">
              {saveMutation.isPending ? (
                <span className="save-spinner" aria-hidden="true" />
              ) : (
                <CheckCircle size={18} aria-hidden="true" />
              )}
              {saveLabel}
            </span>
          </div>
        </div>

        <ModeSwitch />

        <div className="editor-toolbar-actions">
          {!isReading && !isFinalized && (
            <details className="columns-menu">
              <summary className="button quiet">
                <Columns size={18} aria-hidden="true" />
                Columns
                <CaretDown size={14} aria-hidden="true" />
              </summary>
              <div>
                <label>
                  <input
                    type="checkbox"
                    checked={showDescription}
                    onChange={(event) => setShowDescription(event.target.checked)}
                  />
                  Description
                </label>
                <label><input type="checkbox" checked readOnly /> Discount</label>
                <label><input type="checkbox" checked readOnly /> Tax</label>
              </div>
            </details>
          )}
          <button
            type="button"
            className="button secondary"
            aria-label="Preview"
            onClick={() => void openPreview()}
            disabled={saveMutation.isPending}
          >
            <Eye size={18} aria-hidden="true" />
            <span>Preview</span>
          </button>
          {!isReading && (
            <button
              type="button"
              className="button danger-outline"
              aria-label="Delete document"
              onClick={() => deleteRef.current?.showModal()}
              disabled={deleteMutation.isPending}
            >
              <Trash size={18} aria-hidden="true" />
              <span>Delete</span>
            </button>
          )}
          {isFinalized ? (
            <button
              type="button"
              className="button primary"
              aria-label="Duplicate"
              onClick={() => duplicateMutation.mutate()}
              disabled={duplicateMutation.isPending}
            >
              <Copy size={18} aria-hidden="true" />
              <span>Duplicate</span>
            </button>
          ) : (
            !isReading && (
              <button
                type="button"
                className="button primary"
                aria-label="Finalize"
                onClick={() => finalizeRef.current?.showModal()}
                disabled={saveMutation.isPending || finalizeMutation.isPending}
              >
                <Check size={18} weight="bold" aria-hidden="true" />
                <span>Finalize</span>
              </button>
            )
          )}
        </div>
      </header>

      {notice && (
        <div className={notice.includes("finalized") ? "notice success" : "notice"} role="status">
          {notice.includes("finalized") ? <CheckCircle size={18} /> : <WarningCircle size={18} />}
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss message">
            <X size={17} aria-hidden="true" />
          </button>
        </div>
      )}

      <div className="editor-workspace">
        <form className="document-sheet" onSubmit={(event) => event.preventDefault()}>
          <section className="document-heading">
            {isReadOnly ? (
              <h1>{form.getValues("title")}</h1>
            ) : (
              <div>
                <label className="sr-only" htmlFor="document-title">Document title</label>
                <textarea
                  id="document-title"
                  rows={1}
                  {...form.register("title")}
                  aria-invalid={Boolean(form.formState.errors.title)}
                />
                {form.formState.errors.title && (
                  <small className="field-error">{form.formState.errors.title.message}</small>
                )}
              </div>
            )}

            <div className="document-meta">
              <label>
                <span>Customer</span>
                {isReadOnly ? (
                  <strong>{form.getValues("customerName")}</strong>
                ) : (
                  <input {...form.register("customerName")} aria-invalid={Boolean(form.formState.errors.customerName)} />
                )}
              </label>
              <label>
                <span>Document date</span>
                {isReadOnly ? (
                  <strong>{formatDate(form.getValues("documentDate"))}</strong>
                ) : (
                  <span className="date-input">
                    <input type="date" {...form.register("documentDate")} />
                    <CalendarBlank size={17} aria-hidden="true" />
                  </span>
                )}
              </label>
              <label>
                <span>Document status</span>
                <strong>{isFinalized ? "Finalized" : "Draft"}</strong>
              </label>
              <label>
                <span>Valid until</span>
                {isReadOnly ? (
                  <strong>{formatDate(form.getValues("validUntil"))}</strong>
                ) : (
                  <span className="date-input">
                    <input type="date" {...form.register("validUntil")} />
                    <CalendarBlank size={17} aria-hidden="true" />
                  </span>
                )}
              </label>
              <label>
                <span>Currency</span>
                {isReadOnly ? (
                  <strong>{form.getValues("currency")}</strong>
                ) : (
                  <select {...form.register("currency")} aria-label="Currency">
                    {SUPPORTED_CURRENCIES.map((currency) => (
                      <option key={currency} value={currency}>{currency}</option>
                    ))}
                  </select>
                )}
              </label>
            </div>
          </section>

          <section className="line-items-section" aria-labelledby="line-items-title">
            <div className="section-heading-mobile">
              <h2 id="line-items-title">Line items</h2>
              <span>{fields.length} items</span>
            </div>
            <div
              className={`line-items-grid ${showDescription ? "with-description" : "without-description"}`}
              role="table"
              aria-label="Pricing line items"
            >
              <div className="line-header" role="row">
                <span role="columnheader" className="line-leading" />
                <span role="columnheader">Item{showDescription && <small>Description</small>}</span>
                <span role="columnheader">Qty</span>
                <span role="columnheader">Unit price</span>
                <span role="columnheader">Discount</span>
                <span role="columnheader">Tax</span>
                <span role="columnheader">Line total</span>
                <span role="columnheader" />
              </div>

              {fields.map((field, index) => {
                const serverLine = document.lines.find((line) => line.id === field.id) ?? field;
                return (
                  <div className="line-row" role="row" key={field.formKey}>
                    <div className="line-leading" role="cell">
                      {!isReadOnly && (
                        <details className="reorder-menu">
                          <summary aria-label={`Reorder line ${index + 1}`}>
                            <DotsSixVertical size={20} aria-hidden="true" />
                          </summary>
                          <div>
                            <button type="button" disabled={index === 0} onClick={() => reorderLine(index, index - 1)}>Move up</button>
                            <button type="button" disabled={index === fields.length - 1} onClick={() => reorderLine(index, index + 1)}>Move down</button>
                          </div>
                        </details>
                      )}
                      <span>{index + 1}</span>
                    </div>

                    <div className="item-cell" role="cell" data-label="Item">
                      {isReadOnly ? (
                        <span className="readonly-line-value"><strong>{field.name}</strong>{showDescription && <small>{field.description || "No description"}</small>}</span>
                      ) : (
                        <>
                          <input aria-label={`Line ${index + 1} item name`} {...form.register(`lines.${index}.name`)} />
                          {showDescription && <input className="description-input" aria-label={`Line ${index + 1} description`} placeholder="Add description" {...form.register(`lines.${index}.description`)} />}
                        </>
                      )}
                    </div>

                    <div role="cell" data-label="Quantity">
                      {isReadOnly ? <span>{field.quantity}</span> : <input inputMode="decimal" aria-label={`Line ${index + 1} quantity`} {...form.register(`lines.${index}.quantity`)} />}
                    </div>

                    <div className="money-input" role="cell" data-label="Unit price">
                      {isReadOnly ? <span>{formatMoney(field.unitPrice, selectedCurrency)}</span> : <><span aria-hidden="true">{currencySymbol}</span><input inputMode="decimal" aria-label={`Line ${index + 1} unit price`} {...form.register(`lines.${index}.unitPrice`)} /></>}
                    </div>

                    <div className="discount-input" role="cell" data-label="Discount">
                      {isReadOnly ? (
                        <span>{field.discountType === "percentage" ? `${field.discountValue}%` : field.discountType === "fixed" ? formatMoney(field.discountValue, selectedCurrency) : "—"}</span>
                      ) : (
                        <>
                          <select aria-label={`Line ${index + 1} discount type`} {...form.register(`lines.${index}.discountType`)}>
                            <option value="none">—</option>
                            <option value="percentage">%</option>
                            <option value="fixed">{currencySymbol}</option>
                          </select>
                          <input inputMode="decimal" aria-label={`Line ${index + 1} discount value`} disabled={form.getValues(`lines.${index}.discountType`) === "none"} {...form.register(`lines.${index}.discountValue`)} />
                        </>
                      )}
                    </div>

                    <div role="cell" data-label="Tax">
                      {isReadOnly ? (
                        <span>{Number(field.taxRate) ? `${field.taxRate}%` : "None"}</span>
                      ) : (
                        <select aria-label={`Line ${index + 1} tax rate`} {...form.register(`lines.${index}.taxRate`)}>
                          <option value="0.00">None</option>
                          <option value="5.00">5%</option>
                          <option value="10.00">10%</option>
                          <option value="18.00">18%</option>
                        </select>
                      )}
                    </div>

                    <strong className="line-total" role="cell" data-label="Line total">
                      {formatMoney(serverLine.grandTotal, selectedCurrency)}
                    </strong>

                    <div className="line-actions" role="cell">
                      {!isReadOnly && (
                        <details>
                          <summary aria-label={`Actions for line ${index + 1}`}><DotsThree size={22} weight="bold" /></summary>
                          <div>
                            <button type="button" onClick={() => remove(index)} disabled={fields.length === 1}>
                              <Trash size={16} aria-hidden="true" /> Delete line
                            </button>
                          </div>
                        </details>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {!isReadOnly && (
              <button
                type="button"
                className="add-line-button"
                onClick={() => append(newLine(fields.length + 1), { shouldFocus: true })}
              >
                <span><Plus size={19} aria-hidden="true" /> Add line</span>
                <kbd>Shift</kbd><span>+</span><kbd>Enter</kbd>
              </button>
            )}
            {form.formState.errors.lines?.root?.message && (
              <p className="field-error">{form.formState.errors.lines.root.message}</p>
            )}
          </section>

          {!isReading && (
            <aside className="calculation-help">
              <Info size={23} aria-hidden="true" />
              <div>
                <strong>Discounts and tax</strong>
                <p>Percentage discounts apply to each line subtotal. Fixed discounts are removed from the line before tax.</p>
              </div>
            </aside>
          )}
        </form>

        <CalculationSummary document={{ ...document, currency: selectedCurrency }} />
      </div>

      <DocumentPreviewDialog ref={previewRef} document={{ ...document, currency: selectedCurrency }} />

      <dialog className="confirmation-dialog" ref={finalizeRef} aria-labelledby="finalize-title">
        <form method="dialog">
          <button className="icon-button dialog-close" aria-label="Close confirmation"><X size={20} /></button>
        </form>
        <span className="dialog-icon"><LockKey size={24} aria-hidden="true" /></span>
        <h2 id="finalize-title">Finalize this document?</h2>
        <p>
          Finalizing locks all pricing and customer details. You can still preview, export,
          or duplicate it into a new draft.
        </p>
        <dl>
          <div><dt>Document</dt><dd>{document.number}</dd></div>
          <div><dt>Grand total</dt><dd>{formatMoney(document.totals.grandTotal, selectedCurrency)}</dd></div>
        </dl>
        <div className="dialog-actions">
          <form method="dialog"><button className="button secondary">Keep editing</button></form>
          <button
            type="button"
            className="button primary"
            onClick={() => void confirmFinalize()}
            disabled={finalizeMutation.isPending || saveMutation.isPending}
          >
            {finalizeMutation.isPending ? "Finalizing…" : "Finalize document"}
          </button>
        </div>
      </dialog>

      <dialog className="confirmation-dialog" ref={deleteRef} aria-labelledby="delete-title">
        <form method="dialog">
          <button className="icon-button dialog-close" aria-label="Close confirmation"><X size={20} /></button>
        </form>
        <span className="dialog-icon danger"><Trash size={24} aria-hidden="true" /></span>
        <h2 id="delete-title">Delete this document?</h2>
        <p>
          This permanently removes the {isFinalized ? "finalized document" : "draft"} from this
          workspace and cannot be undone.
        </p>
        <dl>
          <div><dt>Document</dt><dd>{document.number}</dd></div>
          <div><dt>Status</dt><dd>{isFinalized ? "Finalized" : "Draft"}</dd></div>
          <div><dt>Customer</dt><dd>{document.customerName || "Not set"}</dd></div>
        </dl>
        <div className="dialog-actions">
          <form method="dialog"><button className="button secondary" disabled={deleteMutation.isPending}>Cancel</button></form>
          <button
            type="button"
            className="button danger"
            onClick={() => deleteMutation.mutate()}
            disabled={deleteMutation.isPending}
          >
            <Trash size={18} aria-hidden="true" />
            {deleteMutation.isPending ? "Deleting…" : "Delete permanently"}
          </button>
        </div>
      </dialog>
    </div>
  );
}
