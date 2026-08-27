/**
 * RPMChart.jsx
 *
 * Dedicated Recharts chart for RPM trend data.
 * Displayed as a separate panel on the Dashboard so RPM values
 * (typically 1000–3000+) don't compress the temperature / pressure
 * / humidity lines that live on a much smaller numeric scale.
 *
 * Props:
 *   data – same history array as TelemetryChart
 *          [{ time: string, rpm: number|null, ... }]
 */

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

export default function RPMChart({ data, isPaused = false }) {
  if (!data?.length) {
    return (
      <div className="empty-state" style={{ minHeight: "240px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "6px" }}>
        <span style={{ fontSize: "28px" }}>⚙️</span>
        <strong style={{ color: "#4f5a6c", fontSize: "14px" }}>No RPM data available</strong>
        <span style={{ color: "#8a94a5", fontSize: "12px" }}>Waiting for sensor data...</span>
      </div>
    );
  }

  // Derive a sensible Y-axis domain from the actual data so the
  // chart doesn't start at 0 and make changes look flat.
  const rpmValues = data
    .map((d) => d.rpm)
    .filter((v) => v != null && !isNaN(v));

  const minRPM = rpmValues.length ? Math.floor(Math.min(...rpmValues) * 0.95) : 0;
  const maxRPM = rpmValues.length ? Math.ceil(Math.max(...rpmValues)  * 1.05) : 5000;

  return (
    <div className="chart-wrap">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 8, right: 12, left: -10, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="4 4" vertical={false} />

          <XAxis dataKey="time" tickLine={false} axisLine={false} />

          <YAxis
            tickLine={false}
            axisLine={false}
            domain={[minRPM, maxRPM]}
            tickFormatter={(v) => `${v}`}
          />

          <Tooltip formatter={(value) => [`${value} RPM`, "RPM"]} />

          <Legend />

          {/* Optional reference line at a common redline threshold */}
          <ReferenceLine
            y={3000}
            stroke="#ef4444"
            strokeDasharray="6 3"
            label={{ value: "Redline 3000", position: "insideTopRight", fontSize: 11, fill: "#ef4444" }}
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
