import React from "react";
import { formatTime } from "../utils/dateUtils";

const SEVERITY_CONFIG = {
  HIGH: { label: "HIGH", className: "sev-high", dotClass: "critical", icon: "🔴" },
  MEDIUM: { label: "MEDIUM", className: "sev-medium", dotClass: "medium", icon: "🟡" },
  LOW: { label: "LOW", className: "sev-low", dotClass: "low", icon: "🟢" },
};

export default function AlertCard({ alert, onClick }) {
  const sevKey = (alert.severity || "HIGH").toUpperCase();
  const sev = SEVERITY_CONFIG[sevKey] || SEVERITY_CONFIG.HIGH;
  const title = alert.ruleName || alert.title || "Industrial Alert";
  const sensor = alert.sensorId || alert.sensor || "Sensor";
  const timeStr = alert.timestamp || alert.createdAt
    ? formatTime(alert.timestamp || alert.createdAt)
    : alert.time || "Recently";

  // Build concise detail text
  let detailSnippet = "";
  if (alert.valueDisplay) {
    detailSnippet = alert.valueDisplay;
  } else if (alert.field && alert.value !== undefined) {
    const unit = alert.field.toLowerCase().includes("temp") ? "°C"
               : alert.field.toLowerCase().includes("press") ? " PSI"
               : alert.field.toLowerCase().includes("rpm") ? " RPM"
               : alert.field.toLowerCase().includes("humid") ? "%" : "";
    detailSnippet = `${alert.field.charAt(0).toUpperCase() + alert.field.slice(1)}: ${alert.value}${unit}`;
  } else if (alert.message) {
    detailSnippet = alert.message.slice(0, 50) + (alert.message.length > 50 ? "..." : "");
  }

  return (
    <div
      className="alert-card clickable-alert-card"
      onClick={onClick}
      role="button"
      tabIndex={0}
      title="Click to view Alert Details"
    >
      <div className={`alert-severity ${sev.dotClass}`}>
        {sev.icon}
      </div>

      <div className="alert-content">
        <strong>{title}</strong>
        <span>
          📍 {sensor} {detailSnippet ? `· ${detailSnippet}` : ""}
        </span>
      </div>

      <time>{timeStr}</time>
    </div>
  );
}