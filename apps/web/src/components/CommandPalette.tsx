import { useEffect, useMemo, useRef, useState } from "react";
import "./CommandPalette.css";

export interface CommandPaletteAction {
  id: string;
  label: string;
  description: string;
  shortcut?: string;
  onRun: () => void;
}

interface CommandPaletteProps {
  actions: CommandPaletteAction[];
}

export function CommandPalette({ actions }: CommandPaletteProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filteredActions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return actions;
    }
    return actions.filter((action) =>
      `${action.label} ${action.description} ${action.shortcut ?? ""}`.toLowerCase().includes(normalizedQuery)
    );
  }, [actions, query]);

  useEffect(() => {
    function handleGlobalKeyDown(event: KeyboardEvent) {
      const isPaletteShortcut = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k";
      if (isPaletteShortcut) {
        event.preventDefault();
        setOpen((current) => !current);
      }
    }

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, []);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setActiveIndex(0);
      document.body.classList.remove("evida-command-open");
      return;
    }
    document.body.classList.add("evida-command-open");
    window.setTimeout(() => inputRef.current?.focus(), 0);

    return () => document.body.classList.remove("evida-command-open");
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  function runAction(action: CommandPaletteAction) {
    action.onRun();
    setOpen(false);
  }

  function handleDialogKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => Math.min(filteredActions.length - 1, current + 1));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => Math.max(0, current - 1));
      return;
    }
    if (event.key === "Enter" && filteredActions[activeIndex]) {
      event.preventDefault();
      runAction(filteredActions[activeIndex]);
    }
  }

  return (
    <>
      <button className="evida-button command-palette__trigger" type="button" onClick={() => setOpen(true)}>
        Åpne kommandoer <span>Ctrl K</span>
      </button>

      {open ? (
        <div className="command-palette__backdrop" role="presentation" onMouseDown={() => setOpen(false)}>
          <div
            ref={dialogRef}
            className="command-palette liquid-glass-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="command-palette-title"
            tabIndex={-1}
            onKeyDown={handleDialogKeyDown}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="command-palette__header">
              <h2 id="command-palette-title">Command Palette</h2>
              <button className="evida-button" type="button" onClick={() => setOpen(false)}>
                Lukk
              </button>
            </div>
            <input
              ref={inputRef}
              aria-label="Søk i kommandoer"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Søk etter kommando eller arbeidsrom"
            />
            <div className="command-palette__list" role="listbox" aria-label="Tilgjengelige kommandoer">
              {filteredActions.length === 0 ? (
                <p className="command-palette__empty">Ingen kommandoer matcher søket.</p>
              ) : null}
              {filteredActions.map((action, index) => (
                <button
                  key={action.id}
                  className={`command-palette__item ${index === activeIndex ? "is-active" : ""}`}
                  type="button"
                  role="option"
                  aria-selected={index === activeIndex}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => runAction(action)}
                >
                  <span>
                    <strong>{action.label}</strong>
                    <small>{action.description}</small>
                  </span>
                  {action.shortcut ? <kbd>{action.shortcut}</kbd> : null}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
