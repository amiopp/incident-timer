import { useEffect, useMemo, useState } from "react";

type Incident = {
  id: number;
  message: string;
  status: "ACTIVE" | "RESOLVED";
  started_at: string;
  resolved_at: string | null;
  duration_seconds: number | null;
  max_level_reached: "ORANGE" | "RED" | "GREEN";
};

type HistoryResponse = {
  items: Incident[];
  total: number;
  limit: number;
  offset: number;
};

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";
const WS_URL = import.meta.env.VITE_WS_URL || "ws://localhost:8000/ws";

const INCIDENT_CHOICES = [
  "Panne signalisation",
  "Retard important ligne tram",
  "Incident voyageur",
  "Obstacle sur voie",
  "Coupure électrique secteur",
  "Arrêt d'urgence activé",
  "Problème de communication radio",
  "Incident sécurité station",
];

function formatMMSS(total: number) {
  const mm = Math.floor(total / 60)
    .toString()
    .padStart(2, "0");
  const ss = (total % 60).toString().padStart(2, "0");
  return `${mm}:${ss}`;
}

function elapsedSeconds(startedAt: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000));
}

function formatDateTime(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("fr-FR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function formatDuration(seconds: number | null) {
  if (seconds === null) return "-";
  const hh = Math.floor(seconds / 3600)
    .toString()
    .padStart(2, "0");
  const mm = Math.floor((seconds % 3600) / 60)
    .toString()
    .padStart(2, "0");
  const ss = (seconds % 60).toString().padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function escapeCsv(value: string) {
  const normalized = value.replace(/"/g, '""');
  return `"${normalized}"`;
}

export default function App() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [nowTick, setNowTick] = useState(0);
  const [busy, setBusy] = useState(false);
  const [showChooser, setShowChooser] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [historyItems, setHistoryItems] = useState<Incident[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyFrom, setHistoryFrom] = useState("");
  const [historyTo, setHistoryTo] = useState("");

  const visible = useMemo(() => incidents, [incidents]);

  async function fetchActive() {
    const response = await fetch(`${API_BASE_URL}/api/incidents/active`);
    if (!response.ok) {
      throw new Error("Failed to load active incidents");
    }
    const data = (await response.json()) as Incident[];
    setIncidents(data);
  }

  async function fetchHistory(filters?: { from?: string; to?: string }) {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const params = new URLSearchParams();
      params.set("status", "RESOLVED");
      params.set("limit", "200");
      params.set("offset", "0");

      if (filters?.from) {
        params.set("from", new Date(`${filters.from}T00:00:00`).toISOString());
      }
      if (filters?.to) {
        params.set("to", new Date(`${filters.to}T23:59:59`).toISOString());
      }

      const response = await fetch(`${API_BASE_URL}/api/incidents/history?${params.toString()}`);
      if (!response.ok) {
        throw new Error("Failed to load history");
      }
      const payload = (await response.json()) as HistoryResponse;
      setHistoryItems(payload.items);
    } catch {
      setHistoryError("Impossible de charger l'historique");
    } finally {
      setHistoryLoading(false);
    }
  }

  function openHistory() {
    setShowHistory(true);
    void fetchHistory();
  }

  function applyHistoryFilters() {
    void fetchHistory({ from: historyFrom, to: historyTo });
  }

  function clearHistoryFilters() {
    setHistoryFrom("");
    setHistoryTo("");
    void fetchHistory();
  }

  function applyTodayPreset() {
    const today = toDateInputValue(new Date());
    setHistoryFrom(today);
    setHistoryTo(today);
    void fetchHistory({ from: today, to: today });
  }

  function applyYesterdayPreset() {
    const date = new Date();
    date.setDate(date.getDate() - 1);
    const yesterday = toDateInputValue(date);
    setHistoryFrom(yesterday);
    setHistoryTo(yesterday);
    void fetchHistory({ from: yesterday, to: yesterday });
  }

  function applyThisWeekPreset() {
    const now = new Date();
    const day = now.getDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    const monday = new Date(now);
    monday.setDate(now.getDate() + mondayOffset);
    const start = toDateInputValue(monday);
    const end = toDateInputValue(now);
    setHistoryFrom(start);
    setHistoryTo(end);
    void fetchHistory({ from: start, to: end });
  }

  function exportHistoryCsv() {
    const headers = ["incident", "debut", "resolution", "duree", "statut", "niveau_max"];
    const rows = historyItems.map((item) => [
      item.message,
      item.started_at,
      item.resolved_at ?? "",
      formatDuration(item.duration_seconds),
      item.status,
      item.max_level_reached,
    ]);

    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => escapeCsv(String(cell))).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    link.href = url;
    link.download = `historique-incidents-${timestamp}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function startIncident(message: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/incidents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      if (!response.ok) {
        throw new Error("Failed to create incident");
      }
      await fetchActive();
      setShowChooser(false);
    } catch {
      setError("Impossible de créer l'incident");
    } finally {
      setBusy(false);
    }
  }

  function startRandomIncident() {
    const randomIndex = Math.floor(Math.random() * INCIDENT_CHOICES.length);
    const randomIncident = INCIDENT_CHOICES[randomIndex];
    void startIncident(randomIncident);
  }

  async function resolveIncident(id: number) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/incidents/${id}/resolve`, {
        method: "POST",
      });
      if (!response.ok) {
        throw new Error("Failed to resolve incident");
      }
      await fetchActive();
    } catch {
      setError("Impossible de résoudre l'incident");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void fetchActive().catch(() => setError("Impossible de charger les incidents"));
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => setNowTick((v) => v + 1), 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    let pollingId: number | undefined;
    const ws = new WebSocket(WS_URL);

    ws.onopen = () => {
      if (pollingId !== undefined) {
        clearInterval(pollingId);
        pollingId = undefined;
      }
      ws.send("ping");
    };

    ws.onmessage = () => {
      void fetchActive().catch(() => setError("Impossible de charger les incidents"));
    };

    ws.onerror = () => {
      if (pollingId === undefined) {
        pollingId = window.setInterval(() => {
          void fetchActive().catch(() => setError("Impossible de charger les incidents"));
        }, 5000);
      }
    };

    ws.onclose = () => {
      if (pollingId === undefined) {
        pollingId = window.setInterval(() => {
          void fetchActive().catch(() => setError("Impossible de charger les incidents"));
        }, 5000);
      }
    };

    return () => {
      ws.close();
      if (pollingId !== undefined) {
        clearInterval(pollingId);
      }
    };
  }, []);

  return (
    <div className={`screen ${visible.length >= 2 ? "split" : "single"}`}>
      <div className="toolbar">
        <button className="add-btn" onClick={() => setShowChooser(true)} disabled={busy}>
          + Ajouter incident
        </button>
        <button className="history-btn" onClick={openHistory} disabled={busy}>
          Historique
        </button>
        {error && <div className="error-msg">{error}</div>}
      </div>

      {visible.length === 0 ? (
        <button className="start-btn" onClick={() => setShowChooser(true)} disabled={busy}>
          {busy ? "DÉMARRAGE..." : "DÉMARRER INCIDENT"}
        </button>
      ) : (
        visible.map((incident) => {
          const elapsed = elapsedSeconds(incident.started_at);
          const isRed = elapsed >= 15 * 60;
          return (
            <section key={incident.id} className={`panel ${isRed ? "red" : "orange"}`}>
              <h1>{incident.message}</h1>
              <div className="timer">{formatMMSS(elapsed)}</div>
              <button className="resolve-btn" onClick={() => void resolveIncident(incident.id)} disabled={busy}>
                {busy ? "..." : "Résolu"}
              </button>
            </section>
          );
        })
      )}

      {showChooser && (
        <div className="modal-overlay" onClick={() => setShowChooser(false)}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <h2>Choisir un incident</h2>
            <button className="random-btn" onClick={startRandomIncident} disabled={busy}>
              Incident aléatoire
            </button>
            <div className="choice-list">
              {INCIDENT_CHOICES.map((choice) => (
                <button key={choice} className="choice-btn" onClick={() => void startIncident(choice)} disabled={busy}>
                  {choice}
                </button>
              ))}
            </div>
            <button className="close-btn" onClick={() => setShowChooser(false)} disabled={busy}>
              Fermer
            </button>
          </div>
        </div>
      )}

      {showHistory && (
        <div className="modal-overlay" onClick={() => setShowHistory(false)}>
          <div className="modal history-modal" onClick={(event) => event.stopPropagation()}>
            <h2>Historique des incidents</h2>
            <div className="history-filters">
              <input
                type="date"
                value={historyFrom}
                onChange={(event) => setHistoryFrom(event.target.value)}
              />
              <input
                type="date"
                value={historyTo}
                onChange={(event) => setHistoryTo(event.target.value)}
              />
              <button className="filter-btn" onClick={applyHistoryFilters} disabled={historyLoading}>
                Appliquer
              </button>
              <button className="filter-btn secondary" onClick={clearHistoryFilters} disabled={historyLoading}>
                Réinitialiser
              </button>
              <button
                className="filter-btn success"
                onClick={exportHistoryCsv}
                disabled={historyLoading || historyItems.length === 0}
              >
                Exporter CSV
              </button>
            </div>
            <div className="history-presets">
              <button className="preset-btn" onClick={applyTodayPreset} disabled={historyLoading}>
                Aujourd'hui
              </button>
              <button className="preset-btn" onClick={applyYesterdayPreset} disabled={historyLoading}>
                Hier
              </button>
              <button className="preset-btn" onClick={applyThisWeekPreset} disabled={historyLoading}>
                Cette semaine
              </button>
            </div>
            {historyLoading && <div className="history-state">Chargement...</div>}
            {historyError && <div className="history-state error-text">{historyError}</div>}

            {!historyLoading && !historyError && (
              <div className="history-table-wrap">
                <table className="history-table">
                  <thead>
                    <tr>
                      <th>Incident</th>
                      <th>Début</th>
                      <th>Résolution</th>
                      <th>Durée</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyItems.length === 0 ? (
                      <tr>
                        <td colSpan={4}>Aucun incident résolu</td>
                      </tr>
                    ) : (
                      historyItems.map((item) => (
                        <tr key={item.id}>
                          <td>{item.message}</td>
                          <td>{formatDateTime(item.started_at)}</td>
                          <td>{formatDateTime(item.resolved_at)}</td>
                          <td>{formatDuration(item.duration_seconds)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}

            <button className="close-btn" onClick={() => setShowHistory(false)}>
              Fermer
            </button>
          </div>
        </div>
      )}

      <span className="hidden-tick">{nowTick}</span>
    </div>
  );
}
