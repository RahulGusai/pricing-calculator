import { ChartBar, FileText, SignOut } from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { NavLink, Outlet, useNavigate } from "react-router-dom";

import { signOut } from "../lib/api";
import type { User } from "../types";
import { ModeSwitch } from "./ModeSwitch";

export function AppShell({ user }: { user: User }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const signOutMutation = useMutation({
    mutationFn: signOut,
    onSettled: () => {
      queryClient.clear();
      navigate("/login", { replace: true });
    },
  });

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Primary navigation">
        <div className="workspace-mark">
          <span className="workspace-avatar" aria-hidden="true">
            NL
          </span>
          <span className="workspace-name">{user.workspaceName}</span>
        </div>

        <nav className="sidebar-nav">
          <NavLink to="/documents">
            <FileText size={21} aria-hidden="true" />
            <span>Documents</span>
          </NavLink>
          <NavLink to="/reports">
            <ChartBar size={21} aria-hidden="true" />
            <span>Reports</span>
          </NavLink>
        </nav>

        <div className="sidebar-account">
          <div className="account-summary">
            <span className="account-avatar" aria-hidden="true">{user.initials}</span>
            <span>
              <strong>{user.name}</strong>
              <small>{user.email}</small>
            </span>
          </div>
          <div className="sidebar-appearance">
            <ModeSwitch />
          </div>
          <button
            type="button"
            onClick={() => signOutMutation.mutate()}
            disabled={signOutMutation.isPending}
          >
            <SignOut size={20} aria-hidden="true" />
            <span>{signOutMutation.isPending ? "Signing out…" : "Sign out"}</span>
          </button>
        </div>
      </aside>

      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
