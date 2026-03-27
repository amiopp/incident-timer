import { type ActionType, type Severity } from "../types";
import "./alertBanner.css";

type AlertBannerProps = {
  severity: Severity;
  passengerDone: boolean;
  onCallDone: boolean;
  onTogglePassenger: () => void;
  onToggleOnCall: () => void;
  inline?: boolean;
};

type BannerVisualState = "idle" | "orange" | "red" | "done";

function getBannerText(severity: Severity, passengerDone: boolean, onCallDone: boolean) {
  if (severity === "GREEN" || severity === "ORANGE") {
    return passengerDone ? "ANNONCE VOYAGEURS — FAIT" : "ANNONCE VOYAGEURS — À DIFFUSER";
  }

  if (!passengerDone && !onCallDone) {
    return "CRITIQUE : ANNONCE VOYAGEURS + ASTREINTE — URGENT";
  }

  if (!passengerDone) {
    return "CRITIQUE : ANNONCE VOYAGEURS — À DIFFUSER";
  }

  if (!onCallDone) {
    return "CRITIQUE : ASTREINTE — À CONTACTER";
  }

  return "CRITIQUE — ACTIONS FAITES";
}

function getVisualState(severity: Severity, passengerDone: boolean, onCallDone: boolean): BannerVisualState {
  if (severity !== "RED") {
    return passengerDone ? "done" : "orange";
  }

  if (passengerDone && onCallDone) {
    return "done";
  }

  return "red";
}

function actionRequired(action: ActionType, severity: Severity) {
  if (action === "PASSENGER_ANNOUNCEMENT") {
    return true;
  }

  if (action === "ON_CALL_CONTACT") {
    return severity === "RED";
  }

  return false;
}

export default function AlertBanner({
  severity,
  passengerDone,
  onCallDone,
  onTogglePassenger,
  onToggleOnCall,
  inline = false,
}: AlertBannerProps) {
  const visualState = getVisualState(severity, passengerDone, onCallDone);
  const text = getBannerText(severity, passengerDone, onCallDone);

  const passengerNeeded = actionRequired("PASSENGER_ANNOUNCEMENT", severity);
  const onCallNeeded = actionRequired("ON_CALL_CONTACT", severity);
  const isPulse = (passengerNeeded && !passengerDone) || (onCallNeeded && !onCallDone);

  return (
    <div
      className={`alert-banner ${inline ? "alert-banner--inline" : ""} alert-banner--${visualState} ${
        isPulse ? "alert-banner--pulse" : ""
      }`}
      role="status"
      aria-live="polite"
    >
      <div className="alert-banner__label">
        <span className="alert-banner__icon" aria-hidden="true">
          {visualState === "red" ? "⚠" : "🔔"}
        </span>
        <span>{text}</span>
      </div>

      <div className="alert-banner__actions">
        {passengerNeeded && (
          <button
            type="button"
            data-remote-id="action-passenger"
            className={`alert-toggle ${passengerDone ? "is-done" : ""}`}
            onClick={onTogglePassenger}
          >
            {passengerDone ? "Annonce faite" : "Annonce voyageurs"}
          </button>
        )}

        {onCallNeeded && (
          <button
            type="button"
            data-remote-id="action-oncall"
            className={`alert-toggle ${onCallDone ? "is-done" : ""}`}
            onClick={onToggleOnCall}
          >
            {onCallDone ? "Astreinte contactée" : "Astreinte"}
          </button>
        )}
      </div>
    </div>
  );
}
