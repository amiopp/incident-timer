export type Severity = "GREEN" | "ORANGE" | "RED";

export type SeverityLabel = "MINEUR" | "MODÉRÉ" | "CRITIQUE";

export type ActionType = "PASSENGER_ANNOUNCEMENT" | "ON_CALL_CONTACT";

export type ActionStatus = {
  done: boolean;
  doneAt: string | null;
  doneBy?: string;
};

export type IncidentActionState = {
  passengerAnnouncement: ActionStatus;
  onCallContact: ActionStatus;
};

export type IncidentAuditEventType =
  | "INCIDENT_STARTED"
  | "INCIDENT_RESOLVED"
  | "SEVERITY_CHANGED"
  | "PASSENGER_ANNOUNCEMENT_DONE"
  | "PASSENGER_ANNOUNCEMENT_RESET"
  | "ON_CALL_CONTACT_DONE"
  | "ON_CALL_CONTACT_RESET";

export type IncidentAuditEvent = {
  id: string;
  incidentId: number;
  type: IncidentAuditEventType;
  timestamp: string;
  severity?: Severity;
  doneBy?: string;
  note?: string;
};

export type IncidentModel = {
  id: number;
  message: string;
  status: "ACTIVE" | "RESOLVED";
  startedAt: string;
  resolvedAt: string | null;
  durationSeconds: number | null;
  startLevel: Severity;
  maxLevelReached: Severity;
  actionState: IncidentActionState;
  severityHistory: Array<{ severity: Severity; changedAt: string }>;
};

export const SEVERITY_LABELS: Record<Severity, SeverityLabel> = {
  GREEN: "MINEUR",
  ORANGE: "MODÉRÉ",
  RED: "CRITIQUE",
};

export function createDefaultActionState(): IncidentActionState {
  return {
    passengerAnnouncement: {
      done: false,
      doneAt: null,
    },
    onCallContact: {
      done: false,
      doneAt: null,
    },
  };
}
