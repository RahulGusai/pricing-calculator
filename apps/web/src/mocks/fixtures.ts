import type { LineItem, PricingDocument, User } from "../types";
import { calculateDocument } from "./pricing";

export interface OwnedPricingDocument extends PricingDocument {
  ownerId: string;
}

export const MOCK_USER: User = {
  id: "user-northstar-001",
  name: "Avery Morgan",
  email: "avery@northstar.example",
  workspaceName: "Northstar Studio",
  initials: "AM",
};

export const MOCK_CREDENTIALS = {
  email: MOCK_USER.email,
  password: "pricing-demo",
} as const;
export const SAMPLE_DOCUMENT_ID = "sample-draft";
export const SECOND_TENANT_DOCUMENT_ID = "document-hidden-tenant-001";

const SECOND_USER_ID = "user-hidden-tenant-002";

function rawLine(
  fields: Pick<
    LineItem,
    | "id"
    | "position"
    | "name"
    | "description"
    | "quantity"
    | "unitPrice"
    | "discountType"
    | "discountValue"
    | "taxRate"
  >,
): LineItem {
  return {
    ...fields,
    subtotal: "0.00",
    discount: "0.00",
    tax: "0.00",
    grandTotal: "0.00",
  };
}

function ownedDocument(
  ownerId: string,
  document: Omit<PricingDocument, "lines" | "totals"> & {
    lines: LineItem[];
  },
): OwnedPricingDocument {
  const calculated = calculateDocument(document.lines);
  return {
    ...document,
    ownerId,
    lines: calculated.lines,
    totals: calculated.totals,
  };
}

export function buildFixtureDocuments(): OwnedPricingDocument[] {
  return [
    ownedDocument(MOCK_USER.id, {
      id: SAMPLE_DOCUMENT_ID,
      number: "Q-2026-001",
      title: "Multi-rate services proposal",
      customerName: "Acme Corporation",
      documentDate: "2026-08-06",
      validUntil: "2026-09-05",
      currency: "USD",
      status: "draft",
      updatedAt: "2026-08-06T09:30:00.000Z",
      finalizedAt: null,
      lines: [
        rawLine({
          id: "line-sample-widget-a",
          position: 1,
          name: "Widget A",
          description: "Premium widget package",
          quantity: "2",
          unitPrice: "100.00",
          discountType: "percentage",
          discountValue: "10.00",
          taxRate: "5.00",
        }),
        rawLine({
          id: "line-sample-widget-b",
          position: 2,
          name: "Widget B",
          description: "Standard widget",
          quantity: "1",
          unitPrice: "50.00",
          discountType: "none",
          discountValue: "0.00",
          taxRate: "5.00",
        }),
        rawLine({
          id: "line-sample-service-fee",
          position: 3,
          name: "Service fee",
          description: "Implementation and setup",
          quantity: "1",
          unitPrice: "200.00",
          discountType: "fixed",
          discountValue: "20.00",
          taxRate: "0.00",
        }),
      ],
    }),
    ownedDocument(MOCK_USER.id, {
      id: "document-finalized-002",
      number: "Q-2026-002",
      title: "Support renewal",
      customerName: "Beacon Labs",
      documentDate: "2026-07-31",
      validUntil: "2026-08-30",
      currency: "USD",
      status: "finalized",
      updatedAt: "2026-08-01T12:00:00.000Z",
      finalizedAt: "2026-08-01T12:00:00.000Z",
      lines: [
        rawLine({
          id: "line-renewal-001",
          position: 1,
          name: "Annual support",
          description: "Priority support for one year",
          quantity: "1",
          unitPrice: "1000.00",
          discountType: "percentage",
          discountValue: "5.00",
          taxRate: "10.00",
        }),
      ],
    }),
    ownedDocument(MOCK_USER.id, {
      id: "document-finalized-003",
      number: "Q-2026-003",
      title: "Discovery workshop",
      customerName: "Acme Corporation",
      documentDate: "2026-06-15",
      validUntil: "2026-07-15",
      currency: "AED",
      status: "finalized",
      updatedAt: "2026-06-16T10:00:00.000Z",
      finalizedAt: "2026-06-16T10:00:00.000Z",
      lines: [
        rawLine({
          id: "line-workshop-001",
          position: 1,
          name: "Workshop",
          description: "Two-day product discovery workshop",
          quantity: "2",
          unitPrice: "600.00",
          discountType: "fixed",
          discountValue: "100.00",
          taxRate: "0.00",
        }),
      ],
    }),
    ownedDocument(SECOND_USER_ID, {
      id: SECOND_TENANT_DOCUMENT_ID,
      number: "Q-HIDDEN-001",
      title: "Other tenant confidential quote",
      customerName: "Invisible Industries",
      documentDate: "2026-08-06",
      validUntil: "2026-09-05",
      currency: "USD",
      status: "finalized",
      updatedAt: "2026-08-06T10:00:00.000Z",
      finalizedAt: "2026-08-06T10:00:00.000Z",
      lines: [
        rawLine({
          id: "line-hidden-001",
          position: 1,
          name: "Confidential service",
          description: "Must never cross the tenant boundary",
          quantity: "1",
          unitPrice: "99999.00",
          discountType: "none",
          discountValue: "0.00",
          taxRate: "0.00",
        }),
      ],
    }),
  ];
}
