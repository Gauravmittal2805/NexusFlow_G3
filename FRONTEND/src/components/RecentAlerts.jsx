/**
 * RecentAlerts.jsx — Live Alert History Panel (Dashboard Sidebar)
 *
 * Implements:
 * - Step 6: Real-time alert display using AlertContext (rule:triggered + alert:new)
 * - Step 7: Connects to real alert data (no separate duplicate alert system)
 * - Step 8: Loading and empty states ("No alerts triggered yet")
 * - Step 10: Alert navigation → /alerts with selected alert auto-highlighted
 */

import React from "react";
import { useNavigate } from "react-router-dom";
import AlertCard from "./AlertCard";
import { useAlerts } from "../context/AlertContext";

export default function RecentAlerts() {
  const { alerts, loading, unreadCount, setSelectedAlertId } = useAlerts();
  const navigate = useNavigate();

  const displayAlerts = alerts.slice(0, 5);

  const handleAlertClick = (alert) => {
    if (setSelectedAlertId) {
      setSelectedAlertId(alert._id || alert.id);
    }
    navigate("/alerts");
  };

  const handleViewAll = () => {
    navigate("/alerts");
  };

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <span className="eyebrow">Real-Time Monitoring</span>
          <h2>
            Recent Alerts
            {unreadCount > 0 && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginLeft: "8px",
                  minWidth: "20px",
                  height: "20px",
                  padding: "0 5px",
                  borderRadius: "10px",
                  backgroundColor: "#ef4444",
                  color: "#fff",
                  fontSize: "11px",
                  fontWeight: "700",
                  verticalAlign: "middle",
                }}
              >
                {unreadCount}
              </span>
            )}
          </h2>
        </div>

        <button
          className="text-button"
          onClick={handleViewAll}
          title="View full alert history"
        >
          View all →
        </button>
      </div>

      <div className="alert-list">
        {/* Step 8: Loading state */}
        {loading && alerts.length === 0 && (
          <div className="empty-state" style={{ minHeight: "120px", textAlign: "center", padding: "20px" }}>
            <span style={{ fontSize: "24px", display: "block", marginBottom: "8px" }}>⏳</span>
            <strong style={{ color: "#4f5a6c", fontSize: "13px" }}>Loading alerts...</strong>
          </div>
        )}

        {/* Step 8: Empty state (no alerts yet) */}
        {!loading && displayAlerts.length === 0 && (
          <div className="empty-state" style={{ minHeight: "120px", textAlign: "center", padding: "24px 16px" }}>
            <span style={{ fontSize: "28px", display: "block", marginBottom: "8px" }}>🟢</span>
            <strong style={{ color: "#4f5a6c", fontSize: "13px", display: "block" }}>
              No alerts triggered yet
            </strong>
            <span style={{ color: "#8a94a5", fontSize: "12px", marginTop: "4px", display: "block" }}>
              Live monitoring is active. Alerts appear here in real time.
            </span>
          </div>
        )}

        {/* Step 6, 7, 10: Render real alert data from AlertContext */}
        {displayAlerts.map((alert) => (
          <AlertCard
            key={alert._id || alert.id}
            alert={alert}
            onClick={() => handleAlertClick(alert)}
          />
        ))}
      </div>

      {/* Minimal footer note */}
      {alerts.length > 5 && (
        <div
          style={{
            textAlign: "center",
            padding: "8px 0 4px",
            fontSize: "11px",
            color: "#94a3b8",
            borderTop: "1px solid #f1f5f9",
            marginTop: "4px",
          }}
        >
          Showing 5 of {alerts.length} alerts —{" "}
          <button
            type="button"
            onClick={handleViewAll}
            style={{
              background: "none",
              border: "none",
              color: "#7c3aed",
              fontWeight: "700",
              cursor: "pointer",
              fontSize: "11px",
              padding: 0,
            }}
          >
            View all
          </button>
        </div>
      )}
    </section>
  );
}