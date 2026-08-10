import type {
  DocumentStatus,
  DocumentSummary,
  PricingDocument,
  ReportResponse,
  UpdateDocumentInput,
  User,
} from "../types";
import {
  buildFixtureDocuments,
  MOCK_ACCESS_TOKEN,
  MOCK_CREDENTIALS,
  MOCK_USER,
  type OwnedPricingDocument,
} from "./fixtures";
import {
  calculateDocument,
  PricingValidationError,
  sumTotals,
} from "./pricing";

export const MOCK_DATABASE_STORAGE_KEY = "pricing-calculator.mock-database.v1";

interface PersistedState {
  version: 1;
  documentSequence: number;
  mutationSequence: number;
  documents: OwnedPricingDocument[];
}

export class MockApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields?: Record<string, string>;

  constructor(
    status: number,
    code: string,
    message: string,
    fields?: Record<string, string>,
  ) {
    super(message);
    this.name = "MockApiError";
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function seedState(): PersistedState {
  return {
    version: 1,
    documentSequence: 4,
    mutationSequence: 0,
    documents: buildFixtureDocuments(),
  };
}

function browserStorage(): Storage | null {
  try {
    return typeof globalThis.localStorage === "undefined"
      ? null
      : globalThis.localStorage;
  } catch {
    return null;
  }
}

function loadState(): PersistedState {
  const storage = browserStorage();
  const serialized = storage?.getItem(MOCK_DATABASE_STORAGE_KEY);
  if (serialized) {
    try {
      const parsed = JSON.parse(serialized) as PersistedState;
      if (parsed.version === 1 && Array.isArray(parsed.documents)) {
        return parsed;
      }
    } catch {
      storage?.removeItem(MOCK_DATABASE_STORAGE_KEY);
    }
  }
  return seedState();
}

function documentSummary(document: PricingDocument): DocumentSummary {
  return {
    id: document.id,
    number: document.number,
    title: document.title,
    customerName: document.customerName,
    documentDate: document.documentDate,
    status: document.status,
    currency: document.currency,
    ...document.totals,
  };
}

function publicDocument(document: OwnedPricingDocument): PricingDocument {
  return clone({
    id: document.id,
    number: document.number,
    title: document.title,
    customerName: document.customerName,
    documentDate: document.documentDate,
    validUntil: document.validUntil,
    currency: document.currency,
    status: document.status,
    updatedAt: document.updatedAt,
    finalizedAt: document.finalizedAt,
    lines: document.lines,
    totals: document.totals,
  });
}

function assertIsoDate(value: string, field: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new MockApiError(422, "VALIDATION_ERROR", "The request is invalid.", {
      [field]: `${field} must use YYYY-MM-DD format.`,
    });
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value) {
    throw new MockApiError(422, "VALIDATION_ERROR", "The request is invalid.", {
      [field]: `${field} must be a real calendar date.`,
    });
  }
}

class MockStore {
  private state = loadState();

  reset(): void {
    browserStorage()?.removeItem(MOCK_DATABASE_STORAGE_KEY);
    this.state = seedState();
    this.persist();
  }

  private persist(): void {
    browserStorage()?.setItem(
      MOCK_DATABASE_STORAGE_KEY,
      JSON.stringify(this.state),
    );
  }

  private nextTimestamp(): string {
    const base = Date.parse("2026-08-10T10:00:00.000Z");
    const timestamp = new Date(
      base + this.state.mutationSequence * 60_000,
    ).toISOString();
    this.state.mutationSequence += 1;
    return timestamp;
  }

  private nextDocumentIdentity(): { id: string; number: string } {
    const sequence = this.state.documentSequence;
    this.state.documentSequence += 1;
    return {
      id: `document-northstar-${sequence.toString().padStart(3, "0")}`,
      number: `Q-2026-${sequence.toString().padStart(3, "0")}`,
    };
  }

  private findOwned(ownerId: string, documentId: string): OwnedPricingDocument {
    const document = this.state.documents.find(
      (candidate) =>
        candidate.id === documentId && candidate.ownerId === ownerId,
    );
    if (!document) {
      throw new MockApiError(
        404,
        "DOCUMENT_NOT_FOUND",
        "Document not found.",
      );
    }
    return document;
  }

  private validateAndCalculate(
    input: UpdateDocumentInput,
  ): ReturnType<typeof calculateDocument> {
    const fields: Record<string, string> = {};
    if (!input.title.trim()) fields.title = "Title is required.";
    if (!input.customerName.trim()) {
      fields.customerName = "Customer name is required.";
    }
    assertIsoDate(input.documentDate, "documentDate");
    assertIsoDate(input.validUntil, "validUntil");
    if (input.validUntil < input.documentDate) {
      fields.validUntil = "Valid until cannot be before the document date.";
    }

    input.lines.forEach((line, index) => {
      if (!line.name.trim()) fields[`lines.${index}.name`] = "Name is required.";
    });
    if (Object.keys(fields).length > 0) {
      throw new MockApiError(
        422,
        "VALIDATION_ERROR",
        "The request is invalid.",
        fields,
      );
    }

    const normalizedLines = input.lines.map((line, index) => ({
      ...line,
      id: line.id || `line-generated-${index + 1}`,
      position: index + 1,
    }));
    try {
      return calculateDocument(normalizedLines);
    } catch (error) {
      if (error instanceof PricingValidationError) {
        throw new MockApiError(
          422,
          "VALIDATION_ERROR",
          "The request is invalid.",
          { [error.field]: error.message },
        );
      }
      throw error;
    }
  }

