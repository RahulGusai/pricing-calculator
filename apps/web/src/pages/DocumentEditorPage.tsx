import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowLeft,
  CalendarBlank,
  Check,
  CheckCircle,
  Copy,
  DotsSixVertical,
  DotsThree,
  Eye,
  LockKey,
  PencilSimple,
  Plus,
  Trash,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  type ChangeEvent,
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
import {
  ApiClientError,
  deleteDocument,
  duplicateDocument,
  finalizeDocument,
  getCurrencyConfig,
  getDocument,
  updateDocument,
} from "../lib/api";
import { formatCurrencySymbol, formatDate, formatMoney } from "../lib/format";
import {
  type CurrencyCode,
  type LineWrite,
  type PricingDocument,
  type UpdateDocumentInput,
} from "../types";

const decimalPattern = /^\d+(?:\.\d{0,2})?$/;
const decimalEntryPattern = /^\d*(?:\.\d{0,2})?$/;
const DESCRIPTION_MAX_LENGTH = 240;

function toScaledDecimal(value: string): bigint {
  if (!decimalPattern.test(value)) return -1n;
  const [whole, fraction = ""] = value.split(".");
  return BigInt(`${whole}${fraction.padEnd(2, "0")}`);
}

const quantitySchema = z
  .string()
  .regex(decimalPattern, "Enter a valid quantity")
  .refine((value) => toScaledDecimal(value) >= 100n, "Quantity must be at least 1.00");
const moneySchema = z.string().regex(decimalPattern, "Enter a valid amount");
const rateSchema = moneySchema.refine(
  (value) => toScaledDecimal(value) <= 10_000n,
  "Use a rate from 0.00 through 100.00",
);

const lineSchema = z.object({
  id: z.string().min(1).optional().nullable(),
  name: z.string().trim().min(1, "Enter an item name"),
  description: z.string().max(
    DESCRIPTION_MAX_LENGTH,
    `Keep the description within ${DESCRIPTION_MAX_LENGTH} characters`,
  ),
  quantity: quantitySchema,
  unitPrice: moneySchema,
  discountType: z.enum(["none", "percentage", "fixed"]),
  discountValue: moneySchema,
  taxRate: rateSchema,
}).superRefine((line, context) => {
  if (line.discountType === "percentage" && toScaledDecimal(line.discountValue) > 10_000n) {
    context.addIssue({
      code: "custom",
      path: ["discountValue"],
      message: "Use a percentage from 0.00 through 100.00",
    });
  }
  if (line.discountType === "none" && toScaledDecimal(line.discountValue) !== 0n) {
    context.addIssue({
      code: "custom",
      path: ["discountValue"],
      message: "No-discount lines must use 0.00",
    });
  }
});

const documentSchema = z.object({
  title: z.string().trim().max(250),
  customerName: z.string().trim().max(250),
  documentDate: z.iso.date("Choose a valid date"),
  validUntil: z.iso.date("Choose a valid date"),
  currency: z.string().min(1, "Choose a currency"),
  lines: z.array(lineSchema),
}).refine((value) => value.validUntil >= value.documentDate, {
  path: ["validUntil"],
  message: "Valid until cannot be before document date",
});

type DocumentFormValues = z.infer<typeof documentSchema>;

function toFormValues(document: PricingDocument): DocumentFormValues {
  return {
    title: document.title,
    customerName: document.customerName,
    documentDate: document.documentDate,
    validUntil: document.validUntil,
    currency: document.currency,
    lines: document.lines.map(({ id, name, description, quantity, unitPrice, discountType, discountValue, taxRate }) => ({
      id,
      name,
      description,
      quantity,
      unitPrice,
      discountType,
      discountValue,
      taxRate,
    })),
  };
}

function toUpdateInput(values: DocumentFormValues): UpdateDocumentInput {
  const normalizeDecimal = (value: string) => value.endsWith(".") ? value.slice(0, -1) : value;

  return {
    ...values,
    currency: values.currency as CurrencyCode,
    lines: values.lines.map((line) => ({
      ...(line.id ? { id: line.id } : {}),
      name: line.name.trim(),
      description: line.description,
      quantity: normalizeDecimal(line.quantity),
      unitPrice: normalizeDecimal(line.unitPrice),
      discountType: line.discountType,
      discountValue: normalizeDecimal(line.discountValue),
      taxRate: normalizeDecimal(line.taxRate),
    })),
  };
}

