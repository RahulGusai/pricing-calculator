import { beforeEach, describe, expect, it } from "vitest";

import {
  MOCK_CREDENTIALS,
  SAMPLE_DOCUMENT_ID,
  SECOND_TENANT_DOCUMENT_ID,
} from "../mocks/fixtures";
import { resetMockState } from "../mocks/store";
import {
  createDocument,
  deleteDocument,
  duplicateDocument,
  finalizeDocument,
  getDocument,
  getReport,
  getSession,
  listDocuments,
  resetApiClientSession,
  signIn,
  signOut,
  updateDocument,
} from "./api";

async function authenticate(): Promise<void> {
  await signIn(MOCK_CREDENTIALS.email, MOCK_CREDENTIALS.password);
}

function inputFromDocument(document: Awaited<ReturnType<typeof getDocument>>) {
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

beforeEach(() => {
  resetApiClientSession();
  resetMockState();
});

describe("replaceable API boundary", () => {
  it("requires a cookie-backed session for document data", async () => {
    await expect(listDocuments()).rejects.toMatchObject({
      status: 401,
      body: { error: { code: "AUTHENTICATION_REQUIRED" } },
    });
  });

  it("restores the session and sends CSRF protection for unsafe requests", async () => {
    expect(await getSession()).toBeNull();
    const signedIn = await signIn(MOCK_CREDENTIALS.email, MOCK_CREDENTIALS.password);
    expect(signedIn.user.email).toBe(MOCK_CREDENTIALS.email);
    expect(signedIn.csrfToken).toBeTruthy();
    await expect(getSession()).resolves.toEqual(expect.objectContaining({ user: signedIn.user }));

    await expect(createDocument()).resolves.toMatchObject({ status: "draft" });
    await signOut();
    expect(await getSession()).toBeNull();
  });

  it("does not expose another owner's document", async () => {
    await authenticate();
    const documents = await listDocuments();
    expect(documents.map((document) => document.id)).not.toContain(SECOND_TENANT_DOCUMENT_ID);
    await expect(getDocument(SECOND_TENANT_DOCUMENT_ID)).rejects.toMatchObject({ status: 404 });
  });

  it("creates an incomplete draft and only writes input fields", async () => {
    await authenticate();
    const created = await createDocument({ currency: "INR" });
    expect(created).toMatchObject({ status: "draft", currency: "INR", lines: [] });
    expect(created.totals.grandTotal).toBe("0.00");
  });

  it.each([
    ["draft", SAMPLE_DOCUMENT_ID],
    ["finalized", "document-finalized-002"],
  ])("permanently deletes an owned %s document after confirmation", async (_status, documentId) => {
    await authenticate();
    await deleteDocument(documentId);
    await expect(getDocument(documentId)).rejects.toMatchObject({ status: 404 });
  });

  it("calculates on the service, finalizes, and rejects later mutation", async () => {
    await authenticate();
    const original = await getDocument(SAMPLE_DOCUMENT_ID);
    const updated = await updateDocument(SAMPLE_DOCUMENT_ID, {
      ...inputFromDocument(original),
      title: "Revised multi-rate proposal",
    });
    expect(updated.totals.grandTotal).toBe("421.50");

    const finalized = await finalizeDocument(SAMPLE_DOCUMENT_ID);
    await expect(updateDocument(SAMPLE_DOCUMENT_ID, inputFromDocument(finalized))).rejects.toMatchObject({
      status: 409,
      body: { error: { code: "DOCUMENT_FINALIZED" } },
    });
  });

  it("keeps report totals in separate currency groups", async () => {
    await authenticate();
    const original = await getDocument(SAMPLE_DOCUMENT_ID);
    await updateDocument(SAMPLE_DOCUMENT_ID, {
      ...inputFromDocument(original),
      currency: "INR",
    });

    const report = await getReport({
      startDate: "2026-06-15",
      endDate: "2026-08-06",
      status: "all",
    });
    expect(report.documentCount).toBe(3);
    expect(report.currencyTotals.map((total) => total.currency)).toEqual([
      "AED",
      "INR",
      "USD",
    ]);
    expect(report).not.toHaveProperty("totals");
  });

  it("duplicates a finalized document into an independent draft", async () => {
    await authenticate();
    const finalized = await finalizeDocument(SAMPLE_DOCUMENT_ID);
    const duplicate = await duplicateDocument(finalized.id);
    expect(duplicate.status).toBe("draft");
    expect(duplicate.lines.map((line) => line.id)).not.toEqual(finalized.lines.map((line) => line.id));
  });
});
