/**
 * Alerts.jsx — NexusFlow Alert History & Management Module
 *
 * Implements Steps 1 to 12:
 * - Step 1: Alert History list
 * - Step 2: GET /api/alerts integration
 * - Step 3: Severity Filter (All, High, Medium, Low)
 * - Step 4: Status Filter (All, Read, Unread)
 * - Step 5: Sensor Filter (All Sensors, dynamically populated)
 * - Step 6: Search box (Rule Name, Sensor ID, Message)
 * - Step 7: Alert Details view
 * - Step 8: Mark as Read (PATCH /api/alerts/:id/read)
 * - Step 9: Real-time Socket.IO alert updates without refresh
 * - Step 10: Descending timestamp sorting (latest first)
 * - Step 11: Contextual empty states
 * - Step 12: Loading, error handling, and robust integration
 */

import React, { useMemo, useState } from "react";
import AlertItem from "../components/AlertItem";
import AlertDetails from "../components/AlertDetails";
import AlertFilters from "../components/AlertFilters";
import { useAlerts } from "../context/AlertContext";

export default function Alerts() {
  const {
    alerts,
    unreadCount,
    loading,
    error,
    toast,
    dismissToast,
    refreshAlerts,
    markAsRead,
  } = useAlerts();

  const [selectedAlert, setSelectedAlert] = useState(null);
  const [searchTerm, setSearchTerm]       = useState("");
  const [severityFilter, setSeverityFilter] = useState("All");
  const [statusFilter, setStatusFilter]   = useState("All");
  const [sensorFilter, setSensorFilter]   = useState("All");

  // Step 5: Dynamically extract available sensor IDs from all alerts
  const availableSensors = useMemo(() => {
    const set = new Set();
    alerts.forEach((a) => {
      if (a.sensorId) set.add(a.sensorId);
    });
    return Array.from(set).sort();
  }, [alerts]);

  // Step 10: Sort alerts descending by timestamp (newest first)
  const sortedAlerts = useMemo(() => {
    return [...alerts].sort((a, b) => {
      const timeA = new Date(a.timestamp || a.createdAt || 0).getTime();
      const timeB = new Date(b.timestamp || b.createdAt || 0).getTime();
      return timeB - timeA;
    });
  }, [alerts]);

  // Step 3, 4, 5, 6: Filtered & searched alert list
  const filteredAlerts = useMemo(() => {
    return sortedAlerts.filter((alert) => {
      // Severity filter
      if (
        severityFilter !== "All" &&
        (alert.severity || "").toUpperCase() !== severityFilter.toUpperCase()
      ) {
        return false;
      }

      // Status filter
      if (
        statusFilter !== "All" &&
        (alert.status || "unread").toLowerCase() !== statusFilter.toLowerCase()
      ) {
        return false;
      }

      // Sensor filter
      if (
        sensorFilter !== "All" &&
        alert.sensorId !== sensorFilter
      ) {
        return false;
      }

      // Search query
      if (searchTerm.trim()) {
        const term = searchTerm.trim().toLowerCase();
        const inRuleName = (alert.ruleName || "").toLowerCase().includes(term);
        const inSensorId = (alert.sensorId || "").toLowerCase().includes(term);
        const inMessage  = (alert.message  || "").toLowerCase().includes(term);
        if (!inRuleName && !inSensorId && !inMessage) {
          return false;
        }
      }

      return true;
    });
  }, [sortedAlerts, severityFilter, statusFilter, sensorFilter, searchTerm]);

  // Counts for filter badges
  const filterCounts = useMemo(() => {
    return {
      total: alerts.length,
      unread: unreadCount,
      read: alerts.length - unreadCount,
      high: alerts.filter((a) => (a.severity || "").toUpperCase() === "HIGH").length,
      medium: alerts.filter((a) => (a.severity || "").toUpperCase() === "MEDIUM").length,
      low: alerts.filter((a) => (a.severity || "").toUpperCase() === "LOW").length,
    };
  }, [alerts, unreadCount]);

  const hasActiveFilters =
    searchTerm !== "" ||
    severityFilter !== "All" ||
    statusFilter !== "All" ||
    sensorFilter !== "All";

  const handleResetFilters = () => {
    setSearchTerm("");
    setSeverityFilter("All");
    setStatusFilter("All");
    setSensorFilter("All");
  };

  // Step 8: Handle user selecting an alert & marking as read
  const handleAlertSelect = async (alert) => {
    setSelectedAlert(alert);

    // If unread, mark as read
    if (alert.status === "unread") {
      const updated = await markAsRead(alert._id);
      if (updated) {
        setSelectedAlert(updated);
      } else {
        setSelectedAlert((prev) => (prev ? { ...prev, status: "read" } : null));
      }
    }
  };

  const handleManualMarkRead = async (id) => {
    const updated = await markAsRead(id);
    if (updated) {
      setSelectedAlert(updated);
    } else {
      setSelectedAlert((prev) => (prev ? { ...prev, status: "read" } : null));
    }
  };

  // Step 11: Contextual empty state message
  const getEmptyStateMessage = () => {
    if (alerts.length === 0) {
      return {
        title: "No alerts found",
        description: "No rule conditions have triggered an alert yet.",
      };
    }
    if (severityFilter !== "All") {
      return {
        title: `No ${severityFilter} severity alerts found`,
        description: `There are currently no ${severityFilter.toLowerCase()} severity alerts matching your filters.`,
      };
    }
    if (statusFilter !== "All") {
      return {
        title: `No ${statusFilter} alerts found`,
        description: `There are currently no ${statusFilter.toLowerCase()} alerts in the system.`,
      };
    }
    if (sensorFilter !== "All") {
      return {
        title: `No alerts for ${sensorFilter}`,
        description: `No alert history recorded for sensor ${sensorFilter}.`,
      };
    }
    return {
      title: "No matching alerts found",
      description: "Try adjusting your search keywords or filter criteria.",
    };
  };

  return (
    <div className="alerts-page">
      {/* Step 8: Global Toast Notification on Real-Time Alert Arrival */}
      {toast && (
        <div className="alert-toast" role="alert">
          <span className="alert-toast-icon">
            {(toast.severity || "").toUpperCase() === "HIGH"
              ? "🔴"
              : (toast.severity || "").toUpperCase() === "MEDIUM"
              ? "🟡"
              : "🟢"}
          </span>
          <div className="alert-toast-body">
            <strong>{toast.ruleName || "New Alert Triggered"}</strong>
            <span>{toast.message}</span>
          </div>
          <button
            type="button"
            className="alert-toast-close"
            onClick={dismissToast}
            title="Dismiss"
          >
            ✕
          </button>
        </div>
      )}

      {/* Page Header */}
      <div className="alerts-header">
        <div>
          <h2>
            Alert History
            {unreadCount > 0 && (
              <span className="alerts-unread-badge">{unreadCount} unread</span>
            )}
          </h2>
          <p>Real-time audit log of all rule-triggered industrial alerts</p>
        </div>

        <button
          type="button"
          className="btn-refresh"
          onClick={refreshAlerts}
          title="Refresh alerts from backend"
        >
          ↻ Refresh
        </button>
      </div>

      {/* Step 3, 4, 5, 6: Filters & Search Bar */}
      <AlertFilters
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        severityFilter={severityFilter}
        onSeverityChange={setSeverityFilter}
        statusFilter={statusFilter}
        onStatusChange={setStatusFilter}
        sensorFilter={sensorFilter}
        onSensorChange={setSensorFilter}
        availableSensors={availableSensors}
        onResetFilters={handleResetFilters}
        hasActiveFilters={hasActiveFilters}
        counts={filterCounts}
      />

      {/* Master-Detail Layout: History List + Details View */}
      <div className="alerts-layout">
        {/* Left: Alert History List */}
        <div className="alerts-list-panel">
          {/* Step 11: Loading State */}
          {loading && (
            <div className="alerts-loading">
              <div className="spinner" />
              <span>Loading alerts from server...</span>
            </div>
          )}

          {/* Step 11: Error State */}
          {!loading && error && (
            <div className="alerts-error-state">
              <div className="error-icon">⚠️</div>
              <p>{error}</p>
              <button
                type="button"
                className="btn-retry"
                onClick={refreshAlerts}
              >
                Try Again
              </button>
            </div>
          )}

          {/* Step 11: Empty State */}
          {!loading && !error && filteredAlerts.length === 0 && (
            <div className="alerts-empty-state">
              <div className="empty-icon">🔔</div>
              <h3>{getEmptyStateMessage().title}</h3>
              <p>{getEmptyStateMessage().description}</p>
              {hasActiveFilters && (
                <button
                  type="button"
                  className="btn-reset-filters"
                  onClick={handleResetFilters}
                >
                  Reset All Filters
                </button>
              )}
            </div>
          )}

          {/* Alert Rows */}
          {!loading &&
            !error &&
            filteredAlerts.map((alert) => (
              <AlertItem
                key={alert._id}
                alert={alert}
                onClick={handleAlertSelect}
                isSelected={selectedAlert?._id === alert._id}
              />
            ))}
        </div>

        {/* Right: Step 7 & 8 Alert Details View */}
        <div className="alerts-detail-panel">
          <AlertDetails
            alert={selectedAlert}
            onClose={() => setSelectedAlert(null)}
            onMarkAsRead={handleManualMarkRead}
          />
        </div>
      </div>
    </div>
  );
}
