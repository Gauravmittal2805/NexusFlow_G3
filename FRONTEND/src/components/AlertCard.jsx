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
          📍 {sensor} {alert.message ? `· ${alert.message.slice(0, 45)}${alert.message.length > 45 ? "..." : ""}` : ""}
        </span>
      </div>

      <time>{timeStr}</time>
    </div>
  );
}