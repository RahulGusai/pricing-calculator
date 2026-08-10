import { beforeEach, describe, expect, it } from "vitest";

import {
  MOCK_CREDENTIALS,
  SAMPLE_DOCUMENT_ID,
  SECOND_TENANT_DOCUMENT_ID,
} from "../mocks/fixtures";
import {
  MOCK_DATABASE_STORAGE_KEY,
  resetMockState,
} from "../mocks/store";
import {
  createDocument,
  duplicateDocument,
  finalizeDocument,
  getDocument,
  getReport,
  getSession,
  listDocuments,
  signIn,
  signOut,
  updateDocument,
} from "./api";

async function authenticate(): Promise<void> {
  await signIn(MOCK_CREDENTIALS.email, MOCK_CREDENTIALS.password);
}

beforeEach(() => {
  globalThis.localStorage.clear();
  resetMockState();
});

describe("mock-first API boundary", () => {
  it("requires authentication for document data", async () => {
    await expect(listDocuments()).rejects.toMatchObject({
      status: 401,
      body: { error: { code: "AUTHENTICATION_REQUIRED" } },
    });
  });

  it("establishes, restores, and clears a bearer session", async () => {
    expect(await getSession()).toBeNull();

    const signedIn = await signIn(
      MOCK_CREDENTIALS.email,
      MOCK_CREDENTIALS.password,
    );
    expect(signedIn.user.email).toBe(MOCK_CREDENTIALS.email);
    await expect(getSession()).resolves.toEqual(signedIn);

    await signOut();
    expect(await getSession()).toBeNull();
  });

  it("returns a stable error envelope for invalid credentials", async () => {
    await expect(signIn(MOCK_CREDENTIALS.email, "wrong-password")).rejects.toMatchObject({
      status: 401,
      body: { error: { code: "INVALID_CREDENTIALS" } },
    });
  });

  it("lists only the current owner's deterministic documents", async () => {
    await authenticate();

    const documents = await listDocuments();
    expect(documents).toHaveLength(3);
    expect(documents.map((document) => document.id)).not.toContain(
      SECOND_TENANT_DOCUMENT_ID,
    );

    const sample = await getDocument(SAMPLE_DOCUMENT_ID);
    expect(sample).not.toHaveProperty("ownerId");
    expect(sample.totals).toEqual({
      subtotal: "450.00",
      discount: "40.00",
      tax: "11.50",
      grandTotal: "421.50",
    });
    await expect(getDocument(SECOND_TENANT_DOCUMENT_ID)).rejects.toMatchObject({
      status: 404,
      body: { error: { code: "DOCUMENT_NOT_FOUND" } },
    });
  });

  it("creates a draft and persists mutations to browser storage", async () => {
    await authenticate();
    const created = await createDocument();

    expect(created.status).toBe("draft");
    expect(created.lines).toEqual([]);
    expect(created.totals.grandTotal).toBe("0.00");
    const persisted = globalThis.localStorage.getItem(
      MOCK_DATABASE_STORAGE_KEY,
    );
    expect(persisted).toContain(created.id);
  });

  it("atomically replaces lines, finalizes, and rejects later mutation", async () => {
    await authenticate();
    const original = await getDocument(SAMPLE_DOCUMENT_ID);
    const updated = await updateDocument(SAMPLE_DOCUMENT_ID, {
      title: "Revised multi-rate proposal",
      customerName: original.customerName,
      documentDate: original.documentDate,
      validUntil: original.validUntil,
      lines: original.lines,
    });
    expect(updated.title).toBe("Revised multi-rate proposal");
    expect(updated.totals.grandTotal).toBe("421.50");

    const finalized = await finalizeDocument(SAMPLE_DOCUMENT_ID);
    expect(finalized.status).toBe("finalized");
    expect(finalized.finalizedAt).not.toBeNull();

    const invalidUpdate = {
      title: "This must not be persisted",
      customerName: finalized.customerName,
      documentDate: finalized.documentDate,
      validUntil: finalized.validUntil,
      lines: finalized.lines,
    };
    await expect(
      updateDocument(SAMPLE_DOCUMENT_ID, invalidUpdate),
    ).rejects.toEqual(
      expect.objectContaining({
        status: 409,
        body: expect.objectContaining({
          error: expect.objectContaining({ code: "DOCUMENT_FINALIZED" }),
        }),
      }),
    );
    expect((await getDocument(SAMPLE_DOCUMENT_ID)).title).toBe(
      "Revised multi-rate proposal",
    );
  });

  it("does not partially persist an invalid nested line replacement", async () => {
    await authenticate();
    const original = await getDocument(SAMPLE_DOCUMENT_ID);
    const invalidLines = original.lines.map((line, index) =>
      index === 0
        ? {
            ...line,
            discountType: "fixed" as const,
            discountValue: "999.00",
          }
        : line,
    );

    await expect(
      updateDocument(SAMPLE_DOCUMENT_ID, {
        title: "A title that must not persist",
        customerName: original.customerName,
        documentDate: original.documentDate,
        validUntil: original.validUntil,
        lines: invalidLines,
      }),
    ).rejects.toMatchObject({
      status: 422,
      body: { error: { code: "VALIDATION_ERROR" } },
    });

    const unchanged = await getDocument(SAMPLE_DOCUMENT_ID);
    expect(unchanged.title).toBe(original.title);
    expect(unchanged.totals).toEqual(original.totals);
  });

  it("duplicates a finalized document into an independent draft", async () => {
    await authenticate();
    const finalized = await finalizeDocument(SAMPLE_DOCUMENT_ID);
    const duplicate = await duplicateDocument(finalized.id);

    expect(duplicate.id).not.toBe(finalized.id);
    expect(duplicate.status).toBe("draft");
    expect(duplicate.finalizedAt).toBeNull();
    expect(duplicate.totals).toEqual(finalized.totals);
    expect(duplicate.lines.map((line) => line.id)).not.toEqual(
      finalized.lines.map((line) => line.id),
    );
  });

  it("uses inclusive report bounds and applies status/customer filters", async () => {
    await authenticate();

    const boundaryReport = await getReport({
      startDate: "2026-08-06",
      endDate: "2026-08-06",
      status: "all",
      customer: "",
    });
    expect(boundaryReport.totals.documentCount).toBe(1);
    expect(boundaryReport.documents[0]?.id).toBe(SAMPLE_DOCUMENT_ID);
    expect(boundaryReport.totals.grandTotal).toBe("421.50");

    const acmeReport = await getReport({
      startDate: "2026-06-15",
      endDate: "2026-08-06",
      status: "all",
      customer: "acme",
    });
    expect(acmeReport.totals).toEqual({
      documentCount: 2,
      subtotal: "1650.00",
      discount: "140.00",
      tax: "11.50",
      grandTotal: "1521.50",
    });

    const finalizedOnly = await getReport({
      startDate: "2026-06-15",
      endDate: "2026-08-06",
      status: "finalized",
      customer: "Acme",
    });
    expect(finalizedOnly.totals.documentCount).toBe(1);
    expect(finalizedOnly.documents[0]?.status).toBe("finalized");
  });
});
