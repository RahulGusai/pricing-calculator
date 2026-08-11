import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";

import { resetApiClientSession, signIn } from "../lib/api";
import { MOCK_CREDENTIALS } from "../mocks/fixtures";
import { resetMockState } from "../mocks/store";
import { ReportsPage } from "./ReportsPage";

function renderReports() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ReportsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("ReportsPage", () => {
  beforeEach(async () => {
    resetApiClientSession();
    resetMockState();
    await signIn(MOCK_CREDENTIALS.email, MOCK_CREDENTIALS.password);
  });

  it("renders exactly one totals row for each currency in the selected period", async () => {
    renderReports();

    const table = await screen.findByRole("table", {
      name: "Report totals separated by document currency",
    });
    const rows = within(table).getAllByRole("row");

    expect(rows).toHaveLength(3);
    expect(within(rows[1]).getByRole("rowheader", { name: "AED" })).toBeInTheDocument();
    expect(within(rows[2]).getByRole("rowheader", { name: "USD" })).toBeInTheDocument();
  });

  it("uses the styled status control and has no customer report filter", async () => {
    const user = userEvent.setup();
    renderReports();

    const status = await screen.findByRole("button", { name: "Status" });
    expect(status).toHaveTextContent("All statuses");
    expect(status.tagName).toBe("BUTTON");
    expect(screen.queryByRole("combobox", { name: "Status" })).not.toBeInTheDocument();

    await user.click(status);
    expect(await screen.findByRole("listbox", { name: "Status" })).toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: "Finalized" }));
    expect(status).toHaveTextContent("Finalized");
    expect(screen.queryByRole("searchbox", { name: "Customer" })).not.toBeInTheDocument();
  });
});
