import { setupWorker } from "msw/browser";

import { handlers } from "./handlers";

export const worker = setupWorker(...handlers);

export function startMockWorker(): Promise<ServiceWorkerRegistration | undefined> {
  return worker.start({ onUnhandledRequest: "bypass" });
}
