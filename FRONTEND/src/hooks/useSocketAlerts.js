/**
 * useSocketAlerts.js — Custom hook to access real-time alert state and operations
 *
 * Wraps AlertContext for convenient access to live alerts, unread counts,
 * trigger events, and alert actions across components.
 */

import { useAlerts } from "../context/AlertContext";

export function useSocketAlerts() {
  const {
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
  } = useAlerts();

  return {
    alerts,
    recentAlerts: alerts.slice(0, 5),
    unreadCount,
    loading,
    error,
    toast,
    socketStatus,
    isConnected: socketStatus === "connected",
    selectedAlertId,
    setSelectedAlertId,
    showToast,
    dismissToast,
    refreshAlerts,
    markAsRead,
  };
}

export default useSocketAlerts;
