import { delay, http, HttpResponse } from "msw";

import type {
  ApiErrorBody,
  DocumentStatus,
  UpdateDocumentInput,
} from "../types";
import { MOCK_ACCESS_TOKEN } from "./fixtures";
import { MockApiError, mockStore } from "./store";

const LATENCIES_MS = [120, 165, 205, 250] as const;
let latencyIndex = 0;

async function simulateLatency(): Promise<void> {
  const duration = LATENCIES_MS[latencyIndex % LATENCIES_MS.length];
  latencyIndex += 1;
  await delay(duration);
}

function bearerToken(request: Request): string | null {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  return authorization.slice("Bearer ".length);
}

function requireOwner(request: Request): string {
  const token = bearerToken(request);
  const user = token ? mockStore.userForToken(token) : null;
  if (!user) {
    throw new MockApiError(
      401,
      "AUTHENTICATION_REQUIRED",
      "A valid bearer token is required.",
    );
  }
  return user.id;
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

  return HttpResponse.json<ApiErrorBody>(
    {
      error: {
        code: "INTERNAL_ERROR",
        message: "The mock service encountered an unexpected error.",
      },
    },
    { status: 500 },
  );
}

async function jsonBody<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new MockApiError(
      400,
      "INVALID_JSON",
      "Request body must be valid JSON.",
    );
  }
}

export const handlers = [
  http.post("*/api/v1/auth/login", async ({ request }) => {
    await simulateLatency();
    try {
      const body = await jsonBody<{ email?: string; password?: string }>(request);
      if (typeof body.email !== "string" || typeof body.password !== "string") {
        throw new MockApiError(
          422,
          "VALIDATION_ERROR",
          "Email and password are required.",
        );
      }
      const user = mockStore.authenticate(body.email, body.password);
      return HttpResponse.json({ user, accessToken: MOCK_ACCESS_TOKEN });
    } catch (error) {
      return errorResponse(error);
    }
  }),

  http.get("*/api/v1/auth/session", async ({ request }) => {
    await simulateLatency();
    try {
      const token = bearerToken(request);
      const user = token ? mockStore.userForToken(token) : null;
      if (!user) {
        throw new MockApiError(
          401,
          "AUTHENTICATION_REQUIRED",
          "A valid bearer token is required.",
        );
      }
      return HttpResponse.json({ user });
    } catch (error) {
      return errorResponse(error);
    }
  }),

  http.post("*/api/v1/auth/logout", async ({ request }) => {
    await simulateLatency();
    try {
      requireOwner(request);
      return new HttpResponse(null, { status: 204 });
    } catch (error) {
      return errorResponse(error);
    }
  }),

  http.get("*/api/v1/documents", async ({ request }) => {
    await simulateLatency();
    try {
      return HttpResponse.json(mockStore.list(requireOwner(request)));
    } catch (error) {
      return errorResponse(error);
    }
  }),

  http.post("*/api/v1/documents", async ({ request }) => {
    await simulateLatency();
    try {
      return HttpResponse.json(mockStore.create(requireOwner(request)), {
        status: 201,
      });
    } catch (error) {
      return errorResponse(error);
    }
  }),

  http.get("*/api/v1/documents/:documentId", async ({ request, params }) => {
    await simulateLatency();
    try {
      return HttpResponse.json(
        mockStore.get(requireOwner(request), String(params.documentId)),
      );
    } catch (error) {
      return errorResponse(error);
    }
  }),

  http.patch(
    "*/api/v1/documents/:documentId",
    async ({ request, params }) => {
      await simulateLatency();
      try {
        const ownerId = requireOwner(request);
        const input = await jsonBody<UpdateDocumentInput>(request);
        return HttpResponse.json(
          mockStore.update(ownerId, String(params.documentId), input),
        );
      } catch (error) {
        return errorResponse(error);
      }
    },
  ),

  http.post(
    "*/api/v1/documents/:documentId/finalize",
    async ({ request, params }) => {
      await simulateLatency();
      try {
        return HttpResponse.json(
          mockStore.finalize(
            requireOwner(request),
            String(params.documentId),
          ),
        );
      } catch (error) {
        return errorResponse(error);
      }
    },
  ),

  http.post(
    "*/api/v1/documents/:documentId/duplicate",
    async ({ request, params }) => {
      await simulateLatency();
      try {
        return HttpResponse.json(
          mockStore.duplicate(
            requireOwner(request),
            String(params.documentId),
          ),
          { status: 201 },
        );
      } catch (error) {
        return errorResponse(error);
      }
    },
  ),

  http.get("*/api/v1/reports/summary", async ({ request }) => {
    await simulateLatency();
    try {
      const ownerId = requireOwner(request);
      const url = new URL(request.url);
      const startDate = url.searchParams.get("startDate") ?? "";
      const endDate = url.searchParams.get("endDate") ?? "";
      const statusValue = url.searchParams.get("status") ?? "all";
      const customer = url.searchParams.get("customer") ?? "";
      if (!(["all", "draft", "finalized"] as const).includes(
        statusValue as DocumentStatus | "all",
      )) {
        throw new MockApiError(
          422,
          "VALIDATION_ERROR",
          "Status must be all, draft, or finalized.",
        );
      }
      return HttpResponse.json(
        mockStore.report(
          ownerId,
          startDate,
          endDate,
          statusValue as DocumentStatus | "all",
          customer,
        ),
      );
    } catch (error) {
      return errorResponse(error);
    }
  }),
];
