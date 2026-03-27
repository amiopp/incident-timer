import { useEffect, useRef, useState } from "react";

import { type RemoteMode } from "../hooks/useRemoteNavigation";
import "./remoteActionBar.css";

type RemoteActionBarProps = {
  mode: RemoteMode;
  busy: boolean;
  canResolve: boolean;
  targetIncidentLabel: string;
  onSelectPreviousIncident: () => void;
  onSelectNextIncident: () => void;
  onToggleMode: () => void;
  onPassengerAction: () => void;
  onOnCallAction: () => void;
  onResolveAction: () => void;
};

export default function RemoteActionBar({
  mode,
  busy,
  canResolve,
  targetIncidentLabel,
  onSelectPreviousIncident,
  onSelectNextIncident,
  onToggleMode,
  onPassengerAction,
  onOnCallAction,
  onResolveAction,
}: RemoteActionBarProps) {
  const [holdProgress, setHoldProgress] = useState(0);
  const holdStartRef = useRef<number | null>(null);
  const intervalRef = useRef<number | null>(null);

  function clearHold() {
    holdStartRef.current = null;
    setHoldProgress(0);
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }

  function triggerHold() {
    if (!canResolve || busy) return;

    holdStartRef.current = Date.now();
    intervalRef.current = window.setInterval(() => {
      if (!holdStartRef.current) return;
      const elapsed = Date.now() - holdStartRef.current;
      const ratio = Math.min(1, elapsed / 1500);
      setHoldProgress(ratio);
      if (ratio >= 1) {
        clearHold();
        onResolveAction();
      }
    }, 30);
  }

  useEffect(() => {
    return () => clearHold();
  }, []);

  return (
    <div className="remote-action-bar" aria-label="Barre de télécommande">
      <div className="remote-target-box">
        <button
          type="button"
          data-remote-id="remote-target-prev"
          className="remote-btn remote-target-nav"
          onClick={onSelectPreviousIncident}
          disabled={busy || !canResolve}
        >
          ◀ Incident
        </button>
        <div className="remote-target-label">Cible: {targetIncidentLabel}</div>
        <button
          type="button"
          data-remote-id="remote-target-next"
          className="remote-btn remote-target-nav"
          onClick={onSelectNextIncident}
          disabled={busy || !canResolve}
        >
          Incident ▶
        </button>
      </div>

      <button
        type="button"
        data-remote-id="remote-mode"
        className={`remote-btn ${mode === "navigation" ? "active" : ""}`}
        onClick={onToggleMode}
      >
        Mode : {mode === "direct" ? "HOTKEYS" : "NAVIGATION"}
      </button>

      <button
        type="button"
        data-remote-id="remote-passenger"
        className="remote-btn"
        onClick={onPassengerAction}
        disabled={busy || !canResolve}
      >
        Annonce faite
      </button>

      <button
        type="button"
        data-remote-id="remote-oncall"
        className="remote-btn"
        onClick={onOnCallAction}
        disabled={busy || !canResolve}
      >
        Astreinte contactée
      </button>

      <button
        type="button"
        data-remote-id="remote-resolve"
        className="remote-btn danger"
        onMouseDown={triggerHold}
        onMouseUp={clearHold}
        onMouseLeave={clearHold}
        onTouchStart={triggerHold}
        onTouchEnd={clearHold}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            triggerHold();
          }
        }}
        onKeyUp={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            clearHold();
          }
        }}
        disabled={busy || !canResolve}
      >
        Résolu (maintenir 1.5s)
        <span className="remote-hold-meter" aria-hidden="true">
          <span style={{ width: `${Math.round(holdProgress * 100)}%` }} />
        </span>
      </button>
    </div>
  );
}
