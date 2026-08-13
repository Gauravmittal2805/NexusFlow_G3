import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  connectSocket,
  disconnectSocket,
  socket,
  subscribeToTelemetry,
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
   * Connect to Socket.IO backend
   */
  useEffect(() => {
    setConnectionStatus("reconnecting");
    setConnectionError("");

    connectSocket();

    const handleConnect = () => {
      console.log("Connected to NexusFlow WebSocket");

      setConnectionStatus("connected");
      setConnectionError("");
    };

    const handleDisconnect = () => {
      console.log("Disconnected from NexusFlow WebSocket");

      setConnectionStatus("disconnected");
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
    };

    socket.on("connect", handleConnect);

    socket.on("disconnect", handleDisconnect);

    socket.on("connect_error", handleConnectError);

    // Listen for telemetry:update
    const unsubscribeTelemetry =
      subscribeToTelemetry(updateTelemetry);

    return () => {
      unsubscribeTelemetry();

      socket.off("connect", handleConnect);

      socket.off("disconnect", handleDisconnect);

      socket.off(
        "connect_error",
        handleConnectError
      );

      disconnectSocket();
    };
  }, [updateTelemetry]);

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
    }),
    [
      sensors,
      history,
      sensorIds,
      activeSensorId,
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

export function useTelemetry() {
  const context = useContext(TelemetryContext);

  if (!context) {
    throw new Error(
      "useTelemetry must be used inside TelemetryProvider"
    );
  }

  return context;
}