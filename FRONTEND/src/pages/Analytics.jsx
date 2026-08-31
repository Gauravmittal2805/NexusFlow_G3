/**
 * Analytics.jsx — NexusFlow Analytics Page
 *
 * Steps 1–5 + 10:
 * Step 1  — Clean layout: header, time-range filter, trend chart, alert stats, sensor overview
 * Step 2  — Telemetry trend chart with metric selector (Temperature, Pressure, Humidity, RPM)
 * Step 3  — Time range filter: Last 1 Hour, 24 Hours, 7 Days, 30 Days
 * Step 4  — Alert statistics from live AlertContext (Total, High, Medium, Low)
 * Step 5  — Sensor selector: filters chart and stats by sensor
 * Step 10 — Loading, empty, and error states
 */

import React, { useMemo, useState } from "react";
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
import { useAlerts } from "../context/AlertContext";
import { useTelemetry } from "../context/TelemetryContext";

// ── Time-range helpers ────────────────────────────────────────────────────────

const TIME_RANGES = [
  { label: "Last 1 Hour",  value: "1h",  ms: 60 * 60 * 1000 },
  { label: "Last 24 Hours", value: "24h", ms: 24 * 60 * 60 * 1000 },
  { label: "Last 7 Days",  value: "7d",  ms: 7  * 24 * 60 * 60 * 1000 },
  { label: "Last 30 Days", value: "30d", ms: 30 * 24 * 60 * 60 * 1000 },
];

const METRICS = [
  { key: "temperature", label: "Temperature", unit: "°C",  color: "#7c3aed", strokeWidth: 3 },
  { key: "pressure",    label: "Pressure",    unit: "PSI", color: "#0ea5e9", strokeWidth: 2 },
  { key: "humidity",    label: "Humidity",    unit: "%",   color: "#14b8a6", strokeWidth: 2 },
];

const RPM_METRIC = { key: "rpm", label: "RPM", unit: "RPM", color: "#f97316", strokeWidth: 3 };

// ── Custom tooltip ─────────────────────────────────────────────────────────────

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: "#1e293b", color: "#fff",
      padding: "8px 12px", borderRadius: "8px",
      fontSize: "12px", boxShadow: "0 4px 12px rgba(0,0,0,.2)",
      border: "1px solid #334155",
    }}>
      <div style={{ color: "#94a3b8", fontWeight: 600, marginBottom: 4 }}>
        {label}
      </div>
      {payload.map((item) => (
        <div key={item.dataKey} style={{ color: item.color, display: "flex", justifyContent: "space-between", gap: 12, margin: "2px 0" }}>
          <span>{item.name}:</span>
          <strong>{item.value ?? "–"}</strong>
        </div>
      ))}
    </div>
  );
}

// ── Alert stats card ───────────────────────────────────────────────────────────

