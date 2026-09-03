/**
 * Dashboard.jsx — NexusFlow Real-Time Operational Dashboard
 *
 * Implements:
 * - Step 1: Unified live telemetry & alert state consumption.
 * - Step 2: Dynamic Multi-Sensor Selector (TURBINE-001, TURBINE-002, TURBINE-003...).
 * - Step 3: Strict per-sensor isolation (no data mixing between turbines).
 * - Step 4: High-performance rolling chart rendering.
 * - Step 5: Comprehensive latest readings section (Temperature, Pressure, RPM, Humidity).
 * - Step 6 & 7: Real-time alerts connected to AlertContext & RecentAlerts component.
 * - Step 8: Contextual empty & loading states ("Waiting for telemetry...").
 * - Step 9: Real-time WebSocket connection status badge and reconnect banners.
 * - Step 10: Alert navigation to /alerts with automatic detail selection.
 */

import React, { useEffect, useState } from "react";
import { useTelemetry } from "../context/TelemetryContext";
import { useAuth } from "../context/AuthContext";
import { useAlerts } from "../context/AlertContext";

import SensorCard from "../components/SensorCard";
import TelemetryChart from "../components/TelemetryChart";
import RPMChart from "../components/RPMChart";
import RecentAlerts from "../components/RecentAlerts";
import { getRuntimePipelineStatusRequest, getAlertStatsRequest } from "../services/api";

const getRuntimePipelineStatus = getRuntimePipelineStatusRequest;

