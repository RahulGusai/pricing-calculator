import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";

import { ModeProvider } from "../context/ModeContext";
import { MOCK_ACCESS_TOKEN } from "../mocks/fixtures";
import { resetMockState } from "../mocks/store";
import { DocumentEditorPage } from "./DocumentEditorPage";

const SESSION_TOKEN_KEY = "pricing-calculator.access-token.v1";

function renderEditor(documentId = "sample-draft") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/documents/${documentId}`]}>
        <ModeProvider>
          <Routes>
            <Route path="/documents/:documentId" element={<DocumentEditorPage />} />
            <Route path="/documents" element={<p>Document register</p>} />
          </Routes>
        </ModeProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("DocumentEditorPage", () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetMockState();
    window.localStorage.setItem(SESSION_TOKEN_KEY, MOCK_ACCESS_TOKEN);
  });

  it("renders the reference total returned by the mock API", async () => {
    renderEditor();

    expect(await screen.findByRole("textbox", { name: "Document title" })).toHaveValue(
      "Multi-rate services proposal",
    );
    expect(screen.getAllByText("$421.50").length).toBeGreaterThan(0);
    expect(screen.getByRole("textbox", { name: "Line 1 unit price" })).toHaveValue(
      "100.00",
    );
    expect(screen.queryByText("Pricing proposals")).not.toBeInTheDocument();
  });

  it("autosaves an edited line and replaces totals with the API response", async () => {
    const user = userEvent.setup();
    renderEditor();
    const unitPrice = await screen.findByRole("textbox", { name: "Line 1 unit price" });

    await user.clear(unitPrice);
    await user.type(unitPrice, "110.00");

    await waitFor(
      () => expect(screen.getAllByText("$440.40").length).toBeGreaterThan(0),
      { timeout: 3_000 },
    );
    expect(screen.getAllByText("Server calculated").length).toBeGreaterThan(0);
  });

  it("applies one editable currency across the whole document", async () => {
    const user = userEvent.setup();
    renderEditor();

    const currency = await screen.findByRole("combobox", { name: "Currency" });
    expect(currency).toHaveValue("USD");

    await user.selectOptions(currency, "EUR");

    await waitFor(
      () => expect(screen.getAllByText("€421.50").length).toBeGreaterThan(0),
      { timeout: 3_000 },
    );
    expect(screen.getByText(/Calculations are performed in EUR/)).toBeInTheDocument();
  });

  it("turns reading mode into a distraction-reduced, non-editable review", async () => {
    const user = userEvent.setup();
    renderEditor();
    await screen.findByRole("textbox", { name: "Document title" });

    await user.click(screen.getByRole("button", { name: /^Reading/ }));

    expect(screen.queryByRole("textbox", { name: "Document title" })).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Multi-rate services proposal" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Finalize" })).not.toBeInTheDocument();
  });

  it("renders finalized documents without mutation inputs", async () => {
    renderEditor("document-finalized-002");

    expect((await screen.findAllByText("Finalized")).length).toBeGreaterThan(0);
    expect(screen.queryByRole("textbox", { name: "Document title" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Duplicate" })).toBeInTheDocument();
  });

  it.each([
    ["draft", "sample-draft"],
    ["finalized", "document-finalized-002"],
  ])("deletes a %s document after explicit confirmation", async (_status, documentId) => {
    const user = userEvent.setup();
    renderEditor(documentId);

    await user.click(await screen.findByRole("button", { name: "Delete document" }));
    expect(screen.getByRole("heading", { name: "Delete this document?" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Delete permanently" }));

    expect(await screen.findByText("Document register")).toBeInTheDocument();
  });
});
