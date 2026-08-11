import type { components } from "./lib/generated/openapi";

type Schemas = components["schemas"];

export type WorkspaceMode = "light" | "dark";
export type DocumentStatus = Schemas["DocumentResponse"]["status"];
export type DiscountType = Schemas["DiscountType"];
export type CurrencyCode = Schemas["CurrencyCode"];

export type MoneyTotals = Schemas["MoneyTotalsResponse"];
export type LineItem = Schemas["LineResponse"];
export type LineWrite = Schemas["LineWriteRequest"];
export type PricingDocument = Schemas["DocumentResponse"];
export type DocumentSummary = Schemas["DocumentSummaryResponse"];
export type User = Schemas["UserResponse"];
export type SessionResponse = Schemas["AuthResponse"];
export type DocumentCreateInput = Schemas["DocumentCreateRequest"];
export type UpdateDocumentInput = Schemas["DocumentReplaceRequest"];
export type CurrencyConfig = Schemas["CurrencyConfigResponse"];
export type ReportResponse = Schemas["ReportResponse"];

/**
 * FastAPI returns this stable envelope for domain errors. Validation failures
 * can also include a `detail` array, which the client maps to form fields.
 */
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    fields?: Record<string, string>;
  };
  detail?: Array<{
    loc: Array<string | number>;
    msg: string;
    type: string;
  }>;
}
