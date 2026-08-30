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

import React from "react";
import { useTelemetry } from "../context/TelemetryContext";
import { useAuth } from "../context/AuthContext";
import { useAlerts } from "../context/AlertContext";

import SensorCard from "../components/SensorCard";
import TelemetryChart from "../components/TelemetryChart";
import RPMChart from "../components/RPMChart";
import RecentAlerts from "../components/RecentAlerts";

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
            <strong>18</strong>
          </div>
          <span className="stat-trend" style={{ color: "#16a34a" }}>All Healthy</span>
        </div>

        <div className="stat-card">
          <span className="stat-icon alert-icon">!</span>
          <div>
            <small>Unread Alerts</small>
            <strong>{unreadCount.toString().padStart(2, "0")}</strong>
          </div>
          <span className={`stat-trend ${unreadCount > 0 ? "warning-text" : ""}`}>
            {unreadCount > 0 ? `${unreadCount} Needs review` : "Zero unread"}
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

        {/* Right column empty balance placeholder */}
        <div />
      </section>
    </div>
  );
}