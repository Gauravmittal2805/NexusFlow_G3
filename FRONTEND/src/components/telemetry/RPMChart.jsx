/**
 * RPMChart.jsx
 *
 * Dedicated Recharts LineChart for RPM metrics (Step 6).
 *
 * Props:
 *   data – array of rolling telemetry points:
 *          [{ timestamp: string, time: string, rpm: number|null, ... }]
 */

import React from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export default function RPMChart({ data }) {
  if (!data || data.length === 0) {
    return (
      <div className="empty-state" style={{ minHeight: "220px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "6px" }}>
        <span style={{ fontSize: "28px" }}>⚙️</span>
        <strong style={{ color: "#4f5a6c", fontSize: "14px" }}>No RPM data available</strong>
        <span style={{ color: "#8a94a5", fontSize: "12px" }}>Waiting for sensor data...</span>
      </div>
    );
  }

  const rpmValues = data
    .map((d) => d.rpm)
    .filter((v) => v != null && !isNaN(v));

  const minRPM = rpmValues.length ? Math.floor(Math.min(...rpmValues) * 0.95) : 0;
  const maxRPM = rpmValues.length ? Math.ceil(Math.max(...rpmValues) * 1.05) : 3000;

  return (
    <div className="chart-wrap" style={{ width: "100%", height: "100%", minHeight: "220px" }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#f1f5f9" />
          <XAxis dataKey="time" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#94a3b8" }} />
          <YAxis
            tickLine={false}
            axisLine={false}
            domain={[minRPM, maxRPM]}
            tick={{ fontSize: 11, fill: "#94a3b8" }}
            tickFormatter={(v) => `${v}`}
          />
          <Tooltip formatter={(val) => [`${val} RPM`, "RPM"]} />
          <Legend wrapperStyle={{ fontSize: "12px", paddingTop: "6px" }} />
          <ReferenceLine
            y={2200}
            stroke="#ef4444"
            strokeDasharray="6 3"
            label={{ value: "Warning Threshold", position: "insideTopRight", fontSize: 11, fill: "#ef4444" }}
          />
          <Line
            type="monotone"
            dataKey="rpm"
            name="RPM"
            stroke="#f97316"
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