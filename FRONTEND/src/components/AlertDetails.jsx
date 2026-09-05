/**
 * AlertDetails.jsx — NexusFlow Alert Details Component
 *
 * Implements:
 * - Step 6: Severity-based styling (HIGH, MEDIUM, LOW)
 * - Step 7: Interactive [ Mark as Read ] button calling backend PATCH /api/alerts/:id/read
 * - Step 8: View Alert Details (Rule Name, Sensor ID, Message, Severity, Time, Action, Alert ID)
 * - Step 9: Link Alert to Rule via [ View Rule ] button navigating to Rule Builder
 */

import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { formatDateTime, formatTime } from "../utils/dateUtils";

const SEVERITY_CONFIG = {
  HIGH: { label: "HIGH", icon: "🔴", className: "sev-high" },
  MEDIUM: { label: "MEDIUM", icon: "🟡", className: "sev-medium" },
  LOW: { label: "LOW", icon: "🟢", className: "sev-low" },
};

export default function AlertDetails({ alert, onClose, onMarkAsRead }) {
  const [marking, setMarking] = useState(false);
  const navigate = useNavigate();

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
  const alertId = alert._id || alert.id;

  const handleMarkRead = async () => {
    if (!isUnread || marking) return;
    try {
      setMarking(true);
      await onMarkAsRead(alertId);
    } catch (err) {
      console.error("Error marking alert as read:", err);
    } finally {
      setMarking(false);
    }
  };

  const handleNavigateToRule = () => {
    if (alert.ruleId) {
      navigate(`/flow?ruleId=${encodeURIComponent(alert.ruleId)}`);
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

      {/* Details Grid (Step 8) */}
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
          <div className="prop-rule-row">
            <span className="prop-value">{alert.ruleName || "Rule Condition"}</span>
            {alert.ruleId && (
              <button
                type="button"
                className="btn-view-rule-inline"
                onClick={handleNavigateToRule}
                title={`Open Rule "${alert.ruleName}" in Rule Builder`}
              >
                🛠️ View Rule
              </button>
            )}
          </div>
        </div>

        <div className="details-prop-box full-width">
          <span className="prop-label">Message / Telemetry Context</span>
          <p className="prop-message">{alert.message || "Condition threshold was triggered."}</p>
        </div>

        {alert.value !== undefined && alert.value !== null && (
          <div className="details-prop-box">
            <span className="prop-label">Triggered Value</span>
            <strong className="prop-value" style={{ color: "#dc2626" }}>
              {typeof alert.value === "number" ? alert.value.toFixed(2) : alert.value}
            </strong>
          </div>
        )}

        <div className="details-prop-box">
          <span className="prop-label">Dispatched Action</span>
          <span className="prop-value">{alert.action || "NOTIFICATION"}</span>
        </div>

        <div className="details-prop-box">
          <span className="prop-label">Alert ID</span>
          <span className="prop-value id-code">{alertId || "—"}</span>
        </div>
      </div>

      {/* Action Footer (Step 7 & Step 9) */}
      <div className="details-footer">
        <div className="details-footer-left">
          {alert.ruleId && (
            <button
              type="button"
              className="btn-view-rule"
              onClick={handleNavigateToRule}
              title="Open corresponding rule in Rule Builder"
            >
              🛠️ View Rule in Builder
            </button>
          )}
        </div>

        <div className="details-footer-right">
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
              <span>✓ Acknowledged and marked as read</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

