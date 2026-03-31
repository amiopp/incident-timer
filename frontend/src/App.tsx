import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";

import RemoteActionBar from "./components/RemoteActionBar";
import { type RemoteMode, useRemoteNavigation } from "./hooks/useRemoteNavigation";
import {
  type IncidentActionState,
  type IncidentAuditEvent,
  type Severity,
  SEVERITY_LABELS,
  createDefaultActionState,
} from "./types";

type IncidentLine = "T1" | "T2" | "T3" | "T4" | "BW1" | "BW2";

type ApiIncident = {
  id: number;
  line: IncidentLine | null;
  message: string;
  status: "ACTIVE" | "RESOLVED";
  started_at: string;
  resolved_at: string | null;
  duration_seconds: number | null;
  start_level: Severity;
  max_level_reached: Severity;
};

type HistoryResponse = {
  items: ApiIncident[];
  total: number;
  limit: number;
  offset: number;
};

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";
const WS_URL = import.meta.env.VITE_WS_URL || "ws://localhost:8000/ws";
const INCIDENT_CHOICES_STORAGE_KEY = "pcc_incident_choices_v1";
const INCIDENT_ACTIONS_STORAGE_KEY = "pcc_incident_actions_v1";
const INCIDENT_AUDIT_STORAGE_KEY = "pcc_incident_audit_v1";
const INCIDENT_LINES: IncidentLine[] = ["T1", "T2", "T3", "T4", "BW1", "BW2"];
const INCIDENT_LINE_PREFIX_PATTERN = /^\[(T1|T2|T3|T4|BW1|BW2)\]\s*/i;

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

function formatHHMMSS(total: number) {
  const hh = Math.floor(total / 3600)
    .toString()
    .padStart(2, "0");
  const mm = Math.floor((total % 3600) / 60)
    .toString()
    .padStart(2, "0");
  const ss = (total % 60).toString().padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function elapsedSeconds(startedAt: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000));
}

function getCurrentLevel(incident: ApiIncident, elapsed: number): Severity {
  if (incident.start_level === "RED") return "RED";
  if (incident.start_level === "ORANGE") {
    return elapsed >= 15 * 60 ? "RED" : "ORANGE";
  }
  if (elapsed >= 30 * 60) return "RED";
  if (elapsed >= 15 * 60) return "ORANGE";
  return "GREEN";
}

