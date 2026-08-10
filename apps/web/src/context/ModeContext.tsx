import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import type { WorkspaceMode } from "../types";

const STORAGE_KEY = "pricing-desk:workspace-mode";

interface ModeContextValue {
  mode: WorkspaceMode;
  setMode: (mode: WorkspaceMode) => void;
}

const ModeContext = createContext<ModeContextValue | null>(null);

function getInitialMode(): WorkspaceMode {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark" || stored === "reading") {
    return stored;
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function ModeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<WorkspaceMode>(getInitialMode);

  useEffect(() => {
    document.documentElement.dataset.mode = mode;
    document.documentElement.style.colorScheme = mode === "dark" ? "dark" : "light";
    window.localStorage.setItem(STORAGE_KEY, mode);
  }, [mode]);

  const value = useMemo(() => ({ mode, setMode }), [mode]);
  return <ModeContext.Provider value={value}>{children}</ModeContext.Provider>;
}

export function useWorkspaceMode() {
  const context = useContext(ModeContext);
  if (!context) throw new Error("useWorkspaceMode must be used inside ModeProvider");
  return context;
}
