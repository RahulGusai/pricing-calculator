import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MOCK_CREDENTIALS } from "../mocks/fixtures";
import { mockStore, resetMockState } from "../mocks/store";
import { resetApiClientSession, signIn } from "../lib/api";
import { DocumentEditorPage } from "./DocumentEditorPage";

function renderEditor(documentId = "sample-draft") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/documents/${documentId}`]}>
        <Routes>
          <Route path="/documents/:documentId" element={<DocumentEditorPage />} />
          <Route path="/documents" element={<p>Document register</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("DocumentEditorPage", () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    resetApiClientSession();
    resetMockState();
    await signIn(MOCK_CREDENTIALS.email, MOCK_CREDENTIALS.password);
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

    const currency = await screen.findByRole("button", { name: "Currency" });
    expect(currency).toHaveTextContent("USD");
    expect(currency.tagName).toBe("BUTTON");
    expect(screen.queryByRole("combobox", { name: "Currency" })).not.toBeInTheDocument();

    await user.click(currency);
    expect(await screen.findByRole("listbox", { name: "Currency" })).toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: "INR" }));

    await waitFor(
      () => expect(screen.getAllByText("₹421.50").length).toBeGreaterThan(0),
      { timeout: 3_000 },
    );
    expect(screen.getByText(/Calculations are performed in INR/)).toBeInTheDocument();
  });

  it("keeps drafts editable without rendering a page-level mode switch", async () => {
    renderEditor();

    expect(await screen.findByRole("textbox", { name: "Document title" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Finalize" })).toBeInTheDocument();
    expect(screen.queryByText("Columns")).not.toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Item / description" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Line 1 description" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Reading/ })).not.toBeInTheDocument();
  });

  it("uses a wrapped multiline description capped at 240 characters", async () => {
    const user = userEvent.setup();
    renderEditor();

    const description = await screen.findByRole("textbox", { name: "Line 1 description" });
    expect(description.tagName).toBe("TEXTAREA");
    expect(description).toHaveAttribute("maxlength", "240");

    await user.clear(description);
    await user.type(description, "x".repeat(245));
    expect(description).toHaveValue("x".repeat(240));
  });

  it("does not steal focus back to an invalid item during background autosave", async () => {
    const user = userEvent.setup();
    const updateSpy = vi.spyOn(mockStore, "update");
    renderEditor();

    await user.click(await screen.findByRole("button", { name: /Add line/ }));
    const itemName = screen.getByRole("textbox", { name: "Line 4 item name" });
    expect(itemName).toHaveFocus();

    await user.clear(itemName);
    const title = screen.getByRole("textbox", { name: "Document title" });
    await user.click(title);

    expect(title).toHaveFocus();
    expect(await screen.findByText("Enter an item name", {}, { timeout: 3_000 })).toBeInTheDocument();
    await new Promise((resolve) => window.setTimeout(resolve, 1_100));
    expect(title).toHaveFocus();
    expect(itemName).not.toHaveFocus();
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it("requires whole quantities and blocks a third fractional digit in decimal editors", async () => {
    const user = userEvent.setup();
    renderEditor();

    const quantity = await screen.findByRole("textbox", { name: "Line 1 quantity" });
    const unitPrice = screen.getByRole("textbox", { name: "Line 1 unit price" });
    const discount = screen.getByRole("textbox", { name: "Line 1 discount value" });
    const tax = screen.getByRole("textbox", { name: "Line 1 tax rate" });

    await user.clear(quantity);
    await user.type(quantity, "12");
    await user.type(quantity, ".");
    await user.clear(unitPrice);
    await user.type(unitPrice, "10.999");
    await user.clear(discount);
    await user.type(discount, "7.777");
    await user.clear(tax);
    await user.type(tax, "8.255");

    expect(quantity).toHaveValue("12");
    expect(unitPrice).toHaveValue("10.99");
    expect(discount).toHaveValue("7.77");
    expect(tax).toHaveValue("8.25");
    expect(screen.queryByText(/decimal places/i)).not.toBeInTheDocument();
  });

  it("shows a bottom-right toast when a negative unit price is attempted", async () => {
    const user = userEvent.setup();
    renderEditor();

    const unitPrice = await screen.findByRole("textbox", { name: "Line 1 unit price" });
    await user.clear(unitPrice);
    await user.type(unitPrice, "-");

    expect(unitPrice).toHaveValue("");
    expect(screen.getByRole("status")).toHaveTextContent("Negative values are not allowed.");
  });

  it("keeps finalization blocked and explains the invalid line in its dialog", async () => {
    const user = userEvent.setup();
    const finalizeSpy = vi.spyOn(mockStore, "finalize");
    renderEditor();

    const quantity = await screen.findByRole("textbox", { name: "Line 1 quantity" });
    await user.clear(quantity);
    await user.click(screen.getByRole("button", { name: "Finalize" }));
    await user.click(screen.getByRole("button", { name: "Finalize document" }));

    expect(await screen.findByText(/Line 1 quantity: Enter a whole number/)).toBeInTheDocument();
    expect(finalizeSpy).not.toHaveBeenCalled();
  });

  it("accepts a manual tax percentage and autosaves it as a decimal string", async () => {
    const user = userEvent.setup();
    const updateSpy = vi.spyOn(mockStore, "update");
    renderEditor();

    const tax = await screen.findByRole("textbox", { name: "Line 1 tax rate" });
    const taxControl = tax.closest(".rate-input");
    expect(taxControl).not.toBeNull();
    expect(within(taxControl as HTMLElement).getByText("%")).toBeInTheDocument();

    await user.clear(tax);
    await user.type(tax, "8.25");

    await waitFor(
      () => expect(updateSpy).toHaveBeenCalled(),
      { timeout: 3_000 },
    );
    const submittedDocument = updateSpy.mock.calls.at(-1)?.[2];
    expect(submittedDocument?.lines[0].taxRate).toBe("8.25");
    expect(typeof submittedDocument?.lines[0].taxRate).toBe("string");
  });

  it("places percentage range errors next to discount and tax inputs", async () => {
    const user = userEvent.setup();
    renderEditor();

    const discount = await screen.findByRole("textbox", { name: "Line 1 discount value" });
    const tax = screen.getByRole("textbox", { name: "Line 1 tax rate" });
    await user.clear(discount);
    await user.type(discount, "100.01");
    await user.clear(tax);
    await user.type(tax, "100.01");

    expect(await screen.findByText("Use a percentage from 0.00 through 100.00")).toBeInTheDocument();
    expect(await screen.findByText("Use a rate from 0.00 through 100.00")).toBeInTheDocument();
  });

  it("renders finalized documents without mutation inputs", async () => {
    renderEditor("document-finalized-002");

    expect((await screen.findAllByText("Finalized")).length).toBeGreaterThan(0);
    expect(screen.queryByRole("textbox", { name: "Document title" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Duplicate" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Preview" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Download PDF/i })).not.toBeInTheDocument();
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
