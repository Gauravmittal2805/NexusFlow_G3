/**
 * AlertToast.jsx — Real-Time Alert Toast Notification Component
 *
 * Implements:
 * - Step 4: Displays real-time alert toast without page refresh
 * - Step 5: Supports alert severity (HIGH 🔴, MEDIUM 🟡, LOW 🟢)
 * - Step 6: Shows structured trigger information (Rule, Sensor, Value, Time)
 * - Step 7: Navigates to existing /alerts page with selected alert on click
 * - Step 8: Works with AlertContext duplicate prevention & cooldown
 */

import React from "react";
import { useNavigate } from "react-router-dom";
import { useAlerts } from "../context/AlertContext";
import { formatTime } from "../utils/dateUtils";

const SEVERITY_CONFIG = {
  HIGH: {
    label: "HIGH",
    icon: "🔴",
    badgeClass: "sev-badge-high",
    borderClass: "toast-sev-high",
  },
  MEDIUM: {
    label: "MEDIUM",
    icon: "🟡",
    badgeClass: "sev-badge-medium",
    borderClass: "toast-sev-medium",
  },
  LOW: {
    label: "LOW",
    icon: "🟢",
    badgeClass: "sev-badge-low",
    borderClass: "toast-sev-low",
  },
};

export default function AlertToast() {
  const { toast, dismissToast, setSelectedAlertId } = useAlerts();
  const navigate = useNavigate();

  if (!toast) return null;

  const sevKey = (toast.severity || "HIGH").toUpperCase();
  const config = SEVERITY_CONFIG[sevKey] || SEVERITY_CONFIG.HIGH;
  const timeStr = formatTime(toast.timestamp || Date.now());

  // Extract structured metric value display e.g. "Temperature: 85°C"
  let valueDisplay = toast.valueDisplay || "";
  if (!valueDisplay && toast.field && toast.value !== undefined && toast.value !== null) {
    const unit = toast.field.toLowerCase().includes("temp") ? "°C"
               : toast.field.toLowerCase().includes("press") ? " PSI"
               : toast.field.toLowerCase().includes("rpm") ? " RPM"
               : toast.field.toLowerCase().includes("humid") ? "%" : "";
    valueDisplay = `${toast.field.charAt(0).toUpperCase() + toast.field.slice(1)}: ${toast.value}${unit}`;
  }

  const handleToastClick = () => {
    if (setSelectedAlertId) {
      setSelectedAlertId(toast._id || toast.id || toast.alertId);
    }
    dismissToast();
    navigate("/alerts");
  };

  const handleCloseClick = (e) => {
    e.stopPropagation();
    dismissToast();
  };

  return (
    <div
      className={`alert-toast-container ${config.borderClass}`}
      role="alert"
      onClick={handleToastClick}
      title="Click to view alert details"
    >
      {/* Top Row: Severity Badge + Time + Close Button */}
      <div className="alert-toast-top-row">
        <span className={`toast-severity-badge ${config.badgeClass}`}>
          {config.icon} {config.label}
        </span>
        <span className="toast-timestamp">{timeStr}</span>
        <button
          type="button"
          className="alert-toast-close-btn"
          onClick={handleCloseClick}
          aria-label="Dismiss alert toast"
          title="Dismiss"
        >
          ✕
        </button>
      </div>

      {/* Main Body: Rule Name, Sensor ID, Value / Context */}
      <div className="alert-toast-content">
        <h4 className="toast-rule-name">
          {toast.ruleName || "Industrial Rule Alert"}
        </h4>
        <div className="toast-sensor-info">
          <span className="toast-sensor-id">📍 {toast.sensorId || "TURBINE-001"}</span>
          {valueDisplay && (
            <span className="toast-metric-value">· {valueDisplay}</span>
          )}
        </div>
        {toast.message && !valueDisplay && (
          <p className="toast-message-text">{toast.message}</p>
        )}
      </div>

      {/* Footer CTA */}
      <div className="alert-toast-footer">
        <span className="toast-cta-link">Click to view details →</span>
      </div>
    </div>
  );
}
