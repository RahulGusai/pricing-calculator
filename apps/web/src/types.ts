export type WorkspaceMode = "light" | "dark" | "reading";

export type DocumentStatus = "draft" | "finalized";
export type DiscountType = "none" | "percentage" | "fixed";

export interface MoneyTotals {
  subtotal: string;
  discount: string;
  tax: string;
  grandTotal: string;
}

export interface LineItem extends MoneyTotals {
  id: string;
  position: number;
  name: string;
  description: string;
  quantity: string;
  unitPrice: string;
  discountType: DiscountType;
  discountValue: string;
  taxRate: string;
}

export interface PricingDocument {
  id: string;
  number: string;
  title: string;
  customerName: string;
  documentDate: string;
  validUntil: string;
  currency: "USD";
  status: DocumentStatus;
  updatedAt: string;
  finalizedAt: string | null;
  lines: LineItem[];
  totals: MoneyTotals;
}

export interface DocumentSummary extends MoneyTotals {
  id: string;
  number: string;
  title: string;
  customerName: string;
  documentDate: string;
  status: DocumentStatus;
  currency: "USD";
}

export interface User {
  id: string;
  name: string;
  email: string;
  workspaceName: string;
  initials: string;
}

export interface SessionResponse {
  user: User;
}

export interface ReportResponse {
  startDate: string;
  endDate: string;
  status: DocumentStatus | "all";
  customer: string;
  totals: MoneyTotals & { documentCount: number };
  documents: DocumentSummary[];
}

export type UpdateDocumentInput = Pick<
  PricingDocument,
  "title" | "customerName" | "documentDate" | "validUntil" | "lines"
>;

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    fields?: Record<string, string>;
  };
}
