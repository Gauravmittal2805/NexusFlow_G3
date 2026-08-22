/**
 * AlertDetails.jsx — NexusFlow Alert Details Component
 *
 * Implements:
 * - Step 7: Display details (Rule Name, Sensor ID, Severity, Condition/Message, Time)
 * - Step 8: Interactive [ Mark as Read ] button calling backend PATCH /api/alerts/:id/read
 */

import React, { useState } from "react";
import { formatDateTime, formatTime } from "../utils/dateUtils";

const SEVERITY_CONFIG = {
  HIGH: { label: "HIGH", icon: "🔴", className: "sev-high" },
  MEDIUM: { label: "MEDIUM", icon: "🟡", className: "sev-medium" },
  LOW: { label: "LOW", icon: "🟢", className: "sev-low" },
};

export default function AlertDetails({ alert, onClose, onMarkAsRead }) {
  const [marking, setMarking] = useState(false);

  if (!alert) {
    return (
      <div className="alert-details-empty">
        <div className="empty-icon">🔔</div>
        <h3>No Alert Selected</h3>
        <p>Select an alert from the history list to view complete details.</p>
      </div>
    );
  }

  const sevKey = (alert.severity || "HIGH").toUpperCase();
  const sev = SEVERITY_CONFIG[sevKey] || SEVERITY_CONFIG.HIGH;
  const isUnread = alert.status === "unread";

  const handleMarkRead = async () => {
    if (!isUnread || marking) return;
    try {
      setMarking(true);
      await onMarkAsRead(alert._id);
    } catch (err) {
      console.error("Error marking alert as read:", err);
    } finally {
      setMarking(false);
    }
  };

  return (
    <div className="alert-details-card">
      {/* Header */}
      <div className="details-header">
        <div className="details-header-title">
          <span className={`details-sev-icon ${sev.className}`}>
            {sev.icon}
          </span>
          <div>
            <h3 className="details-rule-name">{alert.ruleName || "Alert"}</h3>
            <span className="details-sensor-tag">📍 {alert.sensorId}</span>
          </div>
        </div>

        {onClose && (
          <button
            type="button"
            className="details-close-btn"
            onClick={onClose}
            title="Close details"
          >
            ✕
          </button>
        )}
      </div>

      {/* Status Bar */}
      <div className="details-meta-bar">
        <span
          className={`details-status-pill ${
            isUnread ? "status-unread" : "status-read"
          }`}
        >
          {isUnread ? "● Unread" : "✓ Read"}
        </span>

        <span className="details-time-tag">
          🕒 {formatTime(alert.timestamp || alert.createdAt)} (
          {formatDateTime(alert.timestamp || alert.createdAt)})
        </span>
      </div>

      {/* Details Grid */}
      <div className="details-body-grid">
        <div className="details-prop-box">
          <span className="prop-label">Sensor ID</span>
          <strong className="prop-value sensor-highlight">
            {alert.sensorId || "—"}
          </strong>
        </div>

        <div className="details-prop-box">
          <span className="prop-label">Severity Level</span>
          <strong className={`prop-value sev-text ${sev.className}`}>
            {sev.icon} {sev.label}
          </strong>
        </div>

        <div className="details-prop-box full-width">
          <span className="prop-label">Rule / Condition</span>
          <span className="prop-value">{alert.ruleName || "Rule Condition"}</span>
        </div>

        <div className="details-prop-box full-width">
          <span className="prop-label">Message / Telemetry Context</span>
          <p className="prop-message">{alert.message || "Condition threshold was triggered."}</p>
        </div>

        <div className="details-prop-box">
          <span className="prop-label">Dispatched Action</span>
          <span className="prop-value">{alert.action || "NOTIFICATION"}</span>
        </div>

        <div className="details-prop-box">
          <span className="prop-label">Alert ID</span>
          <span className="prop-value id-code">{alert._id || "—"}</span>
        </div>
      </div>

      {/* Action Footer (Step 8) */}
      <div className="details-footer">
        {isUnread ? (
          <button
            type="button"
            className="btn-mark-read"
            onClick={handleMarkRead}
            disabled={marking}
          >
            {marking ? "Marking as read..." : "✓ Mark as Read"}
          </button>
        ) : (
          <div className="read-confirmation-text">
            <span>✓ This alert has been acknowledged and marked as read.</span>
          </div>
        )}
      </div>
    </div>
  );
}
