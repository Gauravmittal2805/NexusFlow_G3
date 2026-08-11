import React from "react";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { sensors as initialSensors, telemetryHistory } from "../data/mockData";

const TelemetryContext = createContext(null);

export function TelemetryProvider({ children }) {
  const [sensors, setSensors] = useState(initialSensors);
  const [history, setHistory] = useState(telemetryHistory);
  const [loading, setLoading] = useState(false);
  const [connected, setConnected] = useState(false);

  // Day 2 mock stream. Replace this section later with Socket.IO:
  // socket.on("telemetry:update", (data) => updateTelemetry(data));
  useEffect(() => {
    setConnected(true);

    const interval = setInterval(() => {
      setSensors((current) =>
        current.map((sensor) => {
          if (sensor.name === "Temperature") {
            const next = Number(
              (sensor.value + (Math.random() - 0.5) * 1.8).toFixed(1)
            );
            return {
              ...sensor,
              value: Math.max(60, Math.min(90, next)),
              status: next >= 80 ? "Warning" : "Normal",
            };
          }

          if (sensor.name === "Pressure") {
            const next = Math.round(sensor.value + (Math.random() - 0.5) * 4);
            return { ...sensor, value: Math.max(100, next) };
          }

          if (sensor.name === "RPM") {
            const next = Math.round(sensor.value + (Math.random() - 0.5) * 70);
            return { ...sensor, value: Math.max(1200, next) };
          }

          if (sensor.name === "Humidity") {
            const next = Math.round(sensor.value + (Math.random() - 0.5) * 3);
            return { ...sensor, value: Math.max(20, Math.min(80, next)) };
          }

          return sensor;
        })
      );
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  const temperature = sensors.find((s) => s.name === "Temperature")?.value ?? null;
  const pressure = sensors.find((s) => s.name === "Pressure")?.value ?? null;
  const rpm = sensors.find((s) => s.name === "RPM")?.value ?? null;

  useEffect(() => {
    if (temperature == null || pressure == null || rpm == null) return;

    setHistory((old) => [
      ...old.slice(-11),
      {
        time: new Date().toLocaleTimeString([], {
          minute: "2-digit",
          second: "2-digit",
        }),
        temperature,
        pressure,
        rpm,
      },
    ]);
  }, [temperature, pressure, rpm]);

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