function AlertStatsPanel({ alerts, sensorFilter }) {
  const filtered = sensorFilter === "All"
    ? alerts
    : alerts.filter((a) => a.sensorId === sensorFilter);

  const total  = filtered.length;
  const high   = filtered.filter((a) => a.severity === "HIGH").length;
  const medium = filtered.filter((a) => a.severity === "MEDIUM").length;
  const low    = filtered.filter((a) => a.severity === "LOW").length;

  const rows = [
    { label: "Total Alerts", value: total,  color: "#172033", bg: "#f1edff", accent: "#7c3aed" },
    { label: "High",         value: high,   color: "#dc2626", bg: "#fef2f2", accent: "#ef4444" },
    { label: "Medium",       value: medium, color: "#d97706", bg: "#fffbeb", accent: "#f59e0b" },
    { label: "Low",          value: low,    color: "#16a34a", bg: "#f0fdf4", accent: "#22c55e" },
  ];

  return (
    <div className="panel" style={{ height: "100%" }}>
      <div className="panel-header" style={{ marginBottom: 16 }}>
        <div>
          <span className="eyebrow">Live Data</span>
          <h2>Alert Statistics</h2>
        </div>
        {sensorFilter !== "All" && (
          <span style={{ fontSize: 10, background: "#f1edff", color: "#7c3aed", padding: "2px 8px", borderRadius: 6, fontWeight: 700 }}>
            {sensorFilter}
          </span>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {rows.map((row) => (
          <div key={row.label} style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "10px 14px", borderRadius: 10,
            background: row.bg, border: `1px solid ${row.accent}22`,
          }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#4f5a6c" }}>
              {row.label}
            </span>
            <strong style={{ fontSize: 20, color: row.color, letterSpacing: "-0.04em" }}>
              {row.value.toString().padStart(2, "0")}
            </strong>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Sensor overview mini-cards ─────────────────────────────────────────────────

function SensorOverviewPanel({ telemetryBySensor, sensorIds }) {
  return (
    <div className="panel" style={{ height: "100%" }}>
      <div className="panel-header" style={{ marginBottom: 16 }}>
        <div>
          <span className="eyebrow">All Sensors</span>
          <h2>Sensor Overview</h2>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {sensorIds.map((sensorId) => {
          const t = telemetryBySensor[sensorId];
          return (
            <div key={sensorId} style={{
              padding: "10px 14px", borderRadius: 10,
              background: "#f8fafc", border: "1px solid #e7eaf1",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 700, color: "#4f46e5", background: "#eff6ff", padding: "2px 7px", borderRadius: 4 }}>
                  {sensorId}
                </span>
                <span style={{ fontSize: 10, color: t ? "#16a34a" : "#94a3b8", fontWeight: 700 }}>
                  {t ? "● LIVE" : "○ WAITING"}
                </span>
              </div>
              {t ? (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                  {[
                    { icon: "🌡️", label: "Temp", val: t.temperature, unit: "°C" },
                    { icon: "◉",  label: "Pressure", val: t.pressure, unit: " PSI" },
                    { icon: "💧", label: "Humidity", val: t.humidity, unit: "%" },
                    { icon: "⚙️", label: "RPM", val: t.rpm, unit: "" },
                  ].map(({ icon, label, val, unit }) => (
                    <div key={label} style={{ fontSize: 11, color: "#64748b" }}>
                      {icon} <strong style={{ color: "#172033" }}>{val ?? "–"}{unit}</strong> {label}
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ margin: 0, fontSize: 11, color: "#94a3b8" }}>Waiting for telemetry...</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function Analytics() {
  const { alerts, loading: alertsLoading, error: alertsError } = useAlerts();
  const {
    historyBySensor,
    telemetryBySensor,
    sensorIds,
    connectionStatus,
  } = useTelemetry();

  const [timeRange,    setTimeRange]    = useState("24h");
  const [sensorFilter, setSensorFilter] = useState("All");

  // ── Step 3: Filter history by time range ────────────────────────────────────
  const filteredHistory = useMemo(() => {
    const range = TIME_RANGES.find((r) => r.value === timeRange);
    const cutoff = Date.now() - (range?.ms ?? TIME_RANGES[1].ms);

    const source = sensorFilter === "All"
      ? Object.values(historyBySensor).flat()
      : (historyBySensor[sensorFilter] || []);

    // Sort by timestamp ascending for the chart
    const sorted = [...source].sort((a, b) =>
      new Date(a.timestamp || 0) - new Date(b.timestamp || 0)
    );

    // Filter by time range — if timestamp is missing (seed data), show all
    return sorted.filter((p) => {
      if (!p.timestamp) return true;
      return new Date(p.timestamp).getTime() >= cutoff;
    });
  }, [historyBySensor, sensorFilter, timeRange]);

  // ── Step 5: Build sensor selector list ──────────────────────────────────────
  const sensorOptions = ["All", ...sensorIds];

  // ── Determine chart lines to show ───────────────────────────────────────────
  // Main chart shows temperature, pressure, humidity (no RPM)
  const visibleMetrics = METRICS;

  const isLoading  = connectionStatus === "reconnecting" && filteredHistory.length === 0;
  const hasData    = filteredHistory.length > 0;

  return (
    <div className="analytics-page">

      {/* ── HEADER ── */}
      <div className="analytics-header">
        <div>
          <span className="eyebrow">NexusFlow</span>
          <h1 style={{ margin: "6px 0 4px", fontSize: "clamp(22px, 2.5vw, 30px)", letterSpacing: "-0.03em" }}>
            Analytics
          </h1>
          <p style={{ margin: 0, color: "#778296", fontSize: 13 }}>
            Monitor telemetry and alert trends across all sensors.
          </p>
        </div>

        {/* ── Step 3: Time range selector ── */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <label style={{ fontSize: 11, color: "#64748b", fontWeight: 700 }}>Time Range:</label>
          <select
            className="range-select analytics-select"
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value)}
          >
            {TIME_RANGES.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>

          {/* ── Step 5: Sensor selector ── */}
          <label style={{ fontSize: 11, color: "#64748b", fontWeight: 700 }}>Sensor:</label>
          <select
            className="range-select analytics-select"
            value={sensorFilter}
            onChange={(e) => setSensorFilter(e.target.value)}
          >
            {sensorOptions.map((id) => (
              <option key={id} value={id}>{id}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Step 2: TELEMETRY TREND CHART (Temperature, Pressure, Humidity) ── */}
      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-header">
          <div>
            <span className="eyebrow">Socket.IO Live Stream</span>
            <h2>
              Temperature / Pressure / Humidity
              {sensorFilter !== "All" ? ` — ${sensorFilter}` : " — All Sensors"}
            </h2>
          </div>
          <span className="updated-label">
            {hasData ? `${filteredHistory.length} points` : "Waiting for data"}
          </span>
        </div>

        {/* Step 10: Loading state */}
        {isLoading && (
          <div className="analytics-state-box">
            <div className="spinner" />
            <span>Loading analytics data...</span>
          </div>
        )}

        {/* Step 10: Empty state */}
        {!isLoading && !hasData && (
          <div className="analytics-state-box">
            <span style={{ fontSize: 28 }}>📊</span>
            <strong>No telemetry data available for this period.</strong>
            <span style={{ fontSize: 12, color: "#94a3b8" }}>
              Try selecting a wider time range or check the sensor connection.
            </span>
          </div>
        )}

        {/* Chart */}
        {hasData && (
          <div className="chart-wrap">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={filteredHistory} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="time" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#94a3b8" }} />
                <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#94a3b8" }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                {visibleMetrics.map((m) => (
                  <Line
                    key={m.key}
                    type="monotone"
                    dataKey={m.key}
                    name={`${m.label} (${m.unit})`}
                    stroke={m.color}
                    strokeWidth={m.strokeWidth}
                    dot={false}
                    connectNulls
                    activeDot={{ r: 4 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* ── SEPARATE RPM CHART ── */}
      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-header">
          <div>
            <span className="eyebrow">Engine Speed Monitor</span>
            <h2>
              RPM (Revolutions Per Minute)
              {sensorFilter !== "All" ? ` — ${sensorFilter}` : " — All Sensors"}
            </h2>
          </div>
          <span className="updated-label">
            {hasData ? `${filteredHistory.length} points` : "Waiting for data"}
          </span>
        </div>

        {/* Step 10: Loading state */}
        {isLoading && (
          <div className="analytics-state-box">
            <div className="spinner" />
            <span>Loading RPM data...</span>
          </div>
        )}

        {/* Step 10: Empty state */}
        {!isLoading && !hasData && (
          <div className="analytics-state-box">
            <span style={{ fontSize: 28 }}>⚙️</span>
            <strong>No RPM data available for this period.</strong>
            <span style={{ fontSize: 12, color: "#94a3b8" }}>
              Try selecting a wider time range or check the sensor connection.
            </span>
          </div>
        )}

        {/* RPM Chart */}
        {hasData && (
          <div className="chart-wrap">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={filteredHistory} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="time" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#94a3b8" }} />
                <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#94a3b8" }} domain={['dataMin - 50', 'dataMax + 50']} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                <Line
                  type="monotone"
                  dataKey={RPM_METRIC.key}
                  name={`${RPM_METRIC.label} (${RPM_METRIC.unit})`}
                  stroke={RPM_METRIC.color}
                  strokeWidth={RPM_METRIC.strokeWidth}
                  dot={false}
                  connectNulls
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* ── Step 4 + Sensor Overview: BOTTOM ROW ── */}
      <div className="analytics-bottom-grid">

        {/* Step 10: Alert stats error */}
        {alertsError ? (
          <div className="analytics-state-box analytics-state-error">
            <span style={{ fontSize: 22 }}>⚠️</span>
            <strong>Unable to load alert statistics.</strong>
            <span style={{ fontSize: 12 }}>Please try again later.</span>
          </div>
        ) : alertsLoading ? (
          <div className="panel" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, minHeight: 180 }}>
            <div className="spinner" />
            <span style={{ color: "#64748b", fontSize: 13 }}>Loading alert statistics...</span>
          </div>
        ) : (
          <AlertStatsPanel alerts={alerts} sensorFilter={sensorFilter} />
        )}

        <SensorOverviewPanel
          telemetryBySensor={telemetryBySensor}
          sensorIds={sensorIds}
        />
      </div>
    </div>
  );
}
