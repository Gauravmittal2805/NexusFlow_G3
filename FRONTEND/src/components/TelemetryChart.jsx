/**
 * TelemetryChart.jsx
 *
 * Recharts LineChart showing temperature, pressure, and humidity trend lines.
 * Supports metric view filtering (All, Temperature, Pressure, Humidity).
 * RPM is displayed in a dedicated RPMChart component on the Dashboard.
 *
 * Each point in `data`:
 *   { timestamp: string, time: string, temperature: number|null, pressure: number|null,
 *     humidity: number|null, rpm: number|null }
 */

import React, { useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export default function TelemetryChart({ data, isPaused = false }) {
  const [selectedMetric, setSelectedMetric] = useState("all");

  if (!data || data.length === 0) {
    return (
      <div className="empty-state" style={{ minHeight: "260px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "6px" }}>
        <span style={{ fontSize: "28px" }}>📊</span>
        <strong style={{ color: "#4f5a6c", fontSize: "14px" }}>No telemetry data available</strong>
        <span style={{ color: "#8a94a5", fontSize: "12px" }}>Waiting for sensor data...</span>
      </div>
    );
  }

  // Custom tooltip to show readable unit names and values
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div style={{
          backgroundColor: "#1e293b",
          color: "#fff",
          padding: "8px 12px",
          borderRadius: "8px",
          fontSize: "12px",
          boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
          border: "1px solid #334155"
        }}>
          <div style={{ fontWeight: "600", marginBottom: "4px", color: "#94a3b8" }}>
            Time: {label}
          </div>
          {payload.map((item) => (
            <div key={item.dataKey} style={{ color: item.color, display: "flex", justifyContent: "space-between", gap: "12px", margin: "2px 0" }}>
              <span>{item.name}:</span>
              <strong>{item.value ?? "--"}</strong>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  const showTemp = selectedMetric === "all" || selectedMetric === "temperature";
  const showPressure = selectedMetric === "all" || selectedMetric === "pressure";
  const showHumidity = selectedMetric === "all" || selectedMetric === "humidity";

  return (
    <div className="telemetry-chart-container" style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>
      {/* Metric view toggles */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px", padding: "0 4px" }}>
        <div style={{ display: "flex", gap: "6px" }}>
          {[
            { id: "all", label: "All Metrics" },
            { id: "temperature", label: "Temperature (°C)" },
            { id: "pressure", label: "Pressure (PSI)" },
            { id: "humidity", label: "Humidity (%)" },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSelectedMetric(tab.id)}
              style={{
                fontSize: "11px",
                fontWeight: selectedMetric === tab.id ? "700" : "500",
                padding: "4px 10px",
                borderRadius: "6px",
                border: "1px solid",
                borderColor: selectedMetric === tab.id ? "#7c3aed" : "#e2e8f0",
                backgroundColor: selectedMetric === tab.id ? "#f5f3ff" : "#fff",
                color: selectedMetric === tab.id ? "#7c3aed" : "#64748b",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {isPaused && (
          <span style={{ fontSize: "11px", color: "#f59e0b", backgroundColor: "#fef3c7", padding: "3px 8px", borderRadius: "6px", fontWeight: "600" }}>
            ⏸ Stream Paused
          </span>
        )}
      </div>

      <div className="chart-wrap" style={{ flex: 1, minHeight: "240px" }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{ top: 8, right: 12, left: -18, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#f1f5f9" />
            <XAxis dataKey="time" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#94a3b8" }} />
            <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#94a3b8" }} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: "12px", paddingTop: "8px" }} />

            {/* Temperature — Step 4 */}
            {showTemp && (
              <Line
                type="monotone"
                dataKey="temperature"
                name="Temperature (°C)"
                stroke="#7c3aed"
                strokeWidth={3}
                dot={false}
                connectNulls
                activeDot={{ r: 4 }}
              />
            )}

            {/* Pressure — Step 5 */}
            {showPressure && (
              <Line
                type="monotone"
                dataKey="pressure"
                name="Pressure (PSI)"
                stroke="#0ea5e9"
                strokeWidth={2}
                dot={false}
                connectNulls
                activeDot={{ r: 4 }}
              />
            )}

            {/* Humidity — Step 7 */}
            {showHumidity && (
              <Line
                type="monotone"
                dataKey="humidity"
                name="Humidity (%)"
                stroke="#14b8a6"
                strokeWidth={2}
                dot={false}
                connectNulls
                activeDot={{ r: 4 }}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}