import type {
  ApiErrorBody,
  DocumentStatus,
  DocumentSummary,
  PricingDocument,
  ReportResponse,
  SessionResponse,
  UpdateDocumentInput,
} from "../types";

const SESSION_TOKEN_KEY = "pricing-calculator.access-token.v1";

interface LoginResponse extends SessionResponse {
  accessToken: string;
}

export interface ReportParams {
  startDate: string;
  endDate: string;
  status: DocumentStatus | "all";
  customer: string;
}

export class ApiClientError extends Error {
  readonly status: number;
  readonly body: ApiErrorBody;

  constructor(status: number, body: ApiErrorBody) {
    super(body.error.message);
    this.name = "ApiClientError";
    this.status = status;
    this.body = body;
  }
}

function storage(): Storage | null {
  try {
    return typeof globalThis.localStorage === "undefined"
      ? null
      : globalThis.localStorage;
  } catch {
    return null;
  }
}

function apiUrl(path: string): string {
  const environment = (
    import.meta as unknown as { env?: { VITE_API_URL?: string } }
  ).env;
  const configuredOrigin = environment?.VITE_API_URL?.replace(/\/$/, "");
  if (configuredOrigin) return `${configuredOrigin}${path}`;
  const origin = globalThis.location?.origin ?? "http://localhost:5173";
  return new URL(path, origin).toString();
}

function accessToken(): string | null {
  return storage()?.getItem(SESSION_TOKEN_KEY) ?? null;
}

function setAccessToken(token: string | null): void {
  if (token) storage()?.setItem(SESSION_TOKEN_KEY, token);
  else storage()?.removeItem(SESSION_TOKEN_KEY);
}

function fallbackErrorBody(status: number): ApiErrorBody {
  return {
    error: {
      code: "REQUEST_FAILED",
      message: `The request failed with status ${status}.`,
    },
  };
}

async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  const token = accessToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.body !== undefined) headers.set("Content-Type", "application/json");

  const response = await fetch(apiUrl(path), { ...init, headers });
  if (!response.ok) {
    let body = fallbackErrorBody(response.status);
    try {
      body = (await response.json()) as ApiErrorBody;
    } catch {
      // Retain the stable fallback envelope for non-JSON upstream failures.
    }
    if (response.status === 401) setAccessToken(null);
    throw new ApiClientError(response.status, body);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export async function getSession(): Promise<SessionResponse | null> {
  if (!accessToken()) return null;
  try {
    return await request<SessionResponse>("/api/v1/auth/session");
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 401) return null;
    throw error;
  }
}

export async function signIn(
  email: string,
  password: string,
): Promise<SessionResponse> {
  const response = await request<LoginResponse>("/api/v1/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  setAccessToken(response.accessToken);
  return { user: response.user };
}

export async function signOut(): Promise<void> {
  if (!accessToken()) return;
  try {
    await request<void>("/api/v1/auth/logout", { method: "POST" });
  } finally {
    setAccessToken(null);
  }
}

export function listDocuments(): Promise<DocumentSummary[]> {
  return request<DocumentSummary[]>("/api/v1/documents");
}

export function getDocument(id: string): Promise<PricingDocument> {
  return request<PricingDocument>(`/api/v1/documents/${encodeURIComponent(id)}`);
}

export function createDocument(): Promise<PricingDocument> {
  return request<PricingDocument>("/api/v1/documents", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function updateDocument(
  id: string,
  input: UpdateDocumentInput,
): Promise<PricingDocument> {
  return request<PricingDocument>(
    `/api/v1/documents/${encodeURIComponent(id)}`,
    { method: "PATCH", body: JSON.stringify(input) },
  );
}

export function deleteDocument(id: string): Promise<void> {
  return request<void>(`/api/v1/documents/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export function finalizeDocument(id: string): Promise<PricingDocument> {
  return request<PricingDocument>(
    `/api/v1/documents/${encodeURIComponent(id)}/finalize`,
    { method: "POST", body: JSON.stringify({}) },
  );
}

export function duplicateDocument(id: string): Promise<PricingDocument> {
  return request<PricingDocument>(
    `/api/v1/documents/${encodeURIComponent(id)}/duplicate`,
    { method: "POST", body: JSON.stringify({}) },
  );
}

export function getReport(params: ReportParams): Promise<ReportResponse> {
  const query = new URLSearchParams({
    startDate: params.startDate,
    endDate: params.endDate,
    status: params.status,
    customer: params.customer,
  });
  return request<ReportResponse>(`/api/v1/reports/summary?${query}`);
}
