import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";

import { App } from "./App";
import { ModeProvider } from "./context/ModeContext";
import "./fonts.css";
import "./styles.css";
import "./pages/ancillary.css";

async function enableMocking() {
  if (import.meta.env.VITE_API_MODE === "real") return;
  if (import.meta.env.PROD && import.meta.env.VITE_API_MODE !== "mock") return;
  const { worker } = await import("./mocks/browser");
  await worker.start({ onUnhandledRequest: "bypass", quiet: true });
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 20_000, refetchOnWindowFocus: false, retry: 1 },
    mutations: { retry: false },
  },
});

enableMocking().then(() => {
  const root = document.getElementById("root");
  if (!root) throw new Error("Missing #root element");

  createRoot(root).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <ModeProvider>
            <App />
          </ModeProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </React.StrictMode>,
  );
});
