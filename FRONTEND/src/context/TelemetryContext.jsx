/**
 * TelemetryContext.jsx — NexusFlow Real-Time Telemetry State & Stream Manager
 *
 * Implements:
 * - Step 1: Clean unified live telemetry state management without duplicate states.
 * - Step 2: Multi-sensor selection (TURBINE-001, TURBINE-002, TURBINE-003, etc.).
 * - Step 3: Strict sensor data isolation (historyBySensor & telemetryBySensor keyed by sensorId).
 * - Step 4: Rolling history window (max 60–100 data points per sensor) for peak chart performance.
 * - Step 5: Formatted latest readings for sensor overview cards.
 * - Step 8: Safe loading and empty states for newly added or waiting sensors.
 * - Step 9: Live connection tracking (connected, reconnecting, disconnected, paused).
 * - Step 12: Direct consumption of backend telemetry contract:
 *           { sensorId, timestamp, temperature, pressure, humidity, rpm }
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

import {
  connectSocket,
  disconnectSocket,
  socket,
  subscribeToTelemetry,
} from "../services/socket";
import { getTelemetry } from "../services/api";

const TelemetryContext = createContext(null);

/** Maximum historical points stored per sensor in browser memory (Step 4) */
const MAX_HISTORY_POINTS = 60;

/** Default known sensor IDs */
const DEFAULT_SENSOR_IDS = ["TURBINE-001", "TURBINE-002", "TURBINE-003"];

/** Initial baseline telemetry values to avoid initial flicker */
const initialTelemetry = {
  "TURBINE-001": {
    sensorId: "TURBINE-001",
    timestamp: new Date().toISOString(),
    temperature: 78.5,
    pressure: 120.0,
    humidity: 43.0,
    rpm: 1800,
  },
  "TURBINE-002": {
    sensorId: "TURBINE-002",
    timestamp: new Date().toISOString(),
    temperature: 72.0,
    pressure: 115.0,
    humidity: 45.0,
    rpm: 1750,
  },
  "TURBINE-003": {
    sensorId: "TURBINE-003",
    timestamp: new Date().toISOString(),
    temperature: 75.0,
    pressure: 118.0,
    humidity: 40.0,
    rpm: 1820,
  },
};

