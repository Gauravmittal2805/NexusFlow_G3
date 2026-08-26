/**
 * TelemetryChart.jsx
 *
 * Recharts LineChart showing temperature, pressure, and humidity trend lines.
 * RPM is displayed in a separate RPMChart component on the Dashboard.
 *
 * Each point in `data`:
 *   { time: string, temperature: number|null, pressure: number|null,
 *     humidity: number|null, rpm: number|null }
 *
 * Lines:
 *   temperature  – purple  #7c3aed  (primary metric, thicker)
 *   pressure     – blue    #0ea5e9
 *   humidity     – teal    #14b8a6
 */

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

export default function TelemetryChart({ data }) {
  if (!data?.length) {
    return (
      <div className="empty-state">
        No telemetry data available.
      </div>
    );
  }

  return (
    <div className="chart-wrap">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 8, right: 12, left: -18, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="4 4" vertical={false} />
          <XAxis dataKey="time" tickLine={false} axisLine={false} />
          <YAxis tickLine={false} axisLine={false} />
          <Tooltip />
          <Legend />

          {/* Temperature */}
          <Line
            type="monotone"
            dataKey="temperature"
            name="Temperature °C"
            stroke="#7c3aed"
            strokeWidth={3}
            dot={false}
            connectNulls
          />

          {/* Pressure */}
          <Line
            type="monotone"
            dataKey="pressure"
            name="Pressure PSI"
            stroke="#0ea5e9"
            strokeWidth={2}
            dot={false}
            connectNulls
          />

          {/* Humidity */}
          <Line
            type="monotone"
            dataKey="humidity"
            name="Humidity %"
            stroke="#14b8a6"
            strokeWidth={2}
            dot={false}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}