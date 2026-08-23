/**
 * AlertContext.jsx — NexusFlow Real-Time Alert State Provider
 *
 * Implements:
 * - Step 1: Exact "alert:new" event confirmation & payload consumption
 * - Step 2: Uses existing Socket.IO connection from services/socket.js
 * - Step 3: Adds new incoming alerts to the top of Alert History without page refresh
 * - Step 4: Dynamically updates unreadCount
 * - Step 5: Triggers global real-time toast notification on incoming alerts
 * - Step 6: Preserves severity information (HIGH, MEDIUM, LOW)
 * - Step 7: Integrates PATCH /api/alerts/:id/read to mark alerts as read
 * - Step 10: Deduplicates incoming alerts via unique MongoDB _id or id
 * - Step 11: Tracks Socket.IO disconnect/reconnect and automatically resyncs alerts
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

export function AlertProvider({ children }) {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);
  const [socketStatus, setSocketStatus] = useState("disconnected");
  const [selectedAlertId, setSelectedAlertId] = useState(null);
  const toastTimerRef = useRef(null);

  const showToast = useCallback((alert) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast(alert);
    toastTimerRef.current = setTimeout(() => setToast(null), 6000);
  }, []);

  const dismissToast = useCallback(() => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast(null);
  }, []);

  // Fetch alerts from backend
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

  // Step 2, 3, 5, 10, 11: Real-time alert listener & connection tracking via existing Socket.IO
  useEffect(() => {
    // Track connection state
    const handleConnect = () => {
      console.log("[AlertContext] 🔌 Socket.IO connected — syncing alerts");
      setSocketStatus("connected");
      // Step 11: Resync alerts on reconnect to catch any missed events
      refreshAlerts();
    };

    const handleDisconnect = () => {
      console.warn("[AlertContext] ⚠️ Socket.IO disconnected — real-time connection lost");
      setSocketStatus("disconnected");
    };

    const handleConnectError = (err) => {
      console.error("[AlertContext] Socket.IO connection error:", err.message);
      setSocketStatus("error");
    };

    // Step 1, 3, 5, 10: Process incoming "alert:new" event
    const handleNewAlert = (incomingAlert) => {
      if (!incomingAlert) return;
      console.log("[AlertContext] 🔔 Real-time alert:new received:", incomingAlert);

      // Step 10: Handle duplicate alerts by unique _id / id
      setAlerts((prev) => {
        const incomingId = (incomingAlert._id || incomingAlert.id || "").toString();
        if (incomingId && prev.some((a) => (a._id || a.id || "").toString() === incomingId)) {
          console.log("[AlertContext] 🛡️ Duplicate alert prevented for ID:", incomingId);
          return prev;
        }
        // Step 3: Prepend new alert to the top of Alert History
        return [incomingAlert, ...prev];
      });

      // Step 5: Show real-time notification toast
      showToast(incomingAlert);
    };

    // Register listeners
    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("connect_error", handleConnectError);
    socket.on("alert:new", handleNewAlert);

    // Initial state check
    if (socket.connected) {
      setSocketStatus("connected");
    }

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("connect_error", handleConnectError);
      socket.off("alert:new", handleNewAlert);
    };
  }, [showToast, refreshAlerts]);

  // Step 7: Mark alert as read via PATCH /api/alerts/:id/read
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
      // Optimistic fallback: mark local state as read
      setAlerts((prev) =>
        prev.map((a) => ((a._id || a.id) === id ? { ...a, status: "read" } : a))
      );
      return { _id: id, status: "read" };
    }
  }, []);

  // Step 4: Compute unread count dynamically
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

