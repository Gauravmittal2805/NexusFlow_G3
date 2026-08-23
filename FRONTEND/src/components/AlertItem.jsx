/**
 * AlertItem.jsx — A single row in the Alerts History list.
 *
 * Implements:
 * - Step 1: Alert History row display (Rule Name, Sensor ID, Severity, Time e.g. 10:35 AM)
 * - Step 4: Severity pill styling (HIGH, MEDIUM, LOW)
 * - Step 6 & 8: Unread status indicator stripe & clickable trigger
 */

import React from "react";
import { formatTime, formatDistanceToNow } from "../utils/dateUtils";

const SEVERITY_CONFIG = {
  HIGH: { label: "HIGH", className: "sev-high", icon: "🔴" },
  MEDIUM: { label: "MEDIUM", className: "sev-medium", icon: "🟡" },
  LOW: { label: "LOW", className: "sev-low", icon: "🟢" },
};

export default function AlertItem({ alert, onClick, isSelected }) {
  const sevKey = (alert.severity || "HIGH").toUpperCase();
  const sev = SEVERITY_CONFIG[sevKey] || SEVERITY_CONFIG.HIGH;
  const isUnread = alert.status === "unread";
  const exactTime = formatTime(alert.timestamp || alert.createdAt);
  const relativeTime = formatDistanceToNow(alert.timestamp || alert.createdAt);

  return (
    <div
      className={[
        "alert-item",
        isUnread ? "alert-item--unread" : "",
        isSelected ? "alert-item--selected" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={() => onClick(alert)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onClick(alert)}
    >
      {/* Unread indicator stripe */}
      {isUnread && <span className="unread-stripe" aria-label="Unread" />}

      {/* Severity Icon Badge */}
      <span className={`alert-sev-badge ${sev.className}`}>
        {sev.icon}
      </span>

      {/* Content */}
      <div className="alert-item-content">
        <div className="alert-item-top">
          <div className="alert-item-title-wrap">
            <strong className="alert-item-name">{alert.ruleName || "Alert"}</strong>
            {isUnread && <span className="badge-new-dot">NEW</span>}
          </div>
          <div className="alert-item-time-wrap">
            <span className="alert-exact-time">{exactTime}</span>
            <small className="alert-item-rel-time">({relativeTime})</small>
          </div>
        </div>

        <div className="alert-item-bottom">
          <span className="alert-item-sensor">📍 {alert.sensorId}</span>
          <span className="alert-item-divider">·</span>
          <span className={`alert-sev-pill ${sev.className}`}>{sev.label}</span>
          <span className="alert-item-divider">·</span>
          <span className={`alert-status-text ${isUnread ? "unread" : "read"}`}>
            {isUnread ? "Unread" : "Read"}
          </span>
        </div>

        <p className="alert-item-message">{alert.message}</p>
      </div>
    </div>
  );
}
