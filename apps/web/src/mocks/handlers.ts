import { delay, http, HttpResponse } from "msw";

import type {
  ApiErrorBody,
  DocumentCreateInput,
  DocumentStatus,
  UpdateDocumentInput,
} from "../types";
import { MockApiError, mockStore } from "./store";

const LATENCIES_MS = [120, 165, 205, 250] as const;
let latencyIndex = 0;

async function simulateLatency(): Promise<void> {
  const duration = LATENCIES_MS[latencyIndex % LATENCIES_MS.length];
  latencyIndex += 1;
  await delay(duration);
}

function requireOwner(): string {
  const user = mockStore.currentUser();
  if (!user) {
    throw new MockApiError(401, "AUTHENTICATION_REQUIRED", "A valid session is required.");
  }
  return user.id;
}

function requireCsrf(request: Request): void {
  if (!mockStore.hasValidCsrf(request.headers.get("X-CSRF-Token"))) {
    throw new MockApiError(
      403,
      "CSRF_VALIDATION_FAILED",
      "A valid X-CSRF-Token header is required.",
    );
  }
}

function errorResponse(error: unknown) {
  if (error instanceof MockApiError) {
    const body: ApiErrorBody = {
      error: {
        code: error.code,
        message: error.message,
        ...(error.fields ? { fields: error.fields } : {}),
      },
    };
    return HttpResponse.json(body, { status: error.status });
  }

  return HttpResponse.json<ApiErrorBody>({
    error: {
      code: "INTERNAL_ERROR",
      message: "The mock service encountered an unexpected error.",
    },
  }, { status: 500 });
}

async function jsonBody<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new MockApiError(400, "INVALID_JSON", "Request body must be valid JSON.");
  }
}

function sessionResponse() {
  const user = mockStore.currentUser();
  if (!user) throw new MockApiError(401, "AUTHENTICATION_REQUIRED", "A valid session is required.");
  return mockStore.startSession(user);
}

export const handlers = [
  http.get("*/api/v1/config/currencies", async () => {
    await simulateLatency();
    return HttpResponse.json({
      defaultCurrency: "USD",
      currencies: [
        { code: "USD", minorUnit: 2 },
        { code: "INR", minorUnit: 2 },
        { code: "AED", minorUnit: 2 },
      ],
      moneyDecimalPlaces: 2,
      quantityDecimalPlaces: 0,
      rateDecimalPlaces: 2,
      roundingMode: "HALF_UP",
    });
  }),

  http.post("*/api/v1/auth/login", async ({ request }) => {
    await simulateLatency();
    try {
      const body = await jsonBody<{ email?: string; password?: string }>(request);
      if (typeof body.email !== "string" || typeof body.password !== "string") {
        throw new MockApiError(422, "VALIDATION_ERROR", "Email and password are required.");
      }
      return HttpResponse.json(mockStore.startSession(mockStore.authenticate(body.email, body.password)));
    } catch (error) {
      return errorResponse(error);
    }
  }),

  http.post("*/api/v1/auth/signup", async ({ request }) => {
    await simulateLatency();
    try {
      const body = await jsonBody<{ email?: string; password?: string }>(request);
      if (!body.email || !body.password || body.password.length < 8) {
        throw new MockApiError(422, "VALIDATION_ERROR", "Email and an 8-character password are required.");
      }
      // Explicit mock mode has one deterministic owner; production signup is FastAPI-backed.
      return HttpResponse.json(mockStore.startSession(mockStore.authenticate(
        "avery@northstar.example",
        "pricing-demo",
      )), { status: 201 });
    } catch (error) {
      return errorResponse(error);
    }
  }),

  http.get("*/api/v1/auth/session", async () => {
    await simulateLatency();
    try {
      return HttpResponse.json(sessionResponse());
    } catch (error) {
      return errorResponse(error);
    }
  }),

  http.post("*/api/v1/auth/logout", async ({ request }) => {
    await simulateLatency();
    try {
      requireOwner();
      requireCsrf(request);
      mockStore.endSession();
      return new HttpResponse(null, { status: 204 });
    } catch (error) {
      return errorResponse(error);
    }
  }),

  http.get("*/api/v1/documents", async () => {
    await simulateLatency();
    try {
      return HttpResponse.json(mockStore.list(requireOwner()));
    } catch (error) {
      return errorResponse(error);
    }
  }),

  http.post("*/api/v1/documents", async ({ request }) => {
    await simulateLatency();
    try {
      const ownerId = requireOwner();
      requireCsrf(request);
      return HttpResponse.json(mockStore.create(ownerId, await jsonBody<DocumentCreateInput>(request)), { status: 201 });
    } catch (error) {
      return errorResponse(error);
    }
  }),

  http.get("*/api/v1/documents/:documentId", async ({ params }) => {
    await simulateLatency();
    try {
      return HttpResponse.json(mockStore.get(requireOwner(), String(params.documentId)));
    } catch (error) {
      return errorResponse(error);
    }
  }),

  http.delete("*/api/v1/documents/:documentId", async ({ request, params }) => {
    await simulateLatency();
    try {
      const ownerId = requireOwner();
      requireCsrf(request);
      const body = await jsonBody<{ confirm?: true }>(request);
      if (body.confirm !== true) throw new MockApiError(422, "VALIDATION_ERROR", "Deletion requires confirmation.");
      mockStore.delete(ownerId, String(params.documentId));
      return new HttpResponse(null, { status: 204 });
    } catch (error) {
      return errorResponse(error);
    }
  }),

  http.patch("*/api/v1/documents/:documentId", async ({ request, params }) => {
    await simulateLatency();
    try {
      const ownerId = requireOwner();
      requireCsrf(request);
      const input = await jsonBody<UpdateDocumentInput>(request);
      return HttpResponse.json(mockStore.update(ownerId, String(params.documentId), input));
    } catch (error) {
      return errorResponse(error);
    }
  }),

  http.post("*/api/v1/documents/:documentId/finalize", async ({ request, params }) => {
    await simulateLatency();
    try {
      const ownerId = requireOwner();
      requireCsrf(request);
      return HttpResponse.json(mockStore.finalize(ownerId, String(params.documentId)));
    } catch (error) {
      return errorResponse(error);
    }
  }),

  http.post("*/api/v1/documents/:documentId/duplicate", async ({ request, params }) => {
    await simulateLatency();
    try {
      const ownerId = requireOwner();
      requireCsrf(request);
      return HttpResponse.json(mockStore.duplicate(ownerId, String(params.documentId)), { status: 201 });
    } catch (error) {
      return errorResponse(error);
    }
  }),

  http.get("*/api/v1/reports/summary", async ({ request }) => {
    await simulateLatency();
    try {
      const ownerId = requireOwner();
      const url = new URL(request.url);
      const startDate = url.searchParams.get("startDate") ?? "";
      const endDate = url.searchParams.get("endDate") ?? "";
      const statusValue = url.searchParams.get("status") ?? "all";
      if (!(["all", "draft", "finalized"] as const).includes(statusValue as DocumentStatus | "all")) {
        throw new MockApiError(422, "VALIDATION_ERROR", "Status must be all, draft, or finalized.");
      }
      return HttpResponse.json(mockStore.report(ownerId, startDate, endDate, statusValue as DocumentStatus | "all"));
    } catch (error) {
      return errorResponse(error);
    }
  }),
];
