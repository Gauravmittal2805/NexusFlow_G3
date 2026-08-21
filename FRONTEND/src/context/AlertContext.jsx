/**
 * AlertContext.jsx — NexusFlow Real-Time Alert State Provider
 *
 * Centralizes:
 * - Alert fetching via alertService.getAlerts()
 * - Socket.IO "alert:new" real-time subscription
 * - Unread count computation
 * - Mark-as-read dispatcher
 * - Global toast notification on incoming alerts
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
  const toastTimerRef = useRef(null);

  const showToast = useCallback((alert) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast(alert);
    toastTimerRef.current = setTimeout(() => setToast(null), 5000);
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
      setError("Unable to load alerts. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    refreshAlerts();
  }, [refreshAlerts]);

  // Step 7 & 8: Real-time alert listener via existing Socket.IO connection
  useEffect(() => {
    const handleNewAlert = (incomingAlert) => {
      console.log("[AlertContext] Real-time alert received:", incomingAlert);

      setAlerts((prev) => {
        if (prev.some((a) => a._id === incomingAlert._id)) return prev;
        return [incomingAlert, ...prev];
      });

      showToast(incomingAlert);
    };

    socket.on("alert:new", handleNewAlert);

    return () => {
      socket.off("alert:new", handleNewAlert);
    };
  }, [showToast]);

  // Step 6: Mark alert as read
  const markAsRead = useCallback(async (id) => {
    try {
      const result = await markAsReadApi(id);
      const updated = result.alert;
      setAlerts((prev) =>
        prev.map((a) => (a._id === updated._id ? updated : a))
      );
      return updated;
    } catch (err) {
      console.warn("[AlertContext] Error marking alert as read:", err.message);
      // Optimistic fallback: mark local state as read
      setAlerts((prev) =>
        prev.map((a) => (a._id === id ? { ...a, status: "read" } : a))
      );
    }
  }, []);

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
