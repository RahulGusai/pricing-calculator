import type {
  ApiErrorBody,
  CurrencyConfig,
  DocumentCreateInput,
  DocumentStatus,
  DocumentSummary,
  PricingDocument,
  ReportResponse,
  SessionResponse,
  UpdateDocumentInput,
} from "../types";

let csrfToken: string | null = null;
let sessionExpiredHandler: (() => void) | null = null;

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

/** Register the single app-level response to an expired cookie session. */
export function setSessionExpiredHandler(handler: (() => void) | null): void {
  sessionExpiredHandler = handler;
}

/** Test-only cleanup; production sessions are always restored through /session. */
export function resetApiClientSession(): void {
  csrfToken = null;
}

function apiUrl(path: string): string {
  const configuredOrigin = import.meta.env.VITE_API_URL?.replace(/\/$/, "");
  if (configuredOrigin) return `${configuredOrigin}${path}`;
  if (import.meta.env.DEV) return `http://localhost:8000${path}`;
  return path;
}

function fallbackErrorBody(status: number): ApiErrorBody {
  return {
    error: {
      code: "REQUEST_FAILED",
      message: `The request failed with status ${status}.`,
    },
  };
}

function isUnsafeMethod(method: string | undefined): boolean {
  return ["POST", "PATCH", "PUT", "DELETE"].includes((method ?? "GET").toUpperCase());
}

function clearSession(notify = false): void {
  csrfToken = null;
  if (notify) sessionExpiredHandler?.();
}

async function parseError(response: Response): Promise<ApiErrorBody> {
  try {
    const body = (await response.json()) as ApiErrorBody;
    if (body?.error?.message) return body;
  } catch {
    // A reverse proxy or infrastructure failure can be non-JSON.
  }
  return fallbackErrorBody(response.status);
}

interface RequestOptions {
  retryCsrf?: boolean;
  notifyOnUnauthorized?: boolean;
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  options: RequestOptions = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body !== undefined) headers.set("Content-Type", "application/json");
  if (isUnsafeMethod(init.method) && csrfToken) {
    headers.set("X-CSRF-Token", csrfToken);
  }

  const response = await fetch(apiUrl(path), {
    ...init,
    credentials: "include",
    headers,
  });

  if (!response.ok) {
    const body = await parseError(response);
    if (
      response.status === 403 &&
      body.error.code === "CSRF_VALIDATION_FAILED" &&
      options.retryCsrf !== false
    ) {
      const restoredSession = await getSession();
      if (restoredSession) {
        return request<T>(path, init, { ...options, retryCsrf: false });
      }
    }
    if (response.status === 401) {
      clearSession(options.notifyOnUnauthorized !== false);
    }
    throw new ApiClientError(response.status, body);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

function rememberSession(session: SessionResponse): SessionResponse {
  csrfToken = session.csrfToken;
  return session;
}

export async function getSession(): Promise<SessionResponse | null> {
  try {
    return rememberSession(
      await request<SessionResponse>("/api/v1/auth/session", {}, {
        notifyOnUnauthorized: false,
      }),
    );
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 401) return null;
    throw error;
  }
}

export async function signUp(input: {
  email: string;
  password: string;
  name?: string;
  workspaceName?: string;
}): Promise<SessionResponse> {
  return rememberSession(
    await request<SessionResponse>("/api/v1/auth/signup", {
      method: "POST",
      body: JSON.stringify(input),
    }, { notifyOnUnauthorized: false }),
  );
}

export async function signIn(email: string, password: string): Promise<SessionResponse> {
  return rememberSession(
    await request<SessionResponse>("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }, { notifyOnUnauthorized: false }),
  );
}

export async function signOut(): Promise<void> {
  try {
    await request<void>("/api/v1/auth/logout", { method: "POST" }, {
      notifyOnUnauthorized: false,
    });
  } finally {
    clearSession();
  }
}

export function getCurrencyConfig(): Promise<CurrencyConfig> {
  return request<CurrencyConfig>("/api/v1/config/currencies");
}

export function listDocuments(): Promise<DocumentSummary[]> {
  return request<DocumentSummary[]>("/api/v1/documents");
}

export function getDocument(id: string): Promise<PricingDocument> {
  return request<PricingDocument>(`/api/v1/documents/${encodeURIComponent(id)}`);
}

export function createDocument(input: DocumentCreateInput = {}): Promise<PricingDocument> {
  return request<PricingDocument>("/api/v1/documents", {
    method: "POST",
    body: JSON.stringify(input),
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
    body: JSON.stringify({ confirm: true }),
  });
}

export function finalizeDocument(id: string): Promise<PricingDocument> {
  return request<PricingDocument>(
    `/api/v1/documents/${encodeURIComponent(id)}/finalize`,
    { method: "POST" },
  );
}

export function duplicateDocument(id: string): Promise<PricingDocument> {
  return request<PricingDocument>(
    `/api/v1/documents/${encodeURIComponent(id)}/duplicate`,
    { method: "POST" },
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
