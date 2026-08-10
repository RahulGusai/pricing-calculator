import { BookOpen, Moon, Sun } from "@phosphor-icons/react";

import { useWorkspaceMode } from "../context/ModeContext";
import type { WorkspaceMode } from "../types";

const modes: Array<{
  value: WorkspaceMode;
  label: string;
  description: string;
  icon: typeof Sun;
}> = [
  { value: "light", label: "Light", description: "Light workspace", icon: Sun },
  { value: "dark", label: "Dark", description: "Dark workspace", icon: Moon },
  {
    value: "reading",
    label: "Reading",
    description: "Distraction-reduced document view",
    icon: BookOpen,
  },
];

export function ModeSwitch({ compact = false }: { compact?: boolean }) {
  const { mode, setMode } = useWorkspaceMode();

  return (
    <div className="mode-switch" role="group" aria-label="Workspace appearance">
      {modes.map(({ value, label, description, icon: Icon }) => (
        <button
          key={value}
          type="button"
          className={mode === value ? "is-active" : undefined}
          aria-pressed={mode === value}
          title={description}
          onClick={() => setMode(value)}
        >
          <Icon aria-hidden="true" size={18} weight={mode === value ? "fill" : "regular"} />
          {!compact && <span>{label}</span>}
          <span className="sr-only">{description}</span>
        </button>
      ))}
    </div>
  );
}
