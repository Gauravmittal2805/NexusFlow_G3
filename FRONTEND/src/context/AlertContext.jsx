/**
 * AlertContext.jsx — NexusFlow Real-Time Alert State & Notification Provider
 *
 * Implements:
 * - Step 1: Central real-time AlertContext & useAlerts() hook (reused across app)
 * - Step 2: Consumes backend "rule:triggered" & "alert:new" Socket.IO events
 * - Step 3: Wires Socket.IO trigger events directly into AlertContext state
 * - Step 4: Displays real-time alert toast without page refresh
 * - Step 5: Supports alert severity (HIGH 🔴, MEDIUM 🟡, LOW 🟢)
 * - Step 6: Shows structured trigger information (Rule, Sensor, Value/Metric, Time)
 * - Step 7: Integrates selectedAlertId to link directly to /alerts details view
 * - Step 8: Deduplicates continuous triggers (e.g. 85, 86, 87...) via cooldown & unique IDs
 * - Step 9: Prepend new triggers to top of Alert History (re-renders RecentAlerts reactively)
 * - Step 10: Seamless coexistence with live telemetry streams without interference
 * - Step 11: Tracks Socket.IO connection loss/restoration without wiping existing alerts
 * - Step 13: Full contract coordination with Member 2 (Rule Engine)
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { getAlerts, markAlertAsRead as markAsReadApi } from "../services/alertService";
import { socket } from "../services/socket";

const AlertContext = createContext(null);

// Cooldown window in ms for suppressing duplicate toasts from continuous readings
const TOAST_COOLDOWN_MS = 5000;

export function AlertProvider({ children }) {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);
  const [socketStatus, setSocketStatus] = useState("disconnected");
  const [selectedAlertId, setSelectedAlertId] = useState(null);

  const toastTimerRef = useRef(null);
  // Tracks (ruleId:sensorId) -> lastToastTimestamp for duplicate toast suppression
  const recentToastsRef = useRef(new Map());

  // Step 4 & 6: Display real-time alert toast
  const showToast = useCallback((alertData) => {
    if (!alertData) return;

    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }

    setToast(alertData);

    // Auto-dismiss toast after 6.5 seconds
    toastTimerRef.current = setTimeout(() => {
      setToast(null);
    }, 6500);
  }, []);

  const dismissToast = useCallback(() => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    setToast(null);
  }, []);

  // Step 8: Check if a toast was recently displayed for this rule+sensor pair
  const isDuplicateToast = useCallback((ruleId, sensorId) => {
    const key = `${ruleId || "rule"}:${sensorId || "sensor"}`;
    const lastTime = recentToastsRef.current.get(key);
    const now = Date.now();

    if (lastTime && now - lastTime < TOAST_COOLDOWN_MS) {
      return true;
    }

    recentToastsRef.current.set(key, now);
    return false;
  }, []);

  // Fetch persistent alerts from REST API (GET /api/alerts)
  const refreshAlerts = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getAlerts();
      setAlerts(data.alerts || []);
    } catch (err) {
      console.error("[AlertContext] Failed to fetch alerts:", err);
      const status = err.response?.status;
      if (status === 401) {
        setError("Authentication required. Please log in to view alerts.");
      } else if (status === 403) {
        setError("Access denied. You do not have permission to view alerts.");
      } else if (status === 404) {
        setError("Alerts endpoint not found (404).");
      } else if (status >= 500) {
        setError("Server error occurred while loading alerts. Please try again.");
      } else {
        setError("Unable to load alerts. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    refreshAlerts();
  }, [refreshAlerts]);

  // Step 2, 3, 8, 10, 11: Real-time Socket.IO trigger and alert listeners
  useEffect(() => {
    const handleConnect = () => {
      console.log("[AlertContext] 🔌 Socket.IO connected — syncing alerts");
      setSocketStatus("connected");
      // Step 11: Resync alerts on reconnect to catch any missed persistent events
      refreshAlerts();
    };

    const handleDisconnect = () => {
      console.warn("[AlertContext] ⚠️ Socket.IO disconnected — live connection lost");
      setSocketStatus("disconnected");
    };

    const handleConnectError = (err) => {
      console.error("[AlertContext] Socket.IO connection error:", err.message);
      setSocketStatus("error");
    };

    // Helper: Normalize incoming event data into a consistent Alert object
    const normalizeAlert = (incoming) => {
      const field = incoming.field || "";
      const value = incoming.value !== undefined ? incoming.value : null;

      let valueDisplay = "";
      if (field && value !== null) {
        const unit = field.toLowerCase().includes("temp") ? "°C"
                   : field.toLowerCase().includes("press") ? " PSI"
                   : field.toLowerCase().includes("rpm") ? " RPM"
                   : field.toLowerCase().includes("humid") ? "%" : "";
        valueDisplay = `${field.charAt(0).toUpperCase() + field.slice(1)}: ${value}${unit}`;
      }

      const rawId = incoming._id || incoming.id || incoming.alertId;
      const fallbackId = `alert-${incoming.ruleId || "rule"}-${incoming.sensorId || "sensor"}-${Date.now()}`;

      return {
        _id: (rawId || fallbackId).toString(),
        id: (rawId || fallbackId).toString(),
        ruleId: incoming.ruleId || "",
        ruleName: incoming.ruleName || "Industrial Alert",
        sensorId: incoming.sensorId || "TURBINE-001",
        severity: (incoming.severity || "HIGH").toUpperCase(),
        field,
        value,
        valueDisplay,
        message: incoming.message || (valueDisplay ? `${valueDisplay} on ${incoming.sensorId}` : `Rule triggered on ${incoming.sensorId}`),
        status: incoming.status || "unread",
        action: incoming.action || "NOTIFICATION",
        timestamp: incoming.timestamp ? new Date(incoming.timestamp).toISOString() : new Date().toISOString(),
      };
    };

    // Step 2 & 3: Process incoming "rule:triggered" event (from Member 2 engine)
    const handleRuleTriggered = (eventData) => {
      if (!eventData || !eventData.ruleId) return;
      console.log("[AlertContext] ⚡ rule:triggered received:", eventData);

      const normalized = normalizeAlert(eventData);

      // Step 8 & 9: Deduplicate and prepend to alerts state
      setAlerts((prev) => {
        const id = normalized._id;
        const exists = prev.some(
          (a) =>
            (a._id && a._id === id) ||
            (a.ruleId === normalized.ruleId &&
              a.sensorId === normalized.sensorId &&
              Math.abs(new Date(a.timestamp).getTime() - new Date(normalized.timestamp).getTime()) < 2000)
        );

        if (exists) {
          return prev;
        }

        return [normalized, ...prev];
      });

      // Step 4 & 8: Show toast if not in duplicate cooldown window
      if (!isDuplicateToast(normalized.ruleId, normalized.sensorId)) {
        showToast(normalized);
      }
    };

    // Step 2 & 3: Process incoming "alert:new" event (persisted Alert document)
    const handleAlertNew = (incomingAlert) => {
      if (!incomingAlert) return;
      console.log("[AlertContext] 🔔 alert:new received:", incomingAlert);

      const normalized = normalizeAlert(incomingAlert);

      // Step 8 & 9: Update or prepend alert
      setAlerts((prev) => {
        const id = normalized._id;
        // If alert was already placed optimistically by rule:triggered, update it
        const index = prev.findIndex(
          (a) =>
            (a._id && a._id === id) ||
            (a.ruleId === normalized.ruleId &&
              a.sensorId === normalized.sensorId &&
              Math.abs(new Date(a.timestamp).getTime() - new Date(normalized.timestamp).getTime()) < 3000)
        );

        if (index !== -1) {
          const copy = [...prev];
          copy[index] = { ...copy[index], ...normalized };
          return copy;
        }

        return [normalized, ...prev];
      });

      // Show toast if not already shown for this trigger
      if (!isDuplicateToast(normalized.ruleId, normalized.sensorId)) {
        showToast(normalized);
      }
    };

    // Register Socket.IO listeners
    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("connect_error", handleConnectError);
    socket.on("rule:triggered", handleRuleTriggered);
    socket.on("alert:new", handleAlertNew);

    if (socket.connected) {
      setSocketStatus("connected");
    }

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("connect_error", handleConnectError);
      socket.off("rule:triggered", handleRuleTriggered);
      socket.off("alert:new", handleAlertNew);
    };
  }, [showToast, refreshAlerts, isDuplicateToast]);

  // Mark alert as read (PATCH /api/alerts/:id/read)
  const markAsRead = useCallback(async (id) => {
    try {
      const result = await markAsReadApi(id);
      const updated = result.alert;
      setAlerts((prev) =>
        prev.map((a) => ((a._id || a.id) === id ? { ...a, ...updated, status: "read" } : a))
      );
      return updated;
    } catch (err) {
      console.warn("[AlertContext] Error marking alert as read in API, applying optimistic fallback:", err.message);
      setAlerts((prev) =>
        prev.map((a) => ((a._id || a.id) === id ? { ...a, status: "read" } : a))
      );
      return { _id: id, status: "read" };
    }
  }, []);

  // Compute dynamic unread count
  const unreadCount = useMemo(() => {
    return alerts.filter((a) => a.status === "unread").length;
  }, [alerts]);

  const value = useMemo(
    () => ({
      alerts,
      unreadCount,
      loading,
      error,
      toast,
      socketStatus,
      selectedAlertId,
      setSelectedAlertId,
      showToast,
      dismissToast,
      refreshAlerts,
      markAsRead,
    }),
    [
      alerts,
      unreadCount,
      loading,
      error,
      toast,
      socketStatus,
      selectedAlertId,
      showToast,
      dismissToast,
      refreshAlerts,
      markAsRead,
    ]
  );

  return (
    <AlertContext.Provider value={value}>{children}</AlertContext.Provider>
  );
}

export function useAlerts() {
  const context = useContext(AlertContext);
  if (!context) {
    throw new Error("useAlerts must be used inside an AlertProvider");
  }
  return context;
}
