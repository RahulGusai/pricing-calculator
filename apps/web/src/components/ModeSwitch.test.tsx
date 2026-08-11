import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";

import { ModeProvider } from "../context/ModeContext";
import type { User } from "../types";
import { AppShell } from "./AppShell";
import { ModeSwitch } from "./ModeSwitch";

const STORAGE_KEY = "pricing-desk:workspace-mode";

const user: User = {
  id: "user-1",
  name: "Avery Morgan",
  email: "avery@example.test",
  workspaceName: "Northstar Studio",
  initials: "AM",
};

function renderModeSwitch() {
  return render(
    <ModeProvider>
      <ModeSwitch />
    </ModeProvider>,
  );
}

describe("ModeSwitch", () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete document.documentElement.dataset.mode;
    document.documentElement.style.removeProperty("color-scheme");
  });

  it("coerces the removed reading mode to light", async () => {
    window.localStorage.setItem(STORAGE_KEY, "reading");

    renderModeSwitch();

    expect(screen.getByRole("button", { name: "Light mode" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.queryByRole("button", { name: /reading/i })).not.toBeInTheDocument();
    await waitFor(() => expect(window.localStorage.getItem(STORAGE_KEY)).toBe("light"));
    expect(document.documentElement.dataset.mode).toBe("light");
  });

  it("uses icon-only, labelled controls and applies dark mode", async () => {
    const interaction = userEvent.setup();
    renderModeSwitch();

    const group = screen.getByRole("group", { name: "Workspace appearance" });
    const lightButton = within(group).getByRole("button", { name: "Light mode" });
    const darkButton = within(group).getByRole("button", { name: "Dark mode" });

    expect(lightButton).toHaveAttribute("title", "Use light mode");
    expect(darkButton).toHaveAttribute("title", "Use dark mode");
    expect(lightButton).toHaveTextContent("");
    expect(darkButton).toHaveTextContent("");
    expect(lightButton.querySelector("svg")).toHaveAttribute("width", "12");
    expect(lightButton.querySelector("svg")).toHaveAttribute("height", "12");
    expect(darkButton.querySelector("svg")).toHaveAttribute("width", "12");
    expect(darkButton.querySelector("svg")).toHaveAttribute("height", "12");

    await interaction.click(darkButton);

    expect(darkButton).toHaveAttribute("aria-pressed", "true");
    expect(lightButton).toHaveAttribute("aria-pressed", "false");
    expect(document.documentElement.dataset.mode).toBe("dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("dark");
  });

  it("occupies the former settings position without removing account actions", () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/documents"]}>
          <ModeProvider>
            <Routes>
              <Route element={<AppShell user={user} />}>
                <Route path="/documents" element={<p>Documents</p>} />
              </Route>
            </Routes>
          </ModeProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const accountArea = container.querySelector(".sidebar-account");
    expect(accountArea).not.toBeNull();
    expect(
      within(accountArea as HTMLElement).getByRole("group", {
        name: "Workspace appearance",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Settings" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
    expect(screen.getByText("Avery Morgan")).toBeInTheDocument();
    expect(accountArea?.closest(".app-shell")?.querySelector(".workspace-logo")).toHaveAttribute(
      "src",
      "/pricing-desk-mark.svg",
    );
  });
});
