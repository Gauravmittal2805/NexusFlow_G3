/**
 * PressureChart.jsx
 *
 * Dedicated Recharts LineChart for Pressure metrics (Step 5).
 *
 * Props:
 *   data – array of rolling telemetry points:
 *          [{ timestamp: string, time: string, pressure: number|null, ... }]
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

export default function PressureChart({ data }) {
  if (!data || data.length === 0) {
    return (
      <div className="empty-state" style={{ minHeight: "220px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "6px" }}>
        <span style={{ fontSize: "28px" }}>◉</span>
        <strong style={{ color: "#4f5a6c", fontSize: "14px" }}>No pressure data available</strong>
        <span style={{ color: "#8a94a5", fontSize: "12px" }}>Waiting for sensor data...</span>
      </div>
    );
  }

  return (
    <div className="chart-wrap" style={{ width: "100%", height: "250px" }}>
      <ResponsiveContainer width="100%" height={250}>
        <LineChart data={data} margin={{ top: 12, right: 16, left: 10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#e2e8f0" />
          <XAxis dataKey="time" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#64748b" }} />
          <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#64748b" }} domain={["auto", "auto"]} />
          <Tooltip formatter={(val) => [`${val} PSI`, "Pressure"]} />
          <Legend wrapperStyle={{ fontSize: "12px", paddingTop: "6px" }} />
          <Line
            type="monotone"
            dataKey="pressure"
            name="Pressure (PSI)"
            stroke="#0ea5e9"
            strokeWidth={2.5}
            dot={{ r: 3 }}
            connectNulls
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}