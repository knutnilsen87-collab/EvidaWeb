import { FormEvent, useState } from "react";
import type { WorkspaceView } from "../../navigation";
import "./StickyChatBar.css";

type CourtMode = "ASK" | "ARGUE" | "SIMULATE";

interface StickyChatBarProps {
  activeCaseName: string | null;
  onNavigate: (view: WorkspaceView) => void;
}

const courtModes: Array<{ id: CourtMode; label: string; prompt: string }> = [
  { id: "ASK", label: "Spørre", prompt: "Spør om saken..." },
  { id: "ARGUE", label: "Argumentere", prompt: "Stresstest en anførsel..." },
  { id: "SIMULATE", label: "Simulere", prompt: "Simuler motpart eller dommer..." }
];

export function StickyChatBar({ activeCaseName, onNavigate }: StickyChatBarProps) {
  const [mode, setMode] = useState<CourtMode>("ASK");
  const [query, setQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const activeMode = courtModes.find((item) => item.id === mode) ?? courtModes[0];

  function chooseMode(nextMode: CourtMode) {
    setMode(nextMode);
    setMenuOpen(false);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (query.trim().length === 0) {
      return;
    }
    onNavigate("saksrom");
    setQuery("");
  }

  return (
    <aside className="sticky-chat-container" aria-label="EPIC Court Engine">
      <form aria-label="EPIC Court Engine kommando" className="chat-input-wrapper" onSubmit={handleSubmit}>
        <div className="chat-trigger-menu">
          <button
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            aria-label="Velg analysemodus"
            className="chat-trigger-btn"
            onClick={() => setMenuOpen((isOpen) => !isOpen)}
            type="button"
          >
            <span aria-hidden="true">+</span>
          </button>

          {menuOpen ? (
            <div className="chat-context-menu" role="menu">
              <span className="chat-menu-context">{activeCaseName ?? "Ingen aktiv sak"}</span>
              {courtModes.map((item) => (
                <button
                  aria-checked={mode === item.id}
                  className={mode === item.id ? "active" : ""}
                  key={item.id}
                  onClick={() => chooseMode(item.id)}
                  role="menuitemradio"
                  type="button"
                >
                  {item.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <input
          aria-label="Saksassistent kommando"
          className="chat-input"
          onChange={(event) => setQuery(event.target.value)}
          placeholder={activeMode.prompt}
          type="text"
          value={query}
        />

        <div className="chat-actions" aria-label="Chat-handlinger">
          <button className="action-btn" aria-label="Stemmeopptak" type="button">
            <span aria-hidden="true">Mic</span>
          </button>
          <button className="action-btn send" aria-label="Send" type="submit">
            <span aria-hidden="true">↑</span>
          </button>
        </div>
      </form>
      <p className="chat-disclaimer">Alle svar skal være kildebaserte</p>
    </aside>
  );
}