  authenticate(email: string, password: string): User {
    if (
      email.trim().toLowerCase() !== MOCK_CREDENTIALS.email ||
      password !== MOCK_CREDENTIALS.password
    ) {
      throw new MockApiError(
        401,
        "INVALID_CREDENTIALS",
        "Email or password is incorrect.",
      );
    }
    return clone(MOCK_USER);
  }

  userForToken(token: string): User | null {
    return token === MOCK_ACCESS_TOKEN ? clone(MOCK_USER) : null;
  }

  list(ownerId: string): DocumentSummary[] {
    return this.state.documents
      .filter((document) => document.ownerId === ownerId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .map(documentSummary)
      .map(clone);
  }

  get(ownerId: string, documentId: string): PricingDocument {
    return publicDocument(this.findOwned(ownerId, documentId));
  }

  create(ownerId: string): PricingDocument {
    const identity = this.nextDocumentIdentity();
    const timestamp = this.nextTimestamp();
    const document: OwnedPricingDocument = {
      ...identity,
      ownerId,
      title: "Untitled pricing document",
      customerName: "",
      documentDate: "2026-08-10",
      validUntil: "2026-09-09",
      currency: "USD",
      status: "draft",
      updatedAt: timestamp,
      finalizedAt: null,
      lines: [],
      totals: {
        subtotal: "0.00",
        discount: "0.00",
        tax: "0.00",
        grandTotal: "0.00",
      },
    };
    this.state.documents.push(document);
    this.persist();
    return publicDocument(document);
  }

  update(
    ownerId: string,
    documentId: string,
    input: UpdateDocumentInput,
  ): PricingDocument {
    const existing = this.findOwned(ownerId, documentId);
    if (existing.status === "finalized") {
      throw new MockApiError(
        409,
        "DOCUMENT_FINALIZED",
        "Finalized documents are immutable.",
      );
    }

    const calculated = this.validateAndCalculate(input);
    Object.assign(existing, {
      title: input.title.trim(),
      customerName: input.customerName.trim(),
      documentDate: input.documentDate,
      validUntil: input.validUntil,
      lines: calculated.lines,
      totals: calculated.totals,
      updatedAt: this.nextTimestamp(),
    });
    this.persist();
    return publicDocument(existing);
  }

  finalize(ownerId: string, documentId: string): PricingDocument {
    const document = this.findOwned(ownerId, documentId);
    if (document.status === "finalized") return publicDocument(document);
    if (!document.title.trim() || !document.customerName.trim()) {
      throw new MockApiError(
        422,
        "DOCUMENT_INCOMPLETE",
        "Title and customer are required before finalization.",
      );
    }
    if (document.lines.length === 0) {
      throw new MockApiError(
        422,
        "DOCUMENT_HAS_NO_LINES",
        "Add at least one line item before finalization.",
      );
    }

    const calculated = calculateDocument(document.lines);
    const timestamp = this.nextTimestamp();
    Object.assign(document, {
      status: "finalized" as const,
      lines: calculated.lines,
      totals: calculated.totals,
      updatedAt: timestamp,
      finalizedAt: timestamp,
    });
    this.persist();
    return publicDocument(document);
  }

  duplicate(ownerId: string, documentId: string): PricingDocument {
    const source = this.findOwned(ownerId, documentId);
    if (source.status !== "finalized") {
      throw new MockApiError(
        409,
        "DOCUMENT_NOT_FINALIZED",
        "Only finalized documents can be duplicated.",
      );
    }

    const identity = this.nextDocumentIdentity();
    const calculated = calculateDocument(
      source.lines.map((line, index) => ({
        ...line,
        id: `${identity.id}-line-${index + 1}`,
        position: index + 1,
      })),
    );
    const duplicate: OwnedPricingDocument = {
      ...source,
      ...identity,
      ownerId,
      title: `${source.title} (copy)`,
      status: "draft",
      updatedAt: this.nextTimestamp(),
      finalizedAt: null,
      lines: calculated.lines,
      totals: calculated.totals,
    };
    this.state.documents.push(duplicate);
    this.persist();
    return publicDocument(duplicate);
  }

  report(
    ownerId: string,
    startDate: string,
    endDate: string,
    status: DocumentStatus | "all",
    customer: string,
  ): ReportResponse {
    assertIsoDate(startDate, "startDate");
    assertIsoDate(endDate, "endDate");
    if (startDate > endDate) {
      throw new MockApiError(
        422,
        "INVALID_DATE_RANGE",
        "Start date cannot be after end date.",
      );
    }

    const customerQuery = customer.trim().toLocaleLowerCase();
    const documents = this.state.documents
      .filter((document) => document.ownerId === ownerId)
      .filter(
        (document) =>
          document.documentDate >= startDate && document.documentDate <= endDate,
      )
      .filter((document) => status === "all" || document.status === status)
      .filter(
        (document) =>
          !customerQuery ||
          document.customerName.toLocaleLowerCase().includes(customerQuery),
      )
      .sort((left, right) => right.documentDate.localeCompare(left.documentDate));
    const totals = sumTotals(documents.map((document) => document.totals));

    return {
      startDate,
      endDate,
      status,
      customer,
      totals: { ...totals, documentCount: documents.length },
      documents: documents.map(documentSummary).map(clone),
    };
  }
}

export const mockStore = new MockStore();

export function resetMockState(): void {
  mockStore.reset();
}
