import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  connectSocket,
  disconnectSocket,
  socket,
  subscribeToTelemetry,
  subscribeToRuleTrigger,
  subscribeToAlertNew,
} from "../services/socket";

const TelemetryContext = createContext(null);

const initialTelemetry = {
  "TURBINE-001": {
    sensorId: "TURBINE-001",
    timestamp: new Date().toISOString(),
    temperature: 78.5,
    pressure: 120,
    humidity: 43,
    rpm: 1800,
  },
};

export function TelemetryProvider({ children }) {
  const [telemetryBySensor, setTelemetryBySensor] =
    useState(initialTelemetry);

  const [historyBySensor, setHistoryBySensor] = useState({
    "TURBINE-001": [
      { time: "10s", temperature: 72, pressure: 116, rpm: 1750 },
      { time: "20s", temperature: 74, pressure: 118, rpm: 1780 },
      { time: "30s", temperature: 76, pressure: 119, rpm: 1795 },
      { time: "40s", temperature: 75, pressure: 121, rpm: 1805 },
      { time: "50s", temperature: 78, pressure: 120, rpm: 1800 },
      { time: "60s", temperature: 78.5, pressure: 120, rpm: 1800 },
    ],
  });

  const [connectionStatus, setConnectionStatus] =
    useState("disconnected");

  const [connectionError, setConnectionError] = useState("");

  const [activeSensorId, setActiveSensorId] =
    useState("TURBINE-001");

  // Real-time Rule Triggers state: { [ruleId]: { ruleId, ruleName, sensorId, timestamp, triggeredAtMs } }
  const [ruleTriggers, setRuleTriggers] = useState({});
  const [lastTriggeredRule, setLastTriggeredRule] = useState(null);

  // Global toast / feedback notifications list (Steps 6, 7, 10)
  const [notifications, setNotifications] = useState([]);
  const isFirstConnection = useRef(true);

  // Step 4: Live alerts received via alert:new Socket.IO event
  const [liveAlerts, setLiveAlerts] = useState([]);

  const clearLiveAlerts = useCallback(() => {
    setLiveAlerts([]);
  }, []);

  const dismissNotification = useCallback((id) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const addNotification = useCallback(
    (notif) => {
      const id =
        notif.id ||
        `notif-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const notifItem = {
        ...notif,
        id,
        createdAt: Date.now(),
      };

      setNotifications((prev) => [notifItem, ...prev.slice(0, 5)]);

      const duration = notif.duration ?? (notif.type === "rule_trigger" ? 7000 : 5000);
      if (duration > 0) {
        setTimeout(() => {
          dismissNotification(id);
        }, duration);
      }
    },
    [dismissNotification]
  );

  /*
   * Step 4: Handles alert:new Socket.IO events emitted by alertService.js
   * after a rule trigger persists a new Alert document to MongoDB.
   *
   * Socket.IO
   *      ↓
   * alert:new
   *      ↓
   * handleAlertNew()
   */
  const handleAlertNew = useCallback(
    (alertDoc) => {
      if (!alertDoc) return;

      console.log("🔔 alert:new received:", alertDoc);

      const alertId = alertDoc._id || alertDoc.id || `alert-${Date.now()}`;
      const ruleName = alertDoc.ruleName || "Rule";
      const sensorId = alertDoc.sensorId || "";

      // Prepend to liveAlerts — Alerts.jsx will merge these in real-time
      setLiveAlerts((prev) => {
        // Avoid duplicates if the same alert arrives more than once
        const alreadyExists = prev.some(
          (a) => (a._id || a.id) === alertId
        );
        if (alreadyExists) return prev;
        return [{ ...alertDoc, _id: alertId, isRead: false }, ...prev];
      });

      // Also push a toast so user sees the new alert regardless of which page they're on
      addNotification({
        type: "alert_new",
        ruleId: alertDoc.ruleId,
        alertId,
        title: `🔴 New Alert: ${ruleName}`,
        message: sensorId ? `Sensor: ${sensorId}` : alertDoc.message || "",
        timestamp: alertDoc.timestamp,
        duration: 7000,
      });
    },
    [addNotification]
  );

  /*
   * Receives telemetry from:
   *
   * Socket.IO
   *      ↓
   * telemetry:update
   *      ↓
   * updateTelemetry()
   */
  const updateTelemetry = useCallback((data) => {
    if (!data || !data.sensorId) {
      console.warn("Invalid telemetry data:", data);
      return;
    }

    console.log("Live telemetry received:", data);

    // Store latest telemetry for each sensor
    setTelemetryBySensor((previous) => ({
      ...previous,
      [data.sensorId]: {
        ...previous[data.sensorId],
        ...data,
      },
    }));

    // Add new telemetry point to chart history
    setHistoryBySensor((previous) => {
      const oldHistory = previous[data.sensorId] || [];

      const newPoint = {
        time: new Date(
          data.timestamp || Date.now()
        ).toLocaleTimeString([], {
          minute: "2-digit",
          second: "2-digit",
        }),

        temperature: data.temperature ?? null,
        pressure: data.pressure ?? null,
        rpm: data.rpm ?? null,
      };

      return {
        ...previous,

        [data.sensorId]: [
          ...oldHistory,
          newPoint,
        ].slice(-20),
      };
    });
  }, []);

  /*
   * Receives Rule Trigger event from:
   *
   * Socket.IO
   *      ↓
   * rule:triggered
   *      ↓
   * handleRuleTriggered()
   */
  const handleRuleTriggered = useCallback(
    (data) => {
      if (!data || !data.ruleId) {
        console.warn("Invalid rule:triggered payload received:", data);
        return;
      }

      console.log("🔔 Live rule:triggered event received:", data);

      const ruleId = String(data.ruleId);
      const ruleName = data.ruleName || "High Temperature Alert";
      const sensorId = data.sensorId || "TURBINE-001";
      const eventTimestamp = data.timestamp || new Date().toISOString();

      const triggerData = {
        ruleId,
        ruleName,
        sensorId,
        timestamp: eventTimestamp,
        triggeredAtMs: Date.now(),
      };

      // Step 9: Update React local state reactively without page reload
      setRuleTriggers((previous) => ({
        ...previous,
        [ruleId]: triggerData,
      }));

      setLastTriggeredRule(triggerData);

      // Step 6 & 7: Toast trigger feedback with "View Alert" action
      addNotification({
        type: "rule_trigger",
        ruleId,
        ruleName,
        sensorId,
        title: `⚠ ${ruleName} triggered`,
        message: `Sensor: ${sensorId}`,
        timestamp: eventTimestamp,
        duration: 7500,
      });
    },
    [addNotification]
  );

  /*
   * Connect to Socket.IO backend & listen for telemetry + rule triggers
   */
  useEffect(() => {
    setConnectionStatus("reconnecting");
    setConnectionError("");

    connectSocket();

    const handleConnect = () => {
      console.log("Connected to NexusFlow WebSocket");

      setConnectionStatus("connected");
      setConnectionError("");

      // Step 10: Show "Real-time connection restored" feedback on reconnection
      if (!isFirstConnection.current) {
        addNotification({
          type: "connection_restored",
          title: "Real-time connection restored",
          message: "Live telemetry and rule trigger streams are active.",
          duration: 4500,
        });
      }
      isFirstConnection.current = false;
    };

    const handleDisconnect = (reason) => {
      console.log("Disconnected from NexusFlow WebSocket:", reason);

      setConnectionStatus("disconnected");

      // Step 10: Show "Real-time connection lost" feedback on disconnection
      addNotification({
        type: "connection_lost",
        title: "Real-time connection lost",
        message: "Attempting to reconnect to backend server...",
        duration: 6000,
      });
    };

    const handleConnectError = (error) => {
      console.error(
        "NexusFlow WebSocket connection error:",
        error
      );

      setConnectionStatus("disconnected");

      setConnectionError(
        "Unable to connect to telemetry server"
      );

      // Step 10: Show connection lost toast
      addNotification({
        type: "connection_lost",
        title: "Real-time connection lost",
        message: "Unable to reach telemetry backend server.",
        duration: 6000,
      });
    };

    socket.on("connect", handleConnect);

    socket.on("disconnect", handleDisconnect);

    socket.on("connect_error", handleConnectError);

    // Listen for telemetry:update
    const unsubscribeTelemetry =
      subscribeToTelemetry(updateTelemetry);

    // Listen for rule:triggered (Step 2)
    const unsubscribeRuleTrigger =
      subscribeToRuleTrigger(handleRuleTriggered);

    // Step 4: Listen for alert:new — emitted by alertService after alert persisted
    const unsubscribeAlertNew =
      subscribeToAlertNew(handleAlertNew);

    return () => {
      unsubscribeTelemetry();
      unsubscribeRuleTrigger();
      unsubscribeAlertNew();

      socket.off("connect", handleConnect);

      socket.off("disconnect", handleDisconnect);

      socket.off(
        "connect_error",
        handleConnectError
      );

      disconnectSocket();
    };
  }, [updateTelemetry, handleRuleTriggered, handleAlertNew, addNotification]);

  /*
   * Currently selected sensor
   */
  const activeTelemetry =
    telemetryBySensor[activeSensorId] || null;

  /*
   * Convert telemetry object into SensorCard data
   */
  const sensors = useMemo(() => {
    if (!activeTelemetry) {
      return [];
    }

    return [
      {
        id: `${activeTelemetry.sensorId}-temperature`,
        sensorId: activeTelemetry.sensorId,
        name: "Temperature",
        value: activeTelemetry.temperature,
        unit: "°C",
        status:
          activeTelemetry.temperature >= 80
            ? "Warning"
            : "Normal",
        icon: "🌡️",
        timestamp: activeTelemetry.timestamp,
      },

      {
        id: `${activeTelemetry.sensorId}-pressure`,
        sensorId: activeTelemetry.sensorId,
        name: "Pressure",
        value: activeTelemetry.pressure,
        unit: "PSI",
        status: "Normal",
        icon: "◉",
        timestamp: activeTelemetry.timestamp,
      },

      {
        id: `${activeTelemetry.sensorId}-rpm`,
        sensorId: activeTelemetry.sensorId,
        name: "RPM",
        value: activeTelemetry.rpm,
        unit: "RPM",
        status: "Normal",
        icon: "⚙️",
        timestamp: activeTelemetry.timestamp,
      },

      {
        id: `${activeTelemetry.sensorId}-humidity`,
        sensorId: activeTelemetry.sensorId,
        name: "Humidity",
        value: activeTelemetry.humidity,
        unit: "%",
        status: "Normal",
        icon: "💧",
        timestamp: activeTelemetry.timestamp,
      },
    ];
  }, [activeTelemetry]);

  /*
   * Get all available sensor IDs
   *
   * Example:
   * TURBINE-001
   * TURBINE-002
   * TURBINE-003
   */
  const sensorIds = useMemo(() => {
    return Object.keys(telemetryBySensor);
  }, [telemetryBySensor]);

  /*
   * Chart data for currently selected sensor
   */
  const history =
    historyBySensor[activeSensorId] || [];

  const value = useMemo(
    () => ({
      sensors,

      history,

      sensorIds,

      activeSensorId,

      setActiveSensorId,

      connectionStatus,

      connectionError,

      connected:
        connectionStatus === "connected",

      updateTelemetry,

      ruleTriggers,

      lastTriggeredRule,

      notifications,

      addNotification,

      dismissNotification,

      // Step 4: live alerts from alert:new Socket.IO event
      liveAlerts,

      clearLiveAlerts,
    }),
    [
      sensors,
      history,
      sensorIds,
      activeSensorId,
      connectionStatus,
      connectionError,
      updateTelemetry,
      ruleTriggers,
      lastTriggeredRule,
      notifications,
      addNotification,
      dismissNotification,
      liveAlerts,
      clearLiveAlerts,
    ]
  );

  return (
    <TelemetryContext.Provider value={value}>
      {children}
    </TelemetryContext.Provider>
  );
}

/**
 * Format trigger timestamp dynamically (Step 5)
 * Returns formatted local time (e.g. "10:30:15 AM") if today,
 * or full date + time (e.g. "20 Aug 2026, 10:30 AM")
 */
export function formatTriggerTime(timestamp) {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  if (isNaN(date.getTime())) return "";

  const now = new Date();
  const isSameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  const timeStr = date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  if (isSameDay) {
    return timeStr;
  }

  const dateStr = date.toLocaleDateString([], {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return `${dateStr}, ${timeStr}`;
}

export function useTelemetry() {
  const context = useContext(TelemetryContext);

  if (!context) {
    throw new Error(
      "useTelemetry must be used inside TelemetryProvider"
    );
  }

  return context;
}