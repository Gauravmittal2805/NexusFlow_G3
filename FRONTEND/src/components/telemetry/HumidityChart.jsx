/**
 * HumidityChart.jsx
 *
 * Dedicated Recharts LineChart for Humidity metrics (Step 7).
 *
 * Props:
 *   data – array of rolling telemetry points:
 *          [{ timestamp: string, time: string, humidity: number|null, ... }]
 */

import React from "react";
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

export default function HumidityChart({ data }) {
  if (!data || data.length === 0) {
    return (
      <div className="empty-state" style={{ minHeight: "220px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "6px" }}>
        <span style={{ fontSize: "28px" }}>💧</span>
        <strong style={{ color: "#4f5a6c", fontSize: "14px" }}>No humidity data available</strong>
        <span style={{ color: "#8a94a5", fontSize: "12px" }}>Waiting for sensor data...</span>
      </div>
    );
  }

  return (
    <div className="chart-wrap" style={{ width: "100%", height: "100%", minHeight: "220px" }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
          <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#f1f5f9" />
          <XAxis dataKey="time" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#94a3b8" }} />
          <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#94a3b8" }} domain={[0, 100]} />
          <Tooltip formatter={(val) => [`${val} %`, "Humidity"]} />
          <Legend wrapperStyle={{ fontSize: "12px", paddingTop: "6px" }} />
          <Line
            type="monotone"
            dataKey="humidity"
            name="Humidity (%)"
            stroke="#14b8a6"
            strokeWidth={2.5}
            dot={false}
            connectNulls
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}