/**
 * Analytics.jsx — NexusFlow Real-Time Telemetry & Alert Analytics
 *
 * Steps 1–6 + Full Backend API Integration:
 * Step 1 — Historical Telemetry in Charts (Temperature, Pressure, Humidity, RPM)
 * Step 2 — Metric Selector dropdown & tabs (Temperature, Pressure, Humidity, RPM, All)
 * Step 3 — Sensor Filter (TURBINE-001, TURBINE-002, TURBINE-003, All)
 * Step 4 — Time Range Filter (Last 1 Hour, Last 24 Hours, Last 7 Days, Last 30 Days)
 * Step 5 — Alert Analytics (Total Alerts, HIGH, MEDIUM, LOW) from /api/analytics/alerts
 * Step 6 — Alerts Over Time frequency chart from backend
 */

import React, { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
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
import {
  getAnalyticsAlerts,
  getAnalyticsTelemetry,
  getAnalyticsSensors,
} from "../services/api";

// ── Time-range definitions (Step 4) ──────────────────────────────────────────

const TIME_RANGES = [
  { label: "Last 1 Hour",   value: "1h",  ms: 60 * 60 * 1000 },
  { label: "Last 24 Hours", value: "24h", ms: 24 * 60 * 60 * 1000 },
  { label: "Last 7 Days",   value: "7d",  ms: 7  * 24 * 60 * 60 * 1000 },
  { label: "Last 30 Days",  value: "30d", ms: 30 * 24 * 60 * 60 * 1000 },
];

// ── Metric definitions (Step 1 & 2) ──────────────────────────────────────────

const METRIC_CONFIG = {
  temperature: {
    key: "temperature",
    label: "Temperature",
    unit: "°C",
    color: "#7c3aed",
    gradientId: "tempGrad",
    strokeWidth: 3,
    domain: ["dataMin - 5", "dataMax + 5"],
  },
  pressure: {
    key: "pressure",
    label: "Pressure",
    unit: "PSI",
    color: "#0ea5e9",
    gradientId: "pressGrad",
    strokeWidth: 3,
    domain: ["dataMin - 10", "dataMax + 10"],
  },
  humidity: {
    key: "humidity",
    label: "Humidity",
    unit: "%",
    color: "#14b8a6",
    gradientId: "humGrad",
    strokeWidth: 3,
    domain: [0, 100],
  },
  rpm: {
    key: "rpm",
    label: "RPM",
    unit: "RPM",
    color: "#f97316",
    gradientId: "rpmGrad",
    strokeWidth: 3,
    domain: ["dataMin - 50", "dataMax + 50"],
  },
};

const METRIC_OPTIONS = [
  { value: "temperature", label: "Temperature (°C)" },
  { value: "pressure",    label: "Pressure (PSI)" },
  { value: "humidity",    label: "Humidity (%)" },
  { value: "rpm",         label: "RPM (Speed)" },
  { value: "all",         label: "All Metrics" },
];

// ── Custom Tooltip for Telemetry Charts ──────────────────────────────────────

function TelemetryTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: "#1e293b",
      color: "#ffffff",
      padding: "10px 14px",
      borderRadius: "8px",
      fontSize: "12px",
      boxShadow: "0 6px 16px rgba(0,0,0,0.25)",
      border: "1px solid #334155",
      minWidth: 160,
    }}>
      <div style={{ color: "#94a3b8", fontWeight: 700, marginBottom: 6, borderBottom: "1px solid #334155", paddingBottom: 4 }}>
        {label}
      </div>
      {payload.map((item) => (
        <div key={item.dataKey} style={{ color: item.color, display: "flex", justifyContent: "space-between", gap: 12, margin: "3px 0" }}>
          <span>{item.name}:</span>
          <strong>{typeof item.value === "number" ? item.value.toFixed(1) : item.value}</strong>
        </div>
      ))}
    </div>
  );
}

// ── Custom Tooltip for Alert Chart ───────────────────────────────────────────

function AlertChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((s, p) => s + (p.value || 0), 0);
  return (
    <div style={{
      background: "#1e293b",
      color: "#ffffff",
      padding: "10px 14px",
      borderRadius: "8px",
      fontSize: "12px",
      boxShadow: "0 6px 16px rgba(0,0,0,0.25)",
      border: "1px solid #334155",
      minWidth: 140,
    }}>
      <div style={{ color: "#94a3b8", fontWeight: 700, marginBottom: 6, borderBottom: "1px solid #334155", paddingBottom: 4 }}>
        {label} — Total: {total}
      </div>
      {payload.map((item) => (
        <div key={item.dataKey} style={{ color: item.color, display: "flex", justifyContent: "space-between", gap: 12, margin: "3px 0" }}>
          <span>{item.name}:</span>
          <strong>{item.value}</strong>
        </div>
      ))}
    </div>
  );
}

// ── Step 5: Alert Statistics Panel ───────────────────────────────────────────

function AlertStatsPanel({ alertStats, loading }) {
  const rows = [
    { label: "Total Alerts", value: alertStats.total,    color: "#172033", bg: "#f1edff", accent: "#7c3aed" },
    { label: "HIGH",         value: alertStats.high,     color: "#dc2626", bg: "#fef2f2", accent: "#ef4444" },
    { label: "MEDIUM",       value: alertStats.medium,   color: "#d97706", bg: "#fffbeb", accent: "#f59e0b" },
    { label: "LOW",          value: alertStats.low,      color: "#16a34a", bg: "#f0fdf4", accent: "#22c55e" },
    { label: "CRITICAL",     value: alertStats.critical, color: "#7c3aed", bg: "#faf5ff", accent: "#a855f7" },
  ];

  return (
    <div className="panel" style={{ height: "100%" }}>
      <div className="panel-header" style={{ marginBottom: 16 }}>
        <div>
          <span className="eyebrow">Live Alert Data</span>
          <h2>Alert Statistics</h2>
        </div>
        {loading && <div className="spinner" style={{ width: 16, height: 16 }} />}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {rows.map((row) => (
          <div key={row.label} style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "12px 16px", borderRadius: 10,
            background: row.bg, border: `1px solid ${row.accent}22`,
          }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#4f5a6c" }}>
              {row.label}
            </span>
            <strong style={{ fontSize: 22, color: row.color, letterSpacing: "-0.04em" }}>
              {(row.value ?? 0).toString().padStart(2, "0")}
            </strong>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Step 6: Alerts Over Time Frequency Component ─────────────────────────────

function AlertsOverTimePanel({ frequencyData, totalAlerts, loading }) {
  return (
    <div className="panel" style={{ height: "100%" }}>
      <div className="panel-header" style={{ marginBottom: 16 }}>
        <div>
          <span className="eyebrow">Historical Insight</span>
          <h2>Alerts Over Time</h2>
        </div>
        <span className="updated-label">
          {loading ? "Loading..." : `${totalAlerts} Total Alerts`}
        </span>
      </div>

      {loading ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 180, gap: 8 }}>
          <div className="spinner" />
          <span style={{ color: "#64748b", fontSize: 13 }}>Loading chart data...</span>
        </div>
      ) : frequencyData.length === 0 ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 180, gap: 8, color: "#94a3b8" }}>
          <span style={{ fontSize: 28 }}>📊</span>
          <span style={{ fontSize: 13 }}>No alert history available yet.</span>
        </div>
      ) : (
        <div style={{ height: 210, width: "100%" }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={frequencyData} margin={{ top: 8, right: 12, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#94a3b8" }} />
              <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#94a3b8" }} allowDecimals={false} />
              <Tooltip content={<AlertChartTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: 4 }} />
              <Bar dataKey="high"   name="High"   fill="#ef4444" radius={[4, 4, 0, 0]} stackId="a" />
              <Bar dataKey="medium" name="Medium" fill="#f59e0b" radius={[4, 4, 0, 0]} stackId="a" />
              <Bar dataKey="low"    name="Low"    fill="#10b981" radius={[4, 4, 0, 0]} stackId="a" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// ── Sensor Overview Mini-Cards ───────────────────────────────────────────────

function SensorOverviewPanel({ telemetryBySensor, sensorIds, apiSensors, loadingApiSensors }) {
  return (
    <div className="panel" style={{ height: "100%" }}>
      <div className="panel-header" style={{ marginBottom: 16 }}>
        <div>
          <span className="eyebrow">Fleet Status</span>
          <h2>Sensor Overview</h2>
        </div>
        {loadingApiSensors && <div className="spinner" style={{ width: 16, height: 16 }} />}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {sensorIds.map((sensorId) => {
          const live = telemetryBySensor[sensorId];
          const api = apiSensors.find((s) => s.sensorId === sensorId);
          // Prefer live data; fall back to API averages
          const t = live || null;
          const avgTemp = api?.avgTemperature ?? api?.averages?.temperature;
          const avgPsi  = api?.avgPressure ?? api?.averages?.pressure;
          const avgHum  = api?.avgHumidity ?? api?.averages?.humidity;
          const avgRpm  = api?.avgRpm ?? api?.averages?.rpm;

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
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                {[
                  { icon: "🌡️", label: "Temp",     val: t?.temperature ?? avgTemp, unit: "°C" },
                  { icon: "◉",  label: "Pressure", val: t?.pressure    ?? avgPsi,  unit: " PSI" },
                  { icon: "💧", label: "Humidity", val: t?.humidity    ?? avgHum,  unit: "%" },
                  { icon: "⚙️", label: "RPM",      val: t?.rpm         ?? avgRpm,  unit: "" },
                ].map(({ icon, label, val, unit }) => (
                  <div key={label} style={{ fontSize: 11, color: "#64748b" }}>
                    {icon} <strong style={{ color: "#172033" }}>
                      {val != null ? (typeof val === "number" ? val.toFixed(1) : val) : "–"}{unit}
                    </strong> {label}
                  </div>
                ))}
              </div>
              {api?.totalReadings != null && (
                <div style={{ marginTop: 6, fontSize: 10, color: "#94a3b8" }}>
                  {api.totalReadings.toLocaleString()} readings recorded
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main Analytics Page ──────────────────────────────────────────────────────

export default function Analytics() {
  const { alerts, loading: alertsLoading, error: alertsError } = useAlerts();
  const {
    historyBySensor,
    telemetryBySensor,
    sensorIds,
    connectionStatus,
  } = useTelemetry();

  // Metric selector state (default 'temperature')
  const [selectedMetric, setSelectedMetric] = useState("temperature");

  // Sensor filter state
  const [sensorFilter, setSensorFilter] = useState("All");

  // Time range state
  const [timeRange, setTimeRange] = useState("24h");

  // Backend analytics data
  const [apiTelemetry, setApiTelemetry]       = useState([]);
  const [apiAlertStats, setApiAlertStats]     = useState({ total: 0, high: 0, medium: 0, low: 0, critical: 0 });
  const [apiFrequency, setApiFrequency]       = useState([]);
  const [apiSensors, setApiSensors]           = useState([]);
  const [loadingTelemetry, setLoadingTelemetry] = useState(false);
  const [loadingAlertData, setLoadingAlertData] = useState(false);
  const [loadingApiSensors, setLoadingApiSensors] = useState(false);
  const [totalAlertsCount, setTotalAlertsCount] = useState(0);

  // Fetch historical telemetry from backend when time range / sensor changes
  useEffect(() => {
    let cancelled = false;
    async function fetchTelemetry() {
      setLoadingTelemetry(true);
      try {
        const params = { timeRange, limit: 500 };
        if (sensorFilter !== "All") params.sensorId = sensorFilter;
        const res = await getAnalyticsTelemetry(params);
        if (!cancelled) {
          const data = res.data?.data ?? [];
          const formatted = data.map((item) => ({
            ...item,
            time: item.timestamp
              ? new Date(item.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })
              : "",
          }));
          setApiTelemetry(formatted);
        }
      } catch {
        // silently fall back to live WebSocket data
      } finally {
        if (!cancelled) setLoadingTelemetry(false);
      }
    }
    fetchTelemetry();
    return () => { cancelled = true; };
  }, [sensorFilter, timeRange]);

  // Fetch alert analytics (stats + frequency)
  useEffect(() => {
    let cancelled = false;
    async function fetchAlertData() {
      setLoadingAlertData(true);
      try {
        const params = { days: timeRange === "30d" ? 30 : timeRange === "7d" ? 7 : 1 };
        if (sensorFilter !== "All") params.sensorId = sensorFilter;
        const res = await getAnalyticsAlerts(params);
        if (!cancelled) {
          const d = res.data;
          setApiAlertStats({
            total:    d.total    ?? d.stats?.total    ?? 0,
            high:     d.high     ?? d.stats?.high     ?? 0,
            medium:   d.medium   ?? d.stats?.medium   ?? 0,
            low:      d.low      ?? d.stats?.low      ?? 0,
            critical: d.critical ?? d.stats?.critical ?? 0,
          });
          setTotalAlertsCount(d.total ?? d.stats?.total ?? 0);
          // Frequency chart
          const freq = d.frequencyOverTime ?? d.frequency ?? [];
          setApiFrequency(freq.map((b) => ({
            label:  b.label  ?? b.date ?? b._id ?? "",
            high:   b.high   ?? 0,
            medium: b.medium ?? 0,
            low:    b.low    ?? 0,
          })));
        }
      } catch {
        // fall back to alerts from AlertContext
      } finally {
        if (!cancelled) setLoadingAlertData(false);
      }
    }
    fetchAlertData();
  }, [sensorFilter, timeRange]);

  // Fetch sensor fleet averages
  useEffect(() => {
    let cancelled = false;
    async function fetchSensors() {
      setLoadingApiSensors(true);
      try {
        const res = await getAnalyticsSensors();
        if (!cancelled) {
          setApiSensors(res.data?.sensors ?? []);
        }
      } catch { /* non-critical */ } finally {
        if (!cancelled) setLoadingApiSensors(false);
      }
    }
    fetchSensors();
  }, []);

  // Merge: prefer backend historical data for longer time ranges; live WebSocket for 1h
  const filteredHistory = useMemo(() => {
    // For 1h range, use live WebSocket buffer (most up-to-date)
    if (timeRange === "1h" && Object.keys(historyBySensor).length > 0) {
      const range = TIME_RANGES.find((r) => r.value === timeRange);
      const cutoff = Date.now() - (range?.ms ?? 3600000);

      const source = sensorFilter === "All"
        ? Object.values(historyBySensor).flat()
        : (historyBySensor[sensorFilter] || []);

      return [...source]
        .sort((a, b) => new Date(a.timestamp || 0) - new Date(b.timestamp || 0))
        .filter((p) => {
          if (!p.timestamp) return true;
          return new Date(p.timestamp).getTime() >= cutoff;
        });
    }

    // For 24h / 7d / 30d — use backend API data
    return apiTelemetry;
  }, [historyBySensor, apiTelemetry, sensorFilter, timeRange]);

  // Alert stats: use backend data if available, else compute from AlertContext
  const alertStats = useMemo(() => {
    if (apiAlertStats.total > 0 || loadingAlertData === false) {
      return apiAlertStats;
    }
    // Fallback: compute from AlertContext
    const filtered = sensorFilter === "All" ? alerts : alerts.filter((a) => a.sensorId === sensorFilter);
    return {
      total:    filtered.length,
      high:     filtered.filter((a) => ["HIGH", "CRITICAL"].includes((a.severity || "").toUpperCase())).length,
      medium:   filtered.filter((a) => (a.severity || "").toUpperCase() === "MEDIUM").length,
      low:      filtered.filter((a) => ["LOW", "INFO"].includes((a.severity || "").toUpperCase())).length,
      critical: filtered.filter((a) => (a.severity || "").toUpperCase() === "CRITICAL").length,
    };
  }, [apiAlertStats, alerts, sensorFilter, loadingAlertData]);

  // Frequency chart: use API data if available, else compute from AlertContext
  const frequencyData = useMemo(() => {
    if (apiFrequency.length > 0) return apiFrequency;
    // Fallback: compute from AlertContext alerts
    const filtered = sensorFilter === "All" ? alerts : alerts.filter((a) => a.sensorId === sensorFilter);
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const buckets = {};
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = `${days[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`;
      buckets[key] = { label: days[d.getDay()], high: 0, medium: 0, low: 0 };
    }
    filtered.forEach((alert) => {
      const alertDate = new Date(alert.timestamp || alert.createdAt || Date.now());
      if (isNaN(alertDate.getTime())) return;
      const key = `${days[alertDate.getDay()]} ${alertDate.getDate()}/${alertDate.getMonth() + 1}`;
      if (!buckets[key]) buckets[key] = { label: days[alertDate.getDay()], high: 0, medium: 0, low: 0 };
      const sev = (alert.severity || "HIGH").toUpperCase();
      if (sev === "HIGH" || sev === "CRITICAL") buckets[key].high += 1;
      else if (sev === "MEDIUM") buckets[key].medium += 1;
      else buckets[key].low += 1;
    });
    return Object.values(buckets);
  }, [apiFrequency, alerts, sensorFilter]);

  const sensorOptions = ["All", ...sensorIds];
  const hasData = filteredHistory.length > 0;
  const isLoading = loadingTelemetry && filteredHistory.length === 0;
  const currentMetricConfig = selectedMetric !== "all" ? METRIC_CONFIG[selectedMetric] : null;

  return (
    <div className="analytics-page">

      {/* ── HEADER & CONTROLS ── */}
      <div className="analytics-header">
        <div>
          <span className="eyebrow">Telemetry & Alert Analytics</span>
          <h1 style={{ margin: "6px 0 4px", fontSize: "clamp(22px, 2.5vw, 30px)", letterSpacing: "-0.03em" }}>
            Analytics
          </h1>
          <p style={{ margin: 0, color: "#778296", fontSize: 13 }}>
            Historical telemetry trends, multi-metric monitoring, and alert frequency insights.
          </p>
        </div>

        {/* Filter Bar */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>

          {/* Metric Selector */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <label style={{ fontSize: 11, color: "#64748b", fontWeight: 700 }}>Metric:</label>
            <select
              className="range-select analytics-select"
              value={selectedMetric}
              onChange={(e) => setSelectedMetric(e.target.value)}
              aria-label="Metric Selector"
            >
              {METRIC_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Sensor Selector */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <label style={{ fontSize: 11, color: "#64748b", fontWeight: 700 }}>Sensor:</label>
            <select
              className="range-select analytics-select"
              value={sensorFilter}
              onChange={(e) => setSensorFilter(e.target.value)}
              aria-label="Sensor Filter"
            >
              {sensorOptions.map((id) => (
                <option key={id} value={id}>{id === "All" ? "All Sensors" : id}</option>
              ))}
            </select>
          </div>

          {/* Time Range Selector */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <label style={{ fontSize: 11, color: "#64748b", fontWeight: 700 }}>Time Range:</label>
            <select
              className="range-select analytics-select"
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value)}
              aria-label="Time Range"
            >
              {TIME_RANGES.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>

        </div>
      </div>

      {/* ── Metric Tab Pills ── */}
      <div className="analytics-metric-tabs">
        {METRIC_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={`analytics-tab-btn ${selectedMetric === opt.value ? "active" : ""}`}
            onClick={() => setSelectedMetric(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* ── PRIMARY TELEMETRY TREND CHART ── */}
      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-header">
          <div>
            <span className="eyebrow">
              {timeRange === "1h" ? "Real-Time Telemetry Stream" : "Historical Telemetry — " + TIME_RANGES.find(r => r.value === timeRange)?.label}
            </span>
            <h2>
              {selectedMetric === "all"
                ? "Combined Telemetry Trends (Temperature, Pressure, Humidity, RPM)"
                : `${currentMetricConfig.label} Trend (${currentMetricConfig.unit})`}
              {sensorFilter !== "All" ? ` — ${sensorFilter}` : " — All Sensors"}
            </h2>
          </div>
          <span className="updated-label">
            {isLoading ? "Loading..." : hasData ? `${filteredHistory.length} Data Points` : "Waiting for Telemetry"}
          </span>
        </div>

        {isLoading && (
          <div className="analytics-state-box">
            <div className="spinner" />
            <span>Loading telemetry data from backend...</span>
          </div>
        )}

        {!isLoading && !hasData && (
          <div className="analytics-state-box">
            <span style={{ fontSize: 28 }}>📊</span>
            <strong>No telemetry data available for this selection.</strong>
            <span style={{ fontSize: 12, color: "#94a3b8" }}>
              Try selecting a wider time range or check if the sensor simulator is running.
            </span>
          </div>
        )}

        {hasData && (
          <div className="chart-wrap" style={{ height: 320, width: "100%" }}>
            <ResponsiveContainer width="100%" height="100%">
              {selectedMetric === "all" ? (
                <LineChart data={filteredHistory} margin={{ top: 12, right: 16, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="time" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#94a3b8" }} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#94a3b8" }} />
                  <Tooltip content={<TelemetryTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                  <Line type="monotone" dataKey="temperature" name="Temperature (°C)" stroke="#7c3aed" strokeWidth={3} dot={false} connectNulls />
                  <Line type="monotone" dataKey="pressure"    name="Pressure (PSI)"   stroke="#0ea5e9" strokeWidth={2} dot={false} connectNulls />
                  <Line type="monotone" dataKey="humidity"    name="Humidity (%)"     stroke="#14b8a6" strokeWidth={2} dot={false} connectNulls />
                  <Line type="monotone" dataKey="rpm"         name="RPM"              stroke="#f97316" strokeWidth={2} dot={false} connectNulls />
                </LineChart>
              ) : (
                <AreaChart data={filteredHistory} margin={{ top: 12, right: 16, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id={currentMetricConfig.gradientId} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={currentMetricConfig.color} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={currentMetricConfig.color} stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="time" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#94a3b8" }} />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: "#94a3b8" }}
                    domain={currentMetricConfig.domain}
                  />
                  <Tooltip content={<TelemetryTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                  <Area
                    type="monotone"
                    dataKey={currentMetricConfig.key}
                    name={`${currentMetricConfig.label} (${currentMetricConfig.unit})`}
                    stroke={currentMetricConfig.color}
                    strokeWidth={currentMetricConfig.strokeWidth}
                    fill={`url(#${currentMetricConfig.gradientId})`}
                    dot={false}
                    connectNulls
                    activeDot={{ r: 5 }}
                  />
                </AreaChart>
              )}
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* ── BOTTOM GRID: Alert Stats, Alerts Over Time, Sensor Overview ── */}
      <div className="analytics-bottom-grid" style={{ gridTemplateColumns: "1fr 1.2fr 1fr" }}>

        {/* Alert Statistics */}
        {alertsError ? (
          <div className="analytics-state-box analytics-state-error">
            <span style={{ fontSize: 22 }}>⚠️</span>
            <strong>Unable to load alert statistics.</strong>
            <span style={{ fontSize: 12 }}>Please check backend connection.</span>
          </div>
        ) : (
          <AlertStatsPanel alertStats={alertStats} loading={alertsLoading || loadingAlertData} />
        )}

        {/* Alerts Over Time */}
        <AlertsOverTimePanel
          frequencyData={frequencyData}
          totalAlerts={totalAlertsCount || alerts.length}
          loading={loadingAlertData}
        />

        {/* Sensor Fleet Overview */}
        <SensorOverviewPanel
          telemetryBySensor={telemetryBySensor}
          sensorIds={sensorIds}
          apiSensors={apiSensors}
          loadingApiSensors={loadingApiSensors}
        />
      </div>

    </div>
  );
}