function acceptDecimalEntry(
  event: ChangeEvent<HTMLInputElement>,
  currentValue: string,
  onAccepted: (event: ChangeEvent<HTMLInputElement>) => unknown,
): void {
  if (decimalEntryPattern.test(event.currentTarget.value)) {
    void onAccepted(event);
    return;
  }

  // React Hook Form intentionally keeps these inputs uncontrolled. Restore the
  // last accepted string immediately so a third fractional digit never appears.
  event.currentTarget.value = currentValue;
}

function newLine(): LineWrite {
  return {
    name: "New item",
    description: "",
    quantity: "1",
    unitPrice: "0.00",
    discountType: "none",
    discountValue: "0.00",
    taxRate: "0.00",
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

  const currenciesQuery = useQuery({
    queryKey: ["currency-config"],
    queryFn: getCurrencyConfig,
    staleTime: Infinity,
  });

  const form = useForm<DocumentFormValues>({
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
    mutationFn: (values: DocumentFormValues) => updateDocument(documentId, toUpdateInput(values)),
    onSuccess: (saved, submittedValues) => {
      queryClient.setQueryData(["document", documentId], saved);
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      const latestValues = form.getValues();
      const hasNewerEdits = JSON.stringify(latestValues) !== JSON.stringify(submittedValues);
      // Preserve only edits made after this request started. When the form still
      // matches the snapshot, reset it cleanly so autosave settles at "Saved".
      form.reset(toFormValues(saved), hasNewerEdits ? { keepDirtyValues: true } : undefined);
      setLastSavedAt(new Date());
      setNotice(null);
    },
    onError: (error) => {
      if (error instanceof ApiClientError) {
        Object.entries(error.body.error.fields ?? {}).forEach(([field, message]) => {
          form.setError(field as never, { type: "server", message });
        });
        if (error.status === 409 && error.body.error.code === "DOCUMENT_FINALIZED") {
          void queryClient.invalidateQueries({ queryKey: ["document", documentId] });
          void queryClient.refetchQueries({ queryKey: ["document", documentId] });
        }
      }
      setNotice(error instanceof Error ? error.message : "Could not save changes");
    },
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
    onError: (error) => {
      if (error instanceof ApiClientError) {
        Object.entries(error.body.error.fields ?? {}).forEach(([field, message]) => {
          form.setError(field as never, { type: "server", message });
        });
      }
      setNotice(error instanceof Error ? error.message : "Could not finalize document");
    },
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
  const isReadOnly = Boolean(isFinalized);
  const selectedCurrency = (watchedValues.currency ?? document?.currency ?? "USD") as CurrencyCode;
  const currencySymbol = formatCurrencySymbol(selectedCurrency);
  const availableCurrencies = currenciesQuery.data?.currencies ??
    (document ? [{ code: document.currency, minorUnit: 2 }] : []);

  useEffect(() => {
    if (!document || isReadOnly || !form.formState.isDirty || saveMutation.isPending) return;

    const timeout = window.setTimeout(() => {
      void form.trigger(undefined, { shouldFocus: false }).then((isValid) => {
        if (isValid) saveMutation.mutate(structuredClone(form.getValues()));
      });
    }, 850);
    return () => window.clearTimeout(timeout);
  }, [document, form, form.formState.isDirty, isReadOnly, saveMutation, watchedValues]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.shiftKey && event.key === "Enter" && !isReadOnly) {
        const target = event.target as HTMLElement;
        if (target.tagName === "TEXTAREA") return;
        event.preventDefault();
        append(newLine(), {
          shouldFocus: true,
          focusName: `lines.${fields.length}.name`,
        });
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
      result = await saveMutation.mutateAsync(structuredClone(values));
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
    <div className="editor-page">
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

        <div className="editor-toolbar-actions">
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
            <div className="document-title-identity">
              <span className="document-title-icon" aria-hidden="true">
                <PencilSimple size={20} weight="bold" />
              </span>
              <div className="document-title-field">
                {isReadOnly ? (
                  <h1>{form.getValues("title")}</h1>
                ) : (
                  <>
                    <label className="sr-only" htmlFor="document-title">Document title</label>
                    <input
                      id="document-title"
                      placeholder="e.g. Q3 implementation proposal"
                      {...form.register("title")}
                      aria-invalid={Boolean(form.formState.errors.title)}
                    />
                    {form.formState.errors.title && (
                      <small className="field-error">{form.formState.errors.title.message}</small>
                    )}
                  </>
                )}
              </div>
            </div>

            <div className="document-meta">
              <label>
                <span>Customer</span>
                {isReadOnly ? (
                  <strong>{form.getValues("customerName")}</strong>
                ) : (
                  <>
                    <input {...form.register("customerName")} aria-invalid={Boolean(form.formState.errors.customerName)} />
                    {form.formState.errors.customerName ? <small className="field-error">{form.formState.errors.customerName.message}</small> : null}
                  </>
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
                {form.formState.errors.documentDate ? <small className="field-error">{form.formState.errors.documentDate.message}</small> : null}
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
                {form.formState.errors.validUntil ? <small className="field-error">{form.formState.errors.validUntil.message}</small> : null}
              </label>
              <label>
                <span>Currency</span>
                {isReadOnly ? (
                  <strong>{form.getValues("currency")}</strong>
                ) : (
                  <select {...form.register("currency")} aria-label="Currency" disabled={currenciesQuery.isLoading}>
                    {availableCurrencies.map((currency) => (
                      <option key={currency.code} value={currency.code}>{currency.code}</option>
                    ))}
                  </select>
                )}
                {form.formState.errors.currency ? <small className="field-error">{form.formState.errors.currency.message}</small> : null}
              </label>
            </div>
          </section>

          <section className="line-items-section" aria-labelledby="line-items-title">
            <div className="section-heading-mobile">
              <h2 id="line-items-title">Line items</h2>
              <span>{fields.length} items</span>
            </div>
            <div
              className="line-items-grid"
              role="table"
              aria-label="Pricing line items"
            >
              <div className="line-header" role="row">
                <span role="columnheader" className="line-leading" />
                <span role="columnheader">Item / description</span>
                <span role="columnheader">Qty</span>
                <span role="columnheader">Unit price</span>
                <span role="columnheader">Discount</span>
                <span role="columnheader">Tax</span>
                <span role="columnheader">Line total</span>
                <span role="columnheader" />
              </div>

              {fields.map((field, index) => {
                const serverLine = field.id
                  ? document.lines.find((line) => line.id === field.id)
                  : undefined;
                const quantityRegistration = form.register(`lines.${index}.quantity`);
                const unitPriceRegistration = form.register(`lines.${index}.unitPrice`);
                const discountValueRegistration = form.register(`lines.${index}.discountValue`);
                const taxRateRegistration = form.register(`lines.${index}.taxRate`);
                const descriptionRegistration = form.register(`lines.${index}.description`);
                const lineErrors = form.formState.errors.lines?.[index];
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
                        <span className="readonly-line-value"><strong>{field.name}</strong><small>{field.description || "No description"}</small></span>
                      ) : (
                        <>
                          <div className="item-input-group">
                            <input aria-label={`Line ${index + 1} item name`} {...form.register(`lines.${index}.name`)} />
                            <textarea
                              className="description-input"
                              aria-label={`Line ${index + 1} description`}
                              placeholder="Add description"
                              rows={1}
                              maxLength={DESCRIPTION_MAX_LENGTH}
                              {...descriptionRegistration}
                              onChange={(event) => {
                                if (event.currentTarget.value.length > DESCRIPTION_MAX_LENGTH) {
                                  event.currentTarget.value = event.currentTarget.value.slice(
                                    0,
                                    DESCRIPTION_MAX_LENGTH,
                                  );
                                }
                                void descriptionRegistration.onChange(event);
                              }}
                              onInput={(event) => {
                                const target = event.currentTarget;
                                target.style.height = "34px";
                                target.style.height = `${Math.min(92, Math.max(34, target.scrollHeight))}px`;
                              }}
                            />
                          </div>
                          {lineErrors?.name ? <small className="field-error">{lineErrors.name.message}</small> : null}
                          {lineErrors?.description ? <small className="field-error">{lineErrors.description.message}</small> : null}
                        </>
                      )}
                    </div>

                    <div role="cell" data-label="Quantity">
                      {isReadOnly ? <span>{field.quantity}</span> : <>
                        <input
                          inputMode="decimal"
                          aria-label={`Line ${index + 1} quantity`}
                          {...quantityRegistration}
                          onChange={(event) => acceptDecimalEntry(
                            event,
                            form.getValues(`lines.${index}.quantity`),
                            quantityRegistration.onChange,
                          )}
                        />
                        {lineErrors?.quantity ? <small className="field-error">{lineErrors.quantity.message}</small> : null}
                      </>}
                    </div>

                    <div className="money-input" role="cell" data-label="Unit price">
                      {isReadOnly ? <span>{formatMoney(field.unitPrice, selectedCurrency)}</span> : <>
                        <span className="compound-control money-control">
                          <span aria-hidden="true">{currencySymbol}</span>
                          <input
                            inputMode="decimal"
                            aria-label={`Line ${index + 1} unit price`}
                            {...unitPriceRegistration}
                            onChange={(event) => acceptDecimalEntry(
                              event,
                              form.getValues(`lines.${index}.unitPrice`),
                              unitPriceRegistration.onChange,
                            )}
                          />
                        </span>
                        {lineErrors?.unitPrice ? <small className="field-error">{lineErrors.unitPrice.message}</small> : null}
                      </>}
                    </div>

                    <div className="discount-input" role="cell" data-label="Discount">
                      {isReadOnly ? (
                        <span>{field.discountType === "percentage" ? `${field.discountValue}%` : field.discountType === "fixed" ? formatMoney(field.discountValue, selectedCurrency) : "—"}</span>
                      ) : (
                        <>
                          <span className="compound-control discount-control">
                            <select
                              aria-label={`Line ${index + 1} discount type`}
                              {...form.register(`lines.${index}.discountType`, {
                                onChange: (event) => {
                                  if (event.target.value === "none") {
                                    form.setValue(`lines.${index}.discountValue`, "0.00", { shouldDirty: true });
                                  }
                                },
                              })}
                            >
                              <option value="none">—</option>
                              <option value="percentage">%</option>
                              <option value="fixed">{currencySymbol}</option>
                            </select>
                            <input
                              inputMode="decimal"
                              aria-label={`Line ${index + 1} discount value`}
                              disabled={form.getValues(`lines.${index}.discountType`) === "none"}
                              {...discountValueRegistration}
                              onChange={(event) => acceptDecimalEntry(
                                event,
                                form.getValues(`lines.${index}.discountValue`),
                                discountValueRegistration.onChange,
                              )}
                            />
                          </span>
                          {lineErrors?.discountValue ? <small className="field-error">{lineErrors.discountValue.message}</small> : null}
                        </>
                      )}
                    </div>

                    <div className="tax-input" role="cell" data-label="Tax">
                      {isReadOnly ? (
                        <span>{/^0+(?:\.0+)?$/.test(field.taxRate) ? "None" : `${field.taxRate}%`}</span>
                      ) : (
                        <>
                          <span className="compound-control rate-input">
                            <input
                              inputMode="decimal"
                              aria-label={`Line ${index + 1} tax rate`}
                              {...taxRateRegistration}
                              onChange={(event) => acceptDecimalEntry(
                                event,
                                form.getValues(`lines.${index}.taxRate`),
                                taxRateRegistration.onChange,
                              )}
                            />
                            <span aria-hidden="true">%</span>
                          </span>
                          {lineErrors?.taxRate ? <small className="field-error">{lineErrors.taxRate.message}</small> : null}
                        </>
                      )}
                    </div>

                    <strong className="line-total" role="cell" data-label="Line total">
                      {serverLine ? formatMoney(serverLine.grandTotal, document.currency) : "Save to calculate"}
                    </strong>

                    <div className="line-actions" role="cell">
                      {!isReadOnly && (
                        <details>
                          <summary aria-label={`Actions for line ${index + 1}`}><DotsThree size={22} weight="bold" /></summary>
                          <div>
                            <button type="button" onClick={() => remove(index)}>
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
                onClick={() => append(newLine(), {
                  shouldFocus: true,
                  focusName: `lines.${fields.length}.name`,
                })}
              >
                <span><Plus size={19} aria-hidden="true" /> Add line</span>
                <kbd>Shift</kbd><span>+</span><kbd>Enter</kbd>
              </button>
            )}
            {form.formState.errors.lines?.root?.message && (
              <p className="field-error">{form.formState.errors.lines.root.message}</p>
            )}
          </section>

        </form>

        <CalculationSummary document={document} />
      </div>

      <DocumentPreviewDialog ref={previewRef} document={document} />

      <dialog className="confirmation-dialog" ref={finalizeRef} aria-labelledby="finalize-title">
        <form method="dialog">
          <button className="icon-button dialog-close" aria-label="Close confirmation"><X size={20} /></button>
        </form>
        <span className="dialog-icon"><LockKey size={24} aria-hidden="true" /></span>
        <h2 id="finalize-title">Finalize this document?</h2>
        <p>
          Finalizing locks all pricing and customer details. You can still preview, print,
          or duplicate it into a new draft.
        </p>
        <dl>
          <div><dt>Document</dt><dd>{document.number}</dd></div>
          <div><dt>Grand total</dt><dd>{formatMoney(document.totals.grandTotal, document.currency)}</dd></div>
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