export function TelemetryProvider({ children }) {
  // Step 1 & 3: Isolated telemetry state per sensor
  const [telemetryBySensor, setTelemetryBySensor] = useState(initialTelemetry);

  // Step 3 & 4: Isolated rolling history buffer per sensor
  const [historyBySensor, setHistoryBySensor] = useState({
    "TURBINE-001": [
      { timestamp: new Date(Date.now() - 50000).toISOString(), time: "10:30:10", temperature: 72,   pressure: 116, rpm: 1750, humidity: 41 },
      { timestamp: new Date(Date.now() - 40000).toISOString(), time: "10:30:20", temperature: 74,   pressure: 118, rpm: 1780, humidity: 42 },
      { timestamp: new Date(Date.now() - 30000).toISOString(), time: "10:30:30", temperature: 76,   pressure: 119, rpm: 1795, humidity: 43 },
      { timestamp: new Date(Date.now() - 20000).toISOString(), time: "10:30:40", temperature: 75,   pressure: 121, rpm: 1805, humidity: 42 },
      { timestamp: new Date(Date.now() - 10000).toISOString(), time: "10:30:50", temperature: 78,   pressure: 120, rpm: 1800, humidity: 44 },
      { timestamp: new Date().toISOString(),                   time: "10:31:00", temperature: 78.5, pressure: 120, rpm: 1800, humidity: 43 },
    ],
    "TURBINE-002": [
      { timestamp: new Date(Date.now() - 30000).toISOString(), time: "10:30:30", temperature: 70, pressure: 114, rpm: 1740, humidity: 44 },
      { timestamp: new Date(Date.now() - 15000).toISOString(), time: "10:30:45", temperature: 71, pressure: 115, rpm: 1745, humidity: 45 },
      { timestamp: new Date().toISOString(),                   time: "10:31:00", temperature: 72, pressure: 115, rpm: 1750, humidity: 45 },
    ],
    "TURBINE-003": [
      { timestamp: new Date(Date.now() - 30000).toISOString(), time: "10:30:30", temperature: 73, pressure: 117, rpm: 1800, humidity: 39 },
      { timestamp: new Date(Date.now() - 15000).toISOString(), time: "10:30:45", temperature: 74, pressure: 117, rpm: 1810, humidity: 40 },
      { timestamp: new Date().toISOString(),                   time: "10:31:00", temperature: 75, pressure: 118, rpm: 1820, humidity: 40 },
    ],
  });

  // Step 2: Selected sensor identifier
  const [activeSensorId, setActiveSensorId] = useState("TURBINE-001");

  // Step 9: Socket connection & stream visualization controls
  const [connectionStatus, setConnectionStatus] = useState("disconnected");
  const [connectionError, setConnectionError] = useState("");
  const [isPaused, setIsPaused] = useState(false);

  const togglePause = useCallback(() => {
    setIsPaused((prev) => !prev);
  }, []);

  /*
   * Helper to format raw backend timestamp into clean chart label e.g. "10:30:15"
   */
  const formatChartTime = (rawTimestamp) => {
    if (!rawTimestamp) return "Just now";
    const date = new Date(rawTimestamp);
    if (isNaN(date.getTime())) return "Just now";
    return date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  };

  /*
   * Step 1, 3, 4, 12: Process incoming live telemetry packet
   *
   * Telemetry payload contract (Step 12):
   * {
   *   "sensorId": "TURBINE-001",
   *   "timestamp": "2026-08-28T10:32:15.000Z",
   *   "temperature": 85.4,
   *   "pressure": 121,
   *   "humidity": 43,
   *   "rpm": 1840
   * }
   */
  const updateTelemetry = useCallback((data) => {
    if (!data || !data.sensorId) {
      console.warn("[TelemetryContext] Invalid telemetry packet received:", data);
      return;
    }

    const sensorId = String(data.sensorId).trim();
    const formattedTime = formatChartTime(data.timestamp);

    // Step 3: Update latest telemetry state for THIS sensor only
    setTelemetryBySensor((previous) => ({
      ...previous,
      [sensorId]: {
        ...previous[sensorId],
        ...data,
        sensorId,
        formattedTime,
      },
    }));

    // Step 3 & 4: Append new data point to THIS sensor's rolling history only
    setHistoryBySensor((previous) => {
      const oldHistory = previous[sensorId] || [];

      const newPoint = {
        timestamp: data.timestamp || new Date().toISOString(),
        time: formattedTime,
        temperature: parseNum(data.temperature),
        pressure: parseNum(data.pressure),
        rpm: parseNum(data.rpm),
        humidity: parseNum(data.humidity),
      };

      return {
        ...previous,
        [sensorId]: [...oldHistory, newPoint].slice(-MAX_HISTORY_POINTS),
      };
    });
  }, []);

  /*
   * Helper to safely convert raw telemetry fields to finite numbers
   */
  const parseNum = (val) => {
    if (val === null || val === undefined) return null;
    const n = Number(val);
    return isNaN(n) ? null : n;
  };

  /*
   * Fetch initial historical telemetry records from backend API on mount
   */
  useEffect(() => {
    let isCancelled = false;
    async function loadInitialTelemetry() {
      try {
        const response = await getTelemetry({ limit: 100 });
        if (response.data?.success && Array.isArray(response.data?.data) && response.data.data.length > 0 && !isCancelled) {
          const rawList = response.data.data;
          const groupedHistory = {};
          const latestMap = {};

          rawList.forEach((item) => {
            const sensorId = (item.sensorId || "TURBINE-001").trim();
            const formattedTime = formatChartTime(item.timestamp);

            const point = {
              timestamp: item.timestamp || new Date().toISOString(),
              time: formattedTime,
              temperature: parseNum(item.temperature),
              pressure: parseNum(item.pressure),
              rpm: parseNum(item.rpm),
              humidity: parseNum(item.humidity),
            };

            if (!groupedHistory[sensorId]) groupedHistory[sensorId] = [];
            groupedHistory[sensorId].push(point);

            latestMap[sensorId] = {
              ...item,
              sensorId,
              formattedTime,
            };
          });

          setHistoryBySensor((prev) => {
            const merged = { ...prev };
            Object.keys(groupedHistory).forEach((sid) => {
              const prevPoints = merged[sid] || [];
              const newPoints = groupedHistory[sid] || [];
              // Deduplicate by timestamp and sort chronologically
              const combined = [...prevPoints, ...newPoints];
              const uniqueMap = new Map();
              combined.forEach((pt) => {
                const k = pt.timestamp || pt.time;
                uniqueMap.set(k, pt);
              });
              merged[sid] = Array.from(uniqueMap.values())
                .sort((a, b) => new Date(a.timestamp || 0) - new Date(b.timestamp || 0))
                .slice(-MAX_HISTORY_POINTS);
            });
            return merged;
          });

          setTelemetryBySensor((prev) => ({
            ...prev,
            ...latestMap,
          }));
        }
      } catch (err) {
        console.warn("[TelemetryContext] Initial telemetry fetch fallback:", err.message);
      }
    }

    loadInitialTelemetry();
    return () => { isCancelled = true; };
  }, []);

  /*
   * Step 9: Socket.IO Connection Lifecycle Management
   */
  useEffect(() => {
    setConnectionStatus("reconnecting");
    setConnectionError("");

    connectSocket();

    const handleConnect = () => {
      console.log("[TelemetryContext] 🔌 Socket.IO connected to telemetry stream");
      setConnectionStatus("connected");
      setConnectionError("");
    };

    const handleDisconnect = (reason) => {
      console.warn("[TelemetryContext] ⚠️ Socket.IO disconnected:", reason);
      setConnectionStatus("disconnected");
    };

    const handleConnectError = (error) => {
      console.error("[TelemetryContext] Socket.IO connection error:", error.message);
      setConnectionStatus("disconnected");
      setConnectionError("Unable to reach telemetry backend server");
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("connect_error", handleConnectError);

    // Subscribe to real-time telemetry updates from WebSocket
    const unsubscribeTelemetry = subscribeToTelemetry(updateTelemetry);

    if (socket.connected) {
      setConnectionStatus("connected");
    }

    return () => {
      unsubscribeTelemetry();
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("connect_error", handleConnectError);
      disconnectSocket();
    };
  }, [updateTelemetry]);

  /*
   * Step 2 & 3: Active sensor telemetry (filtered strictly by activeSensorId)
   */
  const activeTelemetry = telemetryBySensor[activeSensorId] || null;

  /*
   * Step 3 & 4: Active sensor historical data for charts
   */
  const history = historyBySensor[activeSensorId] || [];

  /*
   * Dynamically collect all available sensor IDs
   */
  const sensorIds = useMemo(() => {
    const ids = new Set([...DEFAULT_SENSOR_IDS, ...Object.keys(telemetryBySensor)]);
    return Array.from(ids).sort();
  }, [telemetryBySensor]);

  /*
   * Step 5: Convert latest reading of active sensor into SensorCard data items
   */
  const sensors = useMemo(() => {
    if (!activeTelemetry) {
      return [
        { id: `${activeSensorId}-temperature`, sensorId: activeSensorId, name: "Temperature", value: null, unit: "°C", status: "Normal", icon: "🌡️", timestamp: null },
        { id: `${activeSensorId}-pressure`,    sensorId: activeSensorId, name: "Pressure",    value: null, unit: "PSI", status: "Normal", icon: "◉", timestamp: null },
        { id: `${activeSensorId}-rpm`,         sensorId: activeSensorId, name: "RPM",         value: null, unit: "RPM", status: "Normal", icon: "⚙️", timestamp: null },
        { id: `${activeSensorId}-humidity`,    sensorId: activeSensorId, name: "Humidity",    value: null, unit: "%", status: "Normal", icon: "💧", timestamp: null },
      ];
    }

    return [
      {
        id: `${activeTelemetry.sensorId}-temperature`,
        sensorId: activeTelemetry.sensorId,
        name: "Temperature",
        value: activeTelemetry.temperature,
        unit: "°C",
        status: (activeTelemetry.temperature != null && activeTelemetry.temperature >= 80) ? "Warning" : "Normal",
        icon: "🌡️",
        timestamp: activeTelemetry.timestamp,
      },
      {
        id: `${activeTelemetry.sensorId}-pressure`,
        sensorId: activeTelemetry.sensorId,
        name: "Pressure",
        value: activeTelemetry.pressure,
        unit: "PSI",
        status: (activeTelemetry.pressure != null && activeTelemetry.pressure >= 150) ? "Warning" : "Normal",
        icon: "◉",
        timestamp: activeTelemetry.timestamp,
      },
      {
        id: `${activeTelemetry.sensorId}-rpm`,
        sensorId: activeTelemetry.sensorId,
        name: "RPM",
        value: activeTelemetry.rpm,
        unit: "RPM",
        status: (activeTelemetry.rpm != null && activeTelemetry.rpm >= 2200) ? "Warning" : "Normal",
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
  }, [activeTelemetry, activeSensorId]);

  const value = useMemo(
    () => ({
      // Telemetry Data (Step 1, 2, 3, 5)
      latestTelemetry: activeTelemetry,
      telemetryHistory: history,
      history,
      telemetryBySensor,
      historyBySensor,

      // Sensor Selection (Step 2 & 3)
      sensors,
      sensorIds,
      activeSensorId,
      setActiveSensorId,

      // Stream & Connection State (Step 4 & 9)
      isPaused,
      setIsPaused,
      togglePause,
      connectionStatus,
      connectionError,
      connected: connectionStatus === "connected",

      updateTelemetry,
    }),
    [
      activeTelemetry,
      history,
      telemetryBySensor,
      historyBySensor,
      sensors,
      sensorIds,
      activeSensorId,
      isPaused,
      setIsPaused,
      togglePause,
      connectionStatus,
      connectionError,
      updateTelemetry,
    ]
  );

  return (
    <TelemetryContext.Provider value={value}>
      {children}
    </TelemetryContext.Provider>
  );
}

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
    throw new Error("useTelemetry must be used inside TelemetryProvider");
  }
  return context;
}