export default function Dashboard() {
  const { user } = useAuth();
  const { unreadCount, alerts } = useAlerts();

  const {
    sensors,
    history,
    sensorIds,
    activeSensorId,
    setActiveSensorId,
    latestTelemetry,
    connectionStatus,
    connectionError,
    isPaused,
    togglePause,
  } = useTelemetry();

  // ── Active Rule Pipelines — live count from ruleRuntime registry ──────────
  const [activePipelines, setActivePipelines] = useState(null);
  const [totalAlerts, setTotalAlerts]         = useState(null);

  useEffect(() => {
    let cancelled = false;

    const fetchPipelineCount = async () => {
      try {
        const { data } = await getRuntimePipelineStatus();
        if (!cancelled && data?.success) {
          setActivePipelines(data.running ?? 0);
        }
      } catch {
        // keep previous value if backend unreachable
      }
    };

    const fetchAlertStats = async () => {
      try {
        const { data } = await getAlertStatsRequest();
        if (!cancelled && data?.stats) {
          setTotalAlerts(data.stats.total ?? 0);
        }
      } catch { /* non-critical */ }
    };

    fetchPipelineCount();
    fetchAlertStats();
    const interval = setInterval(() => {
      fetchPipelineCount();
      fetchAlertStats();
    }, 30_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  const statusText = {
    connected: isPaused ? "Paused" : "Live",
    reconnecting: "Reconnecting...",
    disconnected: "Connection lost",
  };

  const formattedUpdatedTime = latestTelemetry?.formattedTime || "Waiting for data...";

  return (
    <div className="dashboard">
      {/* ── HERO SECTION ── */}
      <section className="hero">
        <div>
          <span className="eyebrow">Factory Operations</span>
          <h1>Hello, {user?.name || "Operations Team"}</h1>
          <p>
            Real-time industrial turbine telemetry, condition-based rule monitoring, and alerts.
          </p>
        </div>

        {/* CONNECTION STATUS & STREAM CONTROLS (Step 9) */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={togglePause}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "7px 14px",
              borderRadius: "8px",
              fontSize: "12px",
              fontWeight: "600",
              cursor: "pointer",
              border: isPaused ? "1px solid #f59e0b" : "1px solid #e2e8f0",
              backgroundColor: isPaused ? "#fef3c7" : "#fff",
              color: isPaused ? "#b45309" : "#475569",
              transition: "all 0.2s ease",
            }}
            title={isPaused ? "Resume live data streaming" : "Pause live chart animations"}
          >
            <span>{isPaused ? "▶ Resume Stream" : "⏸ Pause Stream"}</span>
          </button>

          <div className={`live-badge ${isPaused ? "reconnecting" : connectionStatus}`}>
            <span
              className={
                connectionStatus === "connected" && !isPaused
                  ? "live-dot"
                  : "offline-dot"
              }
            />
            {statusText[connectionStatus] || "Offline"}
          </div>
        </div>
      </section>

      {/* ── CONNECTION LOSS BANNER (Step 9) ── */}
      {connectionStatus === "disconnected" && (
        <div
          className="connection-warning"
          style={{
            backgroundColor: "#fef2f2",
            color: "#991b1b",
            border: "1px solid #fecaca",
            padding: "12px 18px",
            borderRadius: "10px",
            margin: "0 0 20px 0",
            fontSize: "13px",
            display: "flex",
            alignItems: "center",
            gap: "10px",
          }}
        >
          <span style={{ fontSize: "18px" }}>⚠️</span>
          <div>
            <strong>Live connection lost. Attempting to reconnect...</strong>
            <div style={{ fontSize: "12px", color: "#b91c1c", marginTop: "2px" }}>
              Showing latest cached telemetry for {activeSensorId}. Chart updates will resume automatically.
            </div>
          </div>
        </div>
      )}

      {connectionError && connectionStatus !== "disconnected" && (
        <div className="connection-warning" style={{ margin: "0 0 20px 0" }}>
          ⚠️ {connectionError}. Showing the latest available data.
        </div>
      )}

      {/* ── STAT SUMMARY CARDS ── */}
      <section className="stat-grid">
        <div className="stat-card">
          <span className="stat-icon">◉</span>
          <div>
            <small>Monitored Turbines</small>
            <strong>{sensorIds.length}</strong>
          </div>
          <span className="stat-trend">{activeSensorId} Active</span>
        </div>

        <div className="stat-card">
          <span className="stat-icon">⌘</span>
          <div>
            <small>Active Rule Pipelines</small>
            <strong>
              {activePipelines === null ? "–" : activePipelines}
            </strong>
          </div>
          <span
            className="stat-trend"
            style={{ color: activePipelines > 0 ? "#16a34a" : "#64748b" }}
          >
            {activePipelines === null
              ? "Loading..."
              : activePipelines === 0
              ? "No active rules"
              : `${activePipelines} Running`}
          </span>
        </div>

        <div className="stat-card">
          <span className="stat-icon alert-icon">!</span>
          <div>
            <small>Total Alerts</small>
            <strong>{totalAlerts === null ? "–" : totalAlerts.toString().padStart(2, "0")}</strong>
          </div>
          <span className={`stat-trend ${unreadCount > 0 ? "warning-text" : ""}`}>
            {totalAlerts === null ? "Loading..." : unreadCount > 0 ? `${unreadCount} Unread` : "All reviewed"}
          </span>
        </div>
      </section>

      {/* ── SENSOR OVERVIEW & MULTI-SENSOR SELECTOR (Step 2 & 5) ── */}
      <section className="section-heading">
        <div>
          <span className="eyebrow">Live Telemetry</span>
          <h2>Sensor Overview — {activeSensorId}</h2>
        </div>

        {/* Step 2: Multi-Sensor Selector */}
        <div className="sensor-selector-wrap" style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ fontSize: "12px", color: "#64748b", fontWeight: "600" }}>
            Updated: <strong style={{ color: "#0f172a" }}>{formattedUpdatedTime}</strong>
          </span>

          <label htmlFor="sensor-select" style={{ fontWeight: "600", fontSize: "12px", color: "#475569" }}>
            Turbine:
          </label>

          <select
            id="sensor-select"
            className="range-select"
            value={activeSensorId}
            onChange={(e) => setActiveSensorId(e.target.value)}
            style={{
              padding: "6px 12px",
              borderRadius: "8px",
              border: "1px solid #cbd5e1",
              backgroundColor: "#fff",
              fontWeight: "700",
              color: "#1e293b",
              cursor: "pointer",
            }}
          >
            {sensorIds.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </div>
      </section>

      {/* ── STEP 5: SENSOR READINGS GRID ── */}
      <section className="sensor-grid">
        {sensors.map((sensor) => (
          <SensorCard key={sensor.id} {...sensor} />
        ))}
      </section>

      {/* ── ROW 1: TELEMETRY TRENDS CHART + RECENT ALERTS (Step 4, 6, 7) ── */}
      <section className="dashboard-grid" style={{ marginTop: "24px" }}>
        <div className="panel">
          <div className="panel-header">
            <div>
              <span className="eyebrow">Socket.IO Live Stream</span>
              <h2>{activeSensorId} Telemetry Trends</h2>
            </div>
            <span className="updated-label">
              {history.length > 0 ? `${history.length} Data points` : "Waiting..."}
            </span>
          </div>

          <TelemetryChart data={history} isPaused={isPaused} />
        </div>

        {/* Step 6, 7, 10: Real-time Recent Alerts with Direct Navigation */}
        <RecentAlerts />
      </section>

      {/* ── ROW 2: ENGINE RPM METRICS CHART ── */}
      <section className="dashboard-grid" style={{ marginTop: "20px" }}>
        <div className="panel">
          <div className="panel-header">
            <div>
              <span className="eyebrow">Engine Dynamics</span>
              <h2>{activeSensorId} RPM Trend</h2>
            </div>
            <span className="updated-label">Real-time RPM</span>
          </div>

          <RPMChart data={history} isPaused={isPaused} />
        </div>

        {/* SYSTEM HEALTH BOX */}
        <div className="panel">
          <div className="panel-header" style={{ marginBottom: "14px" }}>
            <div>
              <span className="eyebrow">System Status</span>
              <h2>System Health</h2>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {/* WebSocket Connection */}
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "10px 12px",
              borderRadius: "8px",
              background: connectionStatus === "connected" ? "#f0fdf4" : "#fef2f2",
              border: `1px solid ${connectionStatus === "connected" ? "#bbf7d0" : "#fecaca"}`,
            }}>
              <span style={{ fontSize: "13px", fontWeight: "600", color: "#4f5a6c" }}>
                WebSocket Connection
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{
                  fontSize: "16px",
                  color: connectionStatus === "connected" ? "#16a34a" : "#dc2626",
                }}>
                  {connectionStatus === "connected" ? "●" : "○"}
                </span>
                <strong style={{
                  fontSize: "12px",
                  color: connectionStatus === "connected" ? "#15803d" : "#b91c1c",
                }}>
                  {connectionStatus === "connected" ? "Connected" : connectionStatus === "reconnecting" ? "Reconnecting" : "Disconnected"}
                </strong>
              </div>
            </div>

            {/* Active Sensors */}
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "10px 12px",
              borderRadius: "8px",
              background: sensorIds.length > 0 ? "#eff6ff" : "#f8fafc",
              border: `1px solid ${sensorIds.length > 0 ? "#bfdbfe" : "#e2e8f0"}`,
            }}>
              <span style={{ fontSize: "13px", fontWeight: "600", color: "#4f5a6c" }}>
                Active Sensors
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <strong style={{
                  fontSize: "18px",
                  color: sensorIds.length > 0 ? "#2563eb" : "#64748b",
                  letterSpacing: "-0.02em",
                }}>
                  {sensorIds.length}
                </strong>
                <span style={{ fontSize: "11px", color: "#64748b" }}>
                  / {sensorIds.length} online
                </span>
              </div>
            </div>

            {/* Rule Engine */}
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "10px 12px",
              borderRadius: "8px",
              background: activePipelines > 0 ? "#f0fdf4" : "#f8fafc",
              border: `1px solid ${activePipelines > 0 ? "#bbf7d0" : "#e2e8f0"}`,
            }}>
              <span style={{ fontSize: "13px", fontWeight: "600", color: "#4f5a6c" }}>
                Rule Engine
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{
                  fontSize: "16px",
                  color: activePipelines > 0 ? "#16a34a" : "#94a3b8",
                }}>
                  {activePipelines > 0 ? "●" : "○"}
                </span>
                <strong style={{
                  fontSize: "12px",
                  color: activePipelines > 0 ? "#15803d" : "#64748b",
                }}>
                  {activePipelines === null ? "Loading..." : activePipelines === 0 ? "Idle" : `${activePipelines} Active`}
                </strong>
              </div>
            </div>

            {/* Alert Status */}
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "10px 12px",
              borderRadius: "8px",
              background: unreadCount > 0 ? "#fef3c7" : "#f0fdf4",
              border: `1px solid ${unreadCount > 0 ? "#fde68a" : "#bbf7d0"}`,
            }}>
              <span style={{ fontSize: "13px", fontWeight: "600", color: "#4f5a6c" }}>
                Alert Status
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{
                  fontSize: "16px",
                  color: unreadCount > 0 ? "#f59e0b" : "#16a34a",
                }}>
                  {unreadCount > 0 ? "⚠" : "✓"}
                </span>
                <strong style={{
                  fontSize: "12px",
                  color: unreadCount > 0 ? "#b45309" : "#15803d",
                }}>
                  {unreadCount === 0 ? "All Clear" : `${unreadCount} Unread`}
                </strong>
              </div>
            </div>

            {/* Telemetry Stream */}
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "10px 12px",
              borderRadius: "8px",
              background: isPaused ? "#fef3c7" : latestTelemetry ? "#f0fdf4" : "#f8fafc",
              border: `1px solid ${isPaused ? "#fde68a" : latestTelemetry ? "#bbf7d0" : "#e2e8f0"}`,
            }}>
              <span style={{ fontSize: "13px", fontWeight: "600", color: "#4f5a6c" }}>
                Telemetry Stream
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{
                  fontSize: "16px",
                  color: isPaused ? "#f59e0b" : latestTelemetry ? "#16a34a" : "#94a3b8",
                }}>
                  {isPaused ? "⏸" : latestTelemetry ? "●" : "○"}
                </span>
                <strong style={{
                  fontSize: "12px",
                  color: isPaused ? "#b45309" : latestTelemetry ? "#15803d" : "#64748b",
                }}>
                  {isPaused ? "Paused" : latestTelemetry ? "Streaming" : "Waiting"}
                </strong>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}