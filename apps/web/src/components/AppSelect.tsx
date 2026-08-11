import { CaretDown, Check } from "@phosphor-icons/react";
import {
  type KeyboardEvent,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

export interface AppSelectOption {
  value: string;
  label: string;
}

interface AppSelectProps {
  label: string;
  value: string;
  options: AppSelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
}

/**
 * A deliberately small, app-owned listbox. Native select menus are rendered by
 * the browser/OS and cannot consistently inherit the product's visual system.
 */
export function AppSelect({
  label,
  value,
  options,
  onChange,
  disabled = false,
}: AppSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const selectedIndex = useMemo(
    () => Math.max(0, options.findIndex((option) => option.value === value)),
    [options, value],
  );
  const [activeIndex, setActiveIndex] = useState(selectedIndex);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listboxRef = useRef<HTMLUListElement>(null);
  const id = useId();
  const listboxId = `${id}-options`;

  useEffect(() => {
    if (!isOpen) return undefined;

    function dismissWhenOutside(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    globalThis.document.addEventListener("pointerdown", dismissWhenOutside);
    return () => globalThis.document.removeEventListener("pointerdown", dismissWhenOutside);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      listboxRef.current?.focus();
    }
  }, [isOpen]);

  function open(initialIndex = selectedIndex) {
    if (disabled || options.length === 0) return;
    setActiveIndex(initialIndex);
    setIsOpen(true);
  }

  function close({ returnFocus = false }: { returnFocus?: boolean } = {}) {
    setIsOpen(false);
    if (returnFocus) {
      triggerRef.current?.focus();
    }
  }

  function select(index: number) {
    const option = options[index];
    if (!option) return;
    onChange(option.value);
    close({ returnFocus: true });
  }

  function moveActive(offset: number) {
    if (options.length === 0) return;
    setActiveIndex((current) => (current + offset + options.length) % options.length);
  }

  function handleTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      open(
        event.key === "ArrowDown"
          ? Math.min(selectedIndex + 1, options.length - 1)
          : Math.max(selectedIndex - 1, 0),
      );
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (isOpen) {
        select(activeIndex);
      } else {
        open();
      }
    }
  }

  function handleListboxKeyDown(event: KeyboardEvent<HTMLUListElement>) {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        moveActive(1);
        break;
      case "ArrowUp":
        event.preventDefault();
        moveActive(-1);
        break;
      case "Home":
        event.preventDefault();
        setActiveIndex(0);
        break;
      case "End":
        event.preventDefault();
        setActiveIndex(Math.max(options.length - 1, 0));
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        select(activeIndex);
        break;
      case "Escape":
        event.preventDefault();
        close({ returnFocus: true });
        break;
      case "Tab":
        close();
        break;
      default:
        break;
    }
  }

  const selectedOption = options[selectedIndex];

  return (
    <div className="app-select" ref={rootRef}>
      <button
        ref={triggerRef}
        className="app-select-trigger"
        type="button"
        aria-label={label}
        aria-controls={listboxId}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        disabled={disabled || options.length === 0}
        onClick={() => (isOpen ? close() : open())}
        onKeyDown={handleTriggerKeyDown}
      >
        <span>{selectedOption?.label ?? value}</span>
        <CaretDown size={16} weight="bold" aria-hidden="true" />
      </button>

      {isOpen ? (
        <ul
          ref={listboxRef}
          id={listboxId}
          className="app-select-options"
          role="listbox"
          aria-label={label}
          aria-activedescendant={`${id}-option-${activeIndex}`}
          tabIndex={-1}
          onKeyDown={handleListboxKeyDown}
        >
          {options.map((option, index) => {
            const isSelected = option.value === value;
            const isActive = index === activeIndex;

            return (
              <li
                key={option.value}
                id={`${id}-option-${index}`}
                className={`app-select-option${isSelected ? " is-selected" : ""}${isActive ? " is-active" : ""}`}
                role="option"
                aria-selected={isSelected}
                onClick={() => select(index)}
                onMouseMove={() => setActiveIndex(index)}
              >
                <span>{option.label}</span>
                {isSelected ? <Check size={16} weight="bold" aria-hidden="true" /> : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
