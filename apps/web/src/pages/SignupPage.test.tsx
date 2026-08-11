import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { SignupPage } from "./SignupPage";

function renderSignup() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <SignupPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("SignupPage", () => {
  it("shows and enforces the eight-character password minimum", async () => {
    const user = userEvent.setup();
    const { container } = renderSignup();
    const email = screen.getByRole("textbox", { name: "Email address" });
    const password = screen.getByLabelText("Password");
    const submit = screen.getByRole("button", { name: "Create workspace" });
    const hint = screen.getByText("Use at least 8 characters.");

    expect(password).toHaveAttribute("minlength", "8");
    expect(password).toHaveAttribute("aria-describedby", hint.id);
    expect(container.querySelector(".login-logo")).toHaveAttribute(
      "src",
      "/pricing-desk-mark.svg",
    );

    await user.type(email, "new@example.com");
    await user.type(password, "1234567");
    expect(submit).toBeDisabled();

    await user.type(password, "8");
    expect(submit).toBeEnabled();
  });
});
