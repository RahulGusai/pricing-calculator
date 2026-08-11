import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
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
});
