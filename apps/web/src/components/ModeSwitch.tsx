import { Moon, Sun } from "@phosphor-icons/react";

import { useWorkspaceMode } from "../context/ModeContext";
import type { WorkspaceMode } from "../types";

const modes: Array<{
  value: WorkspaceMode;
  label: string;
  icon: typeof Sun;
}> = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
];

export function ModeSwitch() {
  const { mode, setMode } = useWorkspaceMode();

  return (
    <div className="mode-switch" role="group" aria-label="Workspace appearance">
      {modes.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          className={mode === value ? "is-active" : undefined}
          aria-label={`${label} mode`}
          aria-pressed={mode === value}
          title={`Use ${label.toLowerCase()} mode`}
          onClick={() => setMode(value)}
        >
          <Icon aria-hidden="true" size={15} weight={mode === value ? "fill" : "regular"} />
        </button>
      ))}
    </div>
  );
}
