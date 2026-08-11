import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";

import { MOCK_CREDENTIALS } from "../mocks/fixtures";
import { resetMockState } from "../mocks/store";
import { resetApiClientSession, signIn } from "../lib/api";
import { DocumentsPage } from "./DocumentsPage";

function renderDocuments() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/documents"]}>
        <Routes>
          <Route path="/documents" element={<DocumentsPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("DocumentsPage", () => {
  beforeEach(async () => {
    resetApiClientSession();
    resetMockState();
    await signIn(MOCK_CREDENTIALS.email, MOCK_CREDENTIALS.password);
  });

  it.each([
    ["draft", "Q-2026-001"],
    ["finalized", "Q-2026-002"],
  ])("deletes a %s document from the register after confirmation", async (_status, number) => {
    const user = userEvent.setup();
    renderDocuments();

    const documentNumber = await screen.findByText(number);
    const row = documentNumber.closest("tr");
    expect(row).not.toBeNull();

    await user.click(within(row!).getByRole("button", { name: new RegExp(`Delete ${number}`) }));
    expect(screen.getByRole("heading", { name: "Delete this document?" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Delete permanently" }));

    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: new RegExp(`Delete ${number}`) }),
      ).not.toBeInTheDocument(),
    );
  });
});
