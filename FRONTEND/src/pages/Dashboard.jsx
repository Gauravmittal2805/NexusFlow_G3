import { useTelemetry } from "../context/TelemetryContext";
import { useAuth } from "../context/AuthContext";

import SensorCard from "../components/SensorCard";
import TelemetryChart from "../components/TelemetryChart";
import RPMChart from "../components/RPMChart";
import RecentAlerts from "../components/RecentAlerts";

export default function Dashboard() {
  const { user } = useAuth();

  const {
    sensors,
    history,
    sensorIds,
    activeSensorId,
    setActiveSensorId,
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

  return (
    <div className="dashboard">

      {/* HERO */}
      <section className="hero">

        <div>
          <span className="eyebrow">
            Factory Operations
          </span>

          <h1>
            Hello, {user?.name || "User"}
          </h1>

        </div>

        {/* CONNECTION STATUS & LIVE / PAUSE CONTROLS (Step 10 & Step 12) */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <button
            type="button"
            onClick={togglePause}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "6px 12px",
              borderRadius: "8px",
              fontSize: "12px",
              fontWeight: "600",
              cursor: "pointer",
              border: isPaused ? "1px solid #f59e0b" : "1px solid #e2e8f0",
              backgroundColor: isPaused ? "#fef3c7" : "#fff",
              color: isPaused ? "#b45309" : "#475569",
              transition: "all 0.2s ease",
            }}
          >
            <span>{isPaused ? "▶ Resume" : "⏸ Pause Stream"}</span>
          </button>

          <div
            className={`live-badge ${isPaused ? "reconnecting" : connectionStatus}`}
          >
            <span
              className={
                connectionStatus === "connected" && !isPaused
                  ? "live-dot"
                  : "offline-dot"
              }
            />

            {statusText[connectionStatus]}
          </div>
        </div>

      </section>


      {/* CONNECTION WARNING (Step 12) */}
      {connectionStatus === "disconnected" && (
        <div className="connection-warning" style={{ backgroundColor: "#fef2f2", color: "#991b1b", border: "1px solid #fecaca", padding: "10px 16px", borderRadius: "8px", margin: "12px 0", fontSize: "13px" }}>
          ⚠️ <strong>Connection lost. Waiting for reconnection...</strong>
          <br />
          Showing latest available cached telemetry history.
        </div>
      )}

      {connectionError && connectionStatus !== "disconnected" && (
        <div className="connection-warning">
          ⚠️ {connectionError}
          <br />
          Showing the latest available data.
        </div>
      )}


      {/* STAT CARDS */}
      <section className="stat-grid">

        <div className="stat-card">
          <span className="stat-icon">
            ◉
          </span>

          <div>
            <small>Total Sensors</small>
            <strong>24</strong>
          </div>

          <span className="stat-trend">
            +2 this week
          </span>
        </div>


        <div className="stat-card">

          <span className="stat-icon">
            ⌘
          </span>

          <div>
            <small>Active Rules</small>
            <strong>18</strong>
          </div>

          <span className="stat-trend">
            All healthy
          </span>

        </div>


        <div className="stat-card">

          <span className="stat-icon alert-icon">
            !
          </span>

          <div>
            <small>Alerts Today</small>
            <strong>03</strong>
          </div>

          <span className="stat-trend warning-text">
            Needs review
          </span>

        </div>

      </section>


      {/* SENSOR HEADER */}
      <section className="section-heading">

        <div>
          <span className="eyebrow">
            Live Telemetry
          </span>

          <h2>
            Sensor Overview
          </h2>
        </div>


        {/* MULTIPLE SENSOR SUPPORT */}
        <div className="sensor-selector-wrap">

          <label htmlFor="sensor-select">
            Sensor
          </label>

          <select
            id="sensor-select"
            className="range-select"
            value={activeSensorId}
            onChange={(event) =>
              setActiveSensorId(
                event.target.value
              )
            }
          >

            {sensorIds.map((sensorId) => (
              <option
                key={sensorId}
                value={sensorId}
              >
                {sensorId}
              </option>
            ))}

          </select>

        </div>

      </section>


      {/* LIVE SENSOR CARDS */}
      <section className="sensor-grid">

        {sensors.map((sensor) => (
          <SensorCard
            key={sensor.id}
            {...sensor}
          />
        ))}

      </section>


      {/* CHART + ALERTS — row 1: Telemetry Trends | Recent Alerts */}
      <section className="dashboard-grid">

        <div className="panel">

          <div className="panel-header">

            <div>

              <span className="eyebrow">
                Socket.IO Stream
              </span>

              <h2>
                {activeSensorId}
                {" "}
                Telemetry Trends
              </h2>

            </div>

            <span className="updated-label">
              Real-time
            </span>

          </div>


          <TelemetryChart
            data={history}
            isPaused={isPaused}
          />

        </div>


        <RecentAlerts />

      </section>


      {/* CHART ROW 2 — RPM Trend occupies the same left-column width as Telemetry Trends */}
      <section className="dashboard-grid">

        <div className="panel">

          <div className="panel-header">

            <div>
              <span className="eyebrow">
                Engine Metrics
              </span>

              <h2>
                {activeSensorId}
                {" "}
                RPM Trend
              </h2>
            </div>

            <span className="updated-label">
              Real-time
            </span>

          </div>

          <RPMChart data={history} isPaused={isPaused} />

        </div>

        {/* Empty right-column placeholder keeps the grid symmetric */}
        <div />

      </section>

    </div>
  );
}