import React from "react";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { io } from "socket.io-client";
import { sensors as initialSensors, telemetryHistory } from "../data/mockData";

const TelemetryContext = createContext(null);

const SOCKET_URL = import.meta.env.VITE_WS_URL || "http://localhost:5005";

export function TelemetryProvider({ children }) {
  const [sensors, setSensors] = useState(initialSensors);
  const [history, setHistory] = useState(telemetryHistory);
  const [loading, setLoading] = useState(false);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    // Connect to real backend Socket.IO server
    const socket = io(SOCKET_URL, {
      transports: ["websocket", "polling"],
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
    });

    socket.on("connect", () => {
      console.log("[Socket.IO] Connected to backend telemetry server!");
      setConnected(true);
    });

    socket.on("disconnect", (reason) => {
      console.log("[Socket.IO] Disconnected from server:", reason);
      setConnected(false);
    });

    socket.on("connect_error", (error) => {
      console.warn("[Socket.IO] Connection error:", error.message);
      setConnected(false);
    });

    // Listen for real-time telemetry from backend
    socket.on("telemetry:update", (data) => {
      if (!data) return;
      setConnected(true);

      const formattedTime = new Date(data.timestamp || Date.now()).toLocaleTimeString([], {
        minute: "2-digit",
        second: "2-digit",
      });

      // Update 4 sensor cards (Temperature, Pressure, RPM, Humidity)
      setSensors((current) =>
        current.map((sensor) => {
          if (sensor.name === "Temperature" && data.temperature != null) {
            return {
              ...sensor,
              value: data.temperature,
              status: data.status === "WARNING" || data.temperature >= 80 ? "Warning" : "Normal",
              timestamp: formattedTime,
            };
          }

          if (sensor.name === "Pressure" && data.pressure != null) {
            return {
              ...sensor,
              value: data.pressure,
              status: "Normal",
              timestamp: formattedTime,
            };
          }

          if (sensor.name === "RPM" && data.rpm != null) {
            return {
              ...sensor,
              value: data.rpm,
              status: "Normal",
              timestamp: formattedTime,
            };
          }

          if (sensor.name === "Humidity" && data.humidity != null) {
            return {
              ...sensor,
              value: data.humidity,
              status: "Normal",
              timestamp: formattedTime,
            };
          }

          return sensor;
        })
      );

      // Append point to telemetry history chart
      if (data.temperature != null && data.pressure != null && data.rpm != null) {
        setHistory((old) => [
          ...old.slice(-14),
          {
            time: formattedTime,
            temperature: data.temperature,
            pressure: data.pressure,
            rpm: data.rpm,
          },
        ]);
      }
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const value = useMemo(
    () => ({
      sensors,
      history,
      loading,
      connected,
      setLoading,
      setConnected,
    }),
    [sensors, history, loading, connected]
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
    throw new Error("useTelemetry must be used inside TelemetryProvider");
  }
  return context;
}