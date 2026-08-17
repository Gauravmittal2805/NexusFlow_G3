import { useTelemetry } from "../context/TelemetryContext";
import { useAuth } from "../context/AuthContext";

import SensorCard from "../components/SensorCard";
import TelemetryChart from "../components/TelemetryChart";
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
  } = useTelemetry();

  const statusText = {
    connected: "Live",
    reconnecting: "Reconnecting...",
    disconnected: "Disconnected",
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

        {/* CONNECTION STATUS */}
        <div
          className={`live-badge ${connectionStatus}`}
        >
          <span
            className={
              connectionStatus === "connected"
                ? "live-dot"
                : "offline-dot"
            }
          />

          {statusText[connectionStatus]}
        </div>

      </section>


      {/* CONNECTION ERROR */}
      {connectionError && (
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


      {/* CHART + ALERTS */}
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
          />

        </div>


        <RecentAlerts />

      </section>

    </div>
  );
}