function getSeverityLabel(level: Severity) {
  return SEVERITY_LABELS[level];
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

function parseIncidentLine(message: string) {
  const match = message.match(INCIDENT_LINE_PREFIX_PATTERN);
  const line = match?.[1]?.toUpperCase() ?? null;
  const displayMessage = message.replace(INCIDENT_LINE_PREFIX_PATTERN, "").trim();
  return { line, displayMessage };
}

function withIncidentLine(message: string, line: IncidentLine) {
  const base = message.trim().replace(INCIDENT_LINE_PREFIX_PATTERN, "");
  return `[${line}] ${base}`;
}

function getIncidentDisplay(incident: ApiIncident) {
  const parsed = parseIncidentLine(incident.message);
  return {
    line: incident.line ?? parsed.line,
    displayMessage: parsed.displayMessage,
  };
}

export default function App() {
  const [incidents, setIncidents] = useState<ApiIncident[]>([]);
  const [nowTick, setNowTick] = useState(0);
  const [busy, setBusy] = useState(false);
  const [showChooser, setShowChooser] = useState(false);
  const [customMessage, setCustomMessage] = useState("");
  const [selectedIncidentLine, setSelectedIncidentLine] = useState<"" | IncidentLine>("");
  const [selectedStartLevel, setSelectedStartLevel] = useState<"GREEN" | "ORANGE" | "RED">("GREEN");
  const [incidentChoices, setIncidentChoices] = useState<string[]>(INCIDENT_CHOICES);
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [historyItems, setHistoryItems] = useState<ApiIncident[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyFrom, setHistoryFrom] = useState("");
  const [historyTo, setHistoryTo] = useState("");
  const [historyIncident, setHistoryIncident] = useState("");
  const [historyType, setHistoryType] = useState("");
  const [historyLine, setHistoryLine] = useState<"" | (typeof INCIDENT_LINES)[number]>("");
  const [historySeverity, setHistorySeverity] = useState<"" | "GREEN" | "ORANGE" | "RED">("");
  const [remoteMode, setRemoteMode] = useState<RemoteMode>("direct");
  const [selectedRemoteIncidentId, setSelectedRemoteIncidentId] = useState<number | null>(null);
  const [actionStateByIncident, setActionStateByIncident] = useState<Record<number, IncidentActionState>>({});
  const [auditHistory, setAuditHistory] = useState<IncidentAuditEvent[]>([]);
  const severityRefByIncident = useRef<Record<number, Severity>>({});
  const actionStateRef = useRef<Record<number, IncidentActionState>>({});

  const visible = useMemo(() => incidents, [incidents]);
  const primaryIncident = visible[0] ?? null;
  const selectedRemoteIncident =
    visible.find((incident) => incident.id === selectedRemoteIncidentId) ?? primaryIncident ?? null;
  const selectedRemoteIncidentParsed = selectedRemoteIncident ? getIncidentDisplay(selectedRemoteIncident) : null;

  useEffect(() => {
    if (visible.length === 0) {
      setSelectedRemoteIncidentId(null);
      return;
    }

    const hasSelected = selectedRemoteIncidentId !== null && visible.some((item) => item.id === selectedRemoteIncidentId);
    if (!hasSelected) {
      setSelectedRemoteIncidentId(visible[0].id);
    }
  }, [visible, selectedRemoteIncidentId]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(INCIDENT_CHOICES_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return;
      const cleaned = parsed
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter((item) => item.length > 0);

      if (cleaned.length > 0) {
        setIncidentChoices(cleaned);
      }
    } catch {
      // ignore corrupted local storage
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(INCIDENT_CHOICES_STORAGE_KEY, JSON.stringify(incidentChoices));
  }, [incidentChoices]);

  useEffect(() => {
    try {
      const rawActions = window.localStorage.getItem(INCIDENT_ACTIONS_STORAGE_KEY);
      if (rawActions) {
        const parsed = JSON.parse(rawActions) as Record<number, IncidentActionState>;
        setActionStateByIncident(parsed);
      }
      const rawAudit = window.localStorage.getItem(INCIDENT_AUDIT_STORAGE_KEY);
      if (rawAudit) {
        const parsedAudit = JSON.parse(rawAudit) as IncidentAuditEvent[];
        setAuditHistory(parsedAudit);
      }
    } catch {
      // ignore invalid persistence data
    }
  }, []);

  useEffect(() => {
    actionStateRef.current = actionStateByIncident;
    window.localStorage.setItem(INCIDENT_ACTIONS_STORAGE_KEY, JSON.stringify(actionStateByIncident));
  }, [actionStateByIncident]);

  useEffect(() => {
    window.localStorage.setItem(INCIDENT_AUDIT_STORAGE_KEY, JSON.stringify(auditHistory));
  }, [auditHistory]);

  function pushAuditEvent(event: Omit<IncidentAuditEvent, "id">) {
    const id = `${event.incidentId}-${event.type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setAuditHistory((prev) => [{ id, ...event }, ...prev].slice(0, 2000));
  }

  function getActionState(incidentId: number): IncidentActionState {
    return actionStateByIncident[incidentId] ?? createDefaultActionState();
  }

  function togglePassengerDone(incidentId: number) {
    setActionStateByIncident((prev) => {
      const current = prev[incidentId] ?? createDefaultActionState();
      const done = !current.passengerAnnouncement.done;
      const next: IncidentActionState = {
        ...current,
        passengerAnnouncement: {
          ...current.passengerAnnouncement,
          done,
          doneAt: done ? new Date().toISOString() : null,
          doneBy: "OPÉRATEUR PCC",
        },
      };
      return { ...prev, [incidentId]: next };
    });

    pushAuditEvent({
      incidentId,
      timestamp: new Date().toISOString(),
      type: getActionState(incidentId).passengerAnnouncement.done
        ? "PASSENGER_ANNOUNCEMENT_RESET"
        : "PASSENGER_ANNOUNCEMENT_DONE",
      doneBy: "OPÉRATEUR PCC",
    });
  }

  function toggleOnCallDone(incidentId: number) {
    setActionStateByIncident((prev) => {
      const current = prev[incidentId] ?? createDefaultActionState();
      const done = !current.onCallContact.done;
      const next: IncidentActionState = {
        ...current,
        onCallContact: {
          ...current.onCallContact,
          done,
          doneAt: done ? new Date().toISOString() : null,
          doneBy: "OPÉRATEUR PCC",
        },
      };
      return { ...prev, [incidentId]: next };
    });

    pushAuditEvent({
      incidentId,
      timestamp: new Date().toISOString(),
      type: getActionState(incidentId).onCallContact.done ? "ON_CALL_CONTACT_RESET" : "ON_CALL_CONTACT_DONE",
      doneBy: "OPÉRATEUR PCC",
    });
  }

  async function fetchActive() {
    const response = await fetch(`${API_BASE_URL}/api/incidents/active`);
    if (!response.ok) {
      throw new Error("Failed to load active incidents");
    }
    const data = (await response.json()) as ApiIncident[];
    setIncidents(data);
  }

  async function fetchHistory(filters?: {
    from?: string;
    to?: string;
    incident?: string;
    incidentType?: string;
    line?: "" | (typeof INCIDENT_LINES)[number];
    severity?: "" | "GREEN" | "ORANGE" | "RED";
  }) {
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
      if (filters?.incident && filters.incident.trim()) {
        params.set("incident", filters.incident.trim());
      }
      if (filters?.incidentType && filters.incidentType.trim()) {
        params.set("incident_type", filters.incidentType.trim());
      }
      if (filters?.line) {
        params.set("line", filters.line);
      }
      if (filters?.severity) {
        params.set("severity", filters.severity);
      }

      const response = await fetch(`${API_BASE_URL}/api/incidents/history?${params.toString()}`);
      if (!response.ok) {
        throw new Error("Failed to load history");
      }
      const payload = (await response.json()) as HistoryResponse;
      const lineFilter = filters?.line ?? "";
      const filteredItems = lineFilter
        ? payload.items.filter((item) => getIncidentDisplay(item).line === lineFilter)
        : payload.items;
      setHistoryItems(filteredItems);
    } catch {
      setHistoryError("Impossible de charger l'historique");
    } finally {
      setHistoryLoading(false);
    }
  }

  function openHistory() {
    setShowHistory(true);
    void fetchHistory({
      from: historyFrom,
      to: historyTo,
      incident: historyIncident,
      incidentType: historyType,
      line: historyLine,
      severity: historySeverity,
    });
  }

  function applyHistoryFilters() {
    void fetchHistory({
      from: historyFrom,
      to: historyTo,
      incident: historyIncident,
      incidentType: historyType,
      line: historyLine,
      severity: historySeverity,
    });
  }

  function submitHistoryFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    applyHistoryFilters();
  }

  function clearHistoryFilters() {
    setHistoryFrom("");
    setHistoryTo("");
    setHistoryIncident("");
    setHistoryType("");
    setHistoryLine("");
    setHistorySeverity("");
    void fetchHistory();
  }

  function applyTodayPreset() {
    const today = toDateInputValue(new Date());
    setHistoryFrom(today);
    setHistoryTo(today);
    void fetchHistory({
      from: today,
      to: today,
      incident: historyIncident,
      incidentType: historyType,
      line: historyLine,
      severity: historySeverity,
    });
  }

  function applyYesterdayPreset() {
    const date = new Date();
    date.setDate(date.getDate() - 1);
    const yesterday = toDateInputValue(date);
    setHistoryFrom(yesterday);
    setHistoryTo(yesterday);
    void fetchHistory({
      from: yesterday,
      to: yesterday,
      incident: historyIncident,
      incidentType: historyType,
      line: historyLine,
      severity: historySeverity,
    });
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
    void fetchHistory({
      from: start,
      to: end,
      incident: historyIncident,
      incidentType: historyType,
      line: historyLine,
      severity: historySeverity,
    });
  }

  function exportHistoryCsv() {
    const headers = ["ligne", "incident", "debut", "resolution", "duree", "statut", "niveau_max"];
    const rows = historyItems.map((item) => {
        const parsed = getIncidentDisplay(item);
      return [
          parsed.line ?? "",
          parsed.displayMessage,
          item.started_at,
          item.resolved_at ?? "",
          formatDuration(item.duration_seconds),
          item.status,
          item.max_level_reached,
        ];
    });

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

  async function startIncident(
    message: string,
    startLevel: "GREEN" | "ORANGE" | "RED",
    line: "" | IncidentLine = selectedIncidentLine,
  ) {
    if (busy) return;
    const trimmedMessage = message.trim();
    if (!trimmedMessage) {
      setError("Le texte de l'incident est obligatoire");
      return;
    }
    if (!line) {
      setError("Veuillez sélectionner une ligne avant de démarrer l'incident");
      return;
    }
    const finalMessage = withIncidentLine(trimmedMessage, line);

    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/incidents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: finalMessage, start_level: startLevel, line }),
      });
      if (!response.ok) {
        throw new Error("Failed to create incident");
      }
      const created = (await response.json()) as ApiIncident;
      pushAuditEvent({
        incidentId: created.id,
        timestamp: new Date().toISOString(),
        type: "INCIDENT_STARTED",
        severity: startLevel,
        note: created.message,
      });
      await fetchActive();
      setCustomMessage("");
      setShowChooser(false);
    } catch {
      setError("Impossible de créer l'incident");
    } finally {
      setBusy(false);
    }
  }

  function addIncidentChoice() {
    const value = customMessage.trim();
    if (!value) {
      setError("Le texte de l'incident est obligatoire");
      return;
    }
    if (incidentChoices.some((item) => item.toLowerCase() === value.toLowerCase())) {
      setError("Cet incident existe déjà dans la liste");
      return;
    }

    setIncidentChoices((prev) => [value, ...prev]);
    setCustomMessage("");
    setError(null);
  }

  function deleteIncidentChoice(value: string) {
    setIncidentChoices((prev) => prev.filter((item) => item !== value));
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
      pushAuditEvent({
        incidentId: id,
        timestamp: new Date().toISOString(),
        type: "INCIDENT_RESOLVED",
        doneBy: "OPÉRATEUR PCC",
      });
      await fetchActive();
    } catch {
      setError("Impossible de résoudre l'incident");
    } finally {
      setBusy(false);
    }
  }

  async function forceRedIncident(id: number) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/incidents/${id}/force-red`, {
        method: "POST",
      });
      if (!response.ok) {
        throw new Error("Failed to force red");
      }
      pushAuditEvent({
        incidentId: id,
        timestamp: new Date().toISOString(),
        type: "SEVERITY_CHANGED",
        severity: "RED",
        doneBy: "OPÉRATEUR PCC",
      });
      await fetchActive();
    } catch {
      setError("Impossible de passer en rouge");
    } finally {
      setBusy(false);
    }
  }

  async function forceOrangeIncident(id: number) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/incidents/${id}/force-orange`, {
        method: "POST",
      });
      if (!response.ok) {
        throw new Error("Failed to force orange");
      }
      pushAuditEvent({
        incidentId: id,
        timestamp: new Date().toISOString(),
        type: "SEVERITY_CHANGED",
        severity: "ORANGE",
        doneBy: "OPÉRATEUR PCC",
      });
      await fetchActive();
    } catch {
      setError("Impossible de passer en orange");
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

  useEffect(() => {
    const nextByIncident: Record<number, Severity> = {};

    for (const incident of visible) {
      const severity = getCurrentLevel(incident, elapsedSeconds(incident.started_at));
      nextByIncident[incident.id] = severity;

      const previousSeverity = severityRefByIncident.current[incident.id];
      if (previousSeverity && previousSeverity !== severity) {
        pushAuditEvent({
          incidentId: incident.id,
          timestamp: new Date().toISOString(),
          type: "SEVERITY_CHANGED",
          severity,
        });
      }
    }

    severityRefByIncident.current = nextByIncident;
  }, [visible, nowTick]);

  function closeTransientPanels() {
    if (showHistory) {
      setShowHistory(false);
      return;
    }
    if (showChooser) {
      setShowChooser(false);
      return;
    }
    setRemoteMode("direct");
  }

  function runPrimaryAction() {
    if (!selectedRemoteIncident) {
      setShowChooser(true);
      return;
    }

    const elapsed = elapsedSeconds(selectedRemoteIncident.started_at);
    const severity = getCurrentLevel(selectedRemoteIncident, elapsed);
    const actionState = actionStateRef.current[selectedRemoteIncident.id] ?? createDefaultActionState();

    if (!actionState.passengerAnnouncement.done) {
      togglePassengerDone(selectedRemoteIncident.id);
      return;
    }

    if (severity === "RED" && !actionState.onCallContact.done) {
      toggleOnCallDone(selectedRemoteIncident.id);
    }
  }

  function runSecureResolveFromRemote() {
    if (!selectedRemoteIncident || busy) return;
    void resolveIncident(selectedRemoteIncident.id);
  }

  function selectPreviousIncident() {
    if (visible.length <= 1 || !selectedRemoteIncident) return;
    const currentIndex = visible.findIndex((item) => item.id === selectedRemoteIncident.id);
    const nextIndex = (currentIndex - 1 + visible.length) % visible.length;
    setSelectedRemoteIncidentId(visible[nextIndex].id);
  }

  function selectNextIncident() {
    if (visible.length <= 1 || !selectedRemoteIncident) return;
    const currentIndex = visible.findIndex((item) => item.id === selectedRemoteIncident.id);
    const nextIndex = (currentIndex + 1) % visible.length;
    setSelectedRemoteIncidentId(visible[nextIndex].id);
  }

  const remoteTargetIds = [
    "action-passenger",
    "action-oncall",
    "remote-target-prev",
    "remote-target-next",
    "remote-mode",
    "remote-passenger",
    "remote-oncall",
    "remote-resolve",
    "toolbar-add",
    "toolbar-history",
  ];

  useRemoteNavigation({
    enabled: !showChooser && !showHistory,
    mode: remoteMode,
    targetIds: remoteTargetIds,
    onPrimaryAction: runPrimaryAction,
    onSecureResolveAction: runSecureResolveFromRemote,
    onBackAction: closeTransientPanels,
  });

  return (
    <div className={`screen ${visible.length >= 2 ? "split" : "single"}`}>
      <div className="toolbar">
        <button data-remote-id="toolbar-add" className="add-btn" onClick={() => setShowChooser(true)} disabled={busy}>
          + Ajouter incident
        </button>
        <button data-remote-id="toolbar-history" className="history-btn" onClick={openHistory} disabled={busy}>
          Historique
        </button>
        {error && <div className="error-msg">{error}</div>}
      </div>

      {visible.length === 0 ? (
        <button className="start-btn" onClick={() => setShowChooser(true)} disabled={busy}>
          {busy ? (
            <span className="start-btn-label">DÉMARRAGE...</span>
          ) : (
            <>
              <span className="start-btn-icon" aria-hidden="true">
                🚀
              </span>
              <span className="start-btn-label">DÉMARRER INCIDENT</span>
            </>
          )}
        </button>
      ) : (
        visible.map((incident) => {
          const parsedIncident = getIncidentDisplay(incident);
          const elapsed = elapsedSeconds(incident.started_at);
          const currentLevel = getCurrentLevel(incident, elapsed);
          const incidentActionState = getActionState(incident.id);
          const levelClass = currentLevel.toLowerCase();
          const isSelectedRemoteTarget = selectedRemoteIncident?.id === incident.id;
          const durationParts = formatHHMMSS(elapsed).split(":");
          const startedAtClock = new Date(incident.started_at).toLocaleTimeString("fr-FR", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: false,
          });
          return (
            <section
              key={incident.id}
              className={`panel ${levelClass} ${isSelectedRemoteTarget ? "panel-selected" : ""}`}
            >
              <div className="panel-topbar">
                <div className="panel-urgency">⚠ URGENCE</div>
                <div className="panel-top-actions">
                  <button
                    type="button"
                    data-remote-id="action-passenger"
                    className={`panel-badge ${incidentActionState.passengerAnnouncement.done ? "is-done" : ""}`}
                    onClick={() => togglePassengerDone(incident.id)}
                  >
                    {incidentActionState.passengerAnnouncement.done ? "✅ ANNONCE FAITE" : "🔔 ANNONCE VOYAGEUR"}
                  </button>
                  {currentLevel === "RED" && (
                    <button
                      type="button"
                      data-remote-id="action-oncall"
                      className={`panel-badge ${incidentActionState.onCallContact.done ? "is-done" : "is-critical"}`}
                      onClick={() => toggleOnCallDone(incident.id)}
                    >
                      {incidentActionState.onCallContact.done ? "✅ ASTREINTE FAITE" : "🚨 ASTREINTE"}
                    </button>
                  )}
                  <button
                    type="button"
                    className="panel-close"
                    onClick={() => void resolveIncident(incident.id)}
                    disabled={busy}
                    title="Résoudre l'incident"
                  >
                    ✕
                  </button>
                </div>
              </div>

              <div className="panel-main">
                <div className="panel-level-tag">{getSeverityLabel(currentLevel)}</div>
                <h1>ALERTE - INCIDENT EN COURS</h1>
                <div className="panel-line">Ligne : {parsedIncident.line ?? "NON DÉFINIE"}</div>
                <div className="panel-incident-name">{parsedIncident.displayMessage}</div>
                <div className="panel-started-time">Déclenché à {startedAtClock}</div>
                <div className="panel-duration-wrap">
                  <div className="panel-duration-title">Duree incident</div>
                  <div className="panel-time-grid">
                    <div className="panel-time-block">
                      <span className="panel-time-value">{durationParts[0]}</span>
                      <span className="panel-time-label">Heures</span>
                    </div>
                    <span className="panel-time-sep">:</span>
                    <div className="panel-time-block">
                      <span className="panel-time-value">{durationParts[1]}</span>
                      <span className="panel-time-label">Minutes</span>
                    </div>
                    <span className="panel-time-sep">:</span>
                    <div className="panel-time-block">
                      <span className="panel-time-value">{durationParts[2]}</span>
                      <span className="panel-time-label">Secondes</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="panel-actions">
                {currentLevel === "GREEN" && (
                  <button
                    className="force-orange-btn"
                    onClick={() => void forceOrangeIncident(incident.id)}
                    disabled={busy}
                  >
                    {busy ? "..." : "Passer en modéré"}
                  </button>
                )}
                {currentLevel !== "RED" && (
                  <button className="force-red-btn" onClick={() => void forceRedIncident(incident.id)} disabled={busy}>
                    {busy ? "..." : "Passer en critique"}
                  </button>
                )}
              </div>
            </section>
          );
        })
      )}

      <RemoteActionBar
        mode={remoteMode}
        busy={busy}
        canResolve={Boolean(selectedRemoteIncident)}
        targetIncidentLabel={
          selectedRemoteIncident
            ? `#${selectedRemoteIncident.id} — Ligne: ${selectedRemoteIncidentParsed?.line ?? "N/A"} — ${selectedRemoteIncidentParsed?.displayMessage ?? selectedRemoteIncident.message}`
            : "Aucun incident"
        }
        onSelectPreviousIncident={selectPreviousIncident}
        onSelectNextIncident={selectNextIncident}
        onToggleMode={() => setRemoteMode((prev) => (prev === "direct" ? "navigation" : "direct"))}
        onPassengerAction={() => {
          if (!selectedRemoteIncident) return;
          togglePassengerDone(selectedRemoteIncident.id);
        }}
        onOnCallAction={() => {
          if (!selectedRemoteIncident) return;
          toggleOnCallDone(selectedRemoteIncident.id);
        }}
        onResolveAction={runSecureResolveFromRemote}
      />

      {showChooser && (
        <div className="modal-overlay" onClick={() => setShowChooser(false)}>
          <div className="modal chooser-modal" onClick={(event) => event.stopPropagation()}>
            <h2>Choisir un incident</h2>
            <div className="level-select">
              <button
                className={`level-btn ${selectedStartLevel === "GREEN" ? "active green" : ""}`}
                onClick={() => setSelectedStartLevel("GREEN")}
                disabled={busy}
              >
                Départ Mineur
              </button>
              <button
                className={`level-btn ${selectedStartLevel === "ORANGE" ? "active orange" : ""}`}
                onClick={() => setSelectedStartLevel("ORANGE")}
                disabled={busy}
              >
                Départ Modéré
              </button>
              <button
                className={`level-btn ${selectedStartLevel === "RED" ? "active red" : ""}`}
                onClick={() => setSelectedStartLevel("RED")}
                disabled={busy}
              >
                Départ Critique
              </button>
            </div>
            <label className="incident-line-field">
              <span>Ligne concernée</span>
              <select
                value={selectedIncidentLine}
                onChange={(event) => setSelectedIncidentLine(event.target.value as "" | IncidentLine)}
                disabled={busy}
              >
                <option value="">Choisir une ligne...</option>
                {INCIDENT_LINES.map((line) => (
                  <option key={line} value={line}>
                    {line}
                  </option>
                ))}
              </select>
            </label>
            <textarea
              className="custom-input"
              rows={3}
              maxLength={500}
              value={customMessage}
              onChange={(event) => setCustomMessage(event.target.value)}
              placeholder="Entrer un nouvel incident..."
            />
            <div className="custom-action-row">
              <button className="custom-start-btn" onClick={addIncidentChoice} disabled={busy}>
                Ajouter à la liste
              </button>
              <button
                className="custom-launch-btn"
                onClick={() => void startIncident(customMessage, selectedStartLevel, selectedIncidentLine)}
                disabled={busy || customMessage.trim().length === 0 || !selectedIncidentLine}
              >
                Démarrer incident
              </button>
            </div>
            <div className="choice-list">
              {incidentChoices.map((choice) => (
                <div key={choice} className="choice-row">
                  <button
                    className="choice-btn"
                    onClick={() => void startIncident(choice, selectedStartLevel, selectedIncidentLine)}
                    disabled={busy || !selectedIncidentLine}
                  >
                    {choice}
                  </button>
                  <button
                    className="delete-choice-btn"
                    onClick={() => deleteIncidentChoice(choice)}
                    disabled={busy}
                    title="Supprimer cet incident"
                  >
                    Supprimer
                  </button>
                </div>
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
            <form className="history-controls" onSubmit={submitHistoryFilters}>
              <div className="history-filters-grid">
                <label className="history-field">
                  <span>Date début</span>
                  <input
                    type="date"
                    lang="fr-FR"
                    value={historyFrom}
                    onChange={(event) => setHistoryFrom(event.target.value)}
                  />
                </label>
                <label className="history-field">
                  <span>Date fin</span>
                  <input
                    type="date"
                    lang="fr-FR"
                    value={historyTo}
                    onChange={(event) => setHistoryTo(event.target.value)}
                  />
                </label>
                <label className="history-field">
                  <span>Gravité</span>
                  <select
                    value={historySeverity}
                    onChange={(event) =>
                      setHistorySeverity(event.target.value as "" | "GREEN" | "ORANGE" | "RED")
                    }
                  >
                    <option value="">Toutes gravités</option>
                    <option value="GREEN">Mineur</option>
                    <option value="ORANGE">Modéré</option>
                    <option value="RED">Critique</option>
                  </select>
                </label>
                <label className="history-field">
                  <span>Type d'incident</span>
                  <select value={historyType} onChange={(event) => setHistoryType(event.target.value)}>
                    <option value="">Tous types</option>
                    {incidentChoices.map((choice) => (
                      <option key={choice} value={choice}>
                        {choice}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="history-field">
                  <span>Ligne</span>
                  <select value={historyLine} onChange={(event) => setHistoryLine(event.target.value as "" | (typeof INCIDENT_LINES)[number])}>
                    <option value="">Toutes lignes</option>
                    {INCIDENT_LINES.map((line) => (
                      <option key={line} value={line}>
                        {line}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="history-field history-field-wide">
                  <span>Recherche incident</span>
                  <input
                    type="text"
                    className="history-incident-input"
                    value={historyIncident}
                    onChange={(event) => setHistoryIncident(event.target.value)}
                    placeholder="Texte incident..."
                  />
                </label>
              </div>

              <div className="history-filters-actions">
              <button type="submit" className="filter-btn" disabled={historyLoading}>
                Appliquer
              </button>
              <button type="button" className="filter-btn secondary" onClick={clearHistoryFilters} disabled={historyLoading}>
                Réinitialiser
              </button>
              <button
                type="button"
                className="filter-btn success"
                onClick={exportHistoryCsv}
                disabled={historyLoading || historyItems.length === 0}
              >
                Exporter CSV
              </button>
              </div>
            </form>
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
                      <th>Ligne</th>
                      <th>Incident</th>
                      <th>Gravité max</th>
                      <th>Début</th>
                      <th>Résolution</th>
                      <th>Durée</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyItems.length === 0 ? (
                      <tr>
                        <td colSpan={6}>Aucun incident résolu</td>
                      </tr>
                    ) : (
                      historyItems.map((item) => {
                        const parsed = parseIncidentLine(item.message);
                        return (
                          <tr key={item.id}>
                            <td>{item.line ?? parsed.line ?? "-"}</td>
                            <td>{parsed.displayMessage}</td>
                            <td>{getSeverityLabel(item.max_level_reached)}</td>
                            <td>{formatDateTime(item.started_at)}</td>
                            <td>{formatDateTime(item.resolved_at)}</td>
                            <td>{formatDuration(item.duration_seconds)}</td>
                          </tr>
                        );
                      })
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
