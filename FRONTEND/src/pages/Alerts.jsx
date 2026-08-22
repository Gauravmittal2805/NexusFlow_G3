import React, { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  getAlertsRequest,
  markAlertAsReadRequest,
} from "../services/api";

/**
 * Format an ISO timestamp for display in the Alerts table.
 */
function formatAlertTime(isoString) {
  if (!isoString) return "—";
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return "—";

  const now = new Date();
  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  const timeStr = date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  if (isToday) return timeStr;

  return date.toLocaleDateString([], {
    day: "numeric",
    month: "short",
    year: "numeric",
  }) + ", " + timeStr;
}

export default function Alerts() {
  const [searchParams, setSearchParams] = useSearchParams();
  const ruleIdFilter = searchParams.get("ruleId") || "";

  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [markingId, setMarkingId] = useState(null);

  const hasFetched = useRef(false);

  const fetchAlerts = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await getAlertsRequest();
      const data = response.data;
      // Backend returns { success, count, alerts }
      const list = Array.isArray(data?.alerts)
        ? data.alerts
        : Array.isArray(data)
        ? data
        : [];
      setAlerts(list);
    } catch (err) {
      console.error("Failed to fetch alerts:", err);
      const status = err?.response?.status;
      if (status === 401 || status === 403) {
        setError("You don't have permission to view alerts.");
      } else {
        setError("Unable to load alerts. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!hasFetched.current) {
      hasFetched.current = true;
      fetchAlerts();
    }
  }, [fetchAlerts]);

  const handleMarkAsRead = useCallback(
    async (alertId) => {
      if (markingId) return;
      setMarkingId(alertId);
      try {
        await markAlertAsReadRequest(alertId);
        // Step 9: Update local state without full page reload
        setAlerts((prev) =>
          prev.map((a) =>
            (a._id || a.id) === alertId ? { ...a, isRead: true } : a
          )
        );
      } catch (err) {
        console.error("Failed to mark alert as read:", err);
      } finally {
        setMarkingId(null);
      }
    },
    [markingId]
  );

  const clearFilter = () => {
    setSearchParams({});
  };

  // Apply ruleId filter if provided via URL query param (?ruleId=xxx)
  const filteredAlerts = ruleIdFilter
    ? alerts.filter((a) => {
        const id = a.ruleId || a.rule?._id || a.rule?.id || a.rule;
        return String(id) === ruleIdFilter;
      })
    : alerts;

  const unreadCount = filteredAlerts.filter((a) => !a.isRead).length;

  return (
    <div className="alerts-page">
      {/* Page header */}
      <div className="alerts-header">
        <div>
          <h1 className="alerts-title">🔔 Alerts</h1>
          <p className="alerts-subtitle">
            Real-time rule trigger alerts from your sensor pipelines
          </p>
        </div>

        <div className="alerts-header-actions">
          {unreadCount > 0 && (
            <span className="alerts-unread-badge">{unreadCount} unread</span>
          )}
          <button
            type="button"
            className="btn-secondary"
            onClick={fetchAlerts}
            disabled={loading}
          >
            {loading ? "⏳ Loading..." : "🔄 Refresh"}
          </button>
        </div>
      </div>

      {/* Active ruleId filter banner */}
      {ruleIdFilter && (
        <div className="alerts-filter-banner">
          <span>
            🔍 Showing alerts for rule ID: <code>{ruleIdFilter}</code>
          </span>
          <button
            type="button"
            className="alerts-filter-clear"
            onClick={clearFilter}
          >
            Clear filter ✕
          </button>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="alerts-error">
          <span>⚠ {error}</span>
          <button type="button" className="btn-secondary" onClick={fetchAlerts}>
            Try Again
          </button>
        </div>
      )}

      {/* Loading state */}
      {loading && !error && (
        <div className="alerts-loading">
          <span>⏳ Loading alerts from backend...</span>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && filteredAlerts.length === 0 && (
        <div className="alerts-empty">
          <span className="empty-icon">📭</span>
          <p>
            {ruleIdFilter
              ? "No alerts found for this rule."
              : "No alerts yet. Alerts will appear here when rules trigger."}
          </p>
        </div>
      )}

      {/* Alert list */}
      {!loading && !error && filteredAlerts.length > 0 && (
        <div className="alerts-list">
          {filteredAlerts.map((alert) => {
            const alertId = alert._id || alert.id;
            const isMarkingThis = markingId === alertId;

            return (
              <div
                key={alertId}
                className={`alert-card ${alert.isRead ? "read" : "unread"}`}
              >
                <div className="alert-card-left">
                  <span className="alert-severity-icon">
                    {alert.severity === "critical"
                      ? "🔴"
                      : alert.severity === "warning"
                      ? "🟡"
                      : "🔵"}
                  </span>

                  <div className="alert-card-body">
                    <h4 className="alert-rule-name">
                      {alert.ruleName || alert.rule?.name || "Unknown Rule"}
                    </h4>

                    {alert.message && (
                      <p className="alert-message">{alert.message}</p>
                    )}

                    <div className="alert-meta">
                      {alert.sensorId && (
                        <span className="alert-tag">
                          📡 {alert.sensorId}
                        </span>
                      )}
                      <span className="alert-tag alert-time">
                        🕒 {formatAlertTime(alert.triggeredAt || alert.createdAt)}
                      </span>
                      {!alert.isRead && (
                        <span className="alert-tag alert-unread-tag">New</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="alert-card-actions">
                  {!alert.isRead && (
                    <button
                      type="button"
                      className="btn-mark-read"
                      disabled={isMarkingThis}
                      onClick={() => handleMarkAsRead(alertId)}
                    >
                      {isMarkingThis ? "Marking..." : "Mark as Read"}
                    </button>
                  )}
                  {alert.isRead && (
                    <span className="alert-read-label">✓ Read</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
