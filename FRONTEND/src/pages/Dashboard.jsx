import { useTelemetry } from "../context/TelemetryContext";
import SensorCard from "../components/SensorCard";
import TelemetryChart from "../components/TelemetryChart";
import RecentAlerts from "../components/RecentAlerts";

export default function Dashboard() {
  const { sensors, history, loading, connected } = useTelemetry();

  return (
    <div className="dashboard">
      <section className="hero">
        <div>
          <span className="eyebrow">Factory Operations</span>
          <h1>Hello, Admin</h1>
          {/* <p>
            Monitor machine telemetry and build dynamic rules without writing
            device-specific logic.
          </p> */}
        </div>

        <div className="live-badge">
          <span className={connected ? "live-dot" : "offline-dot"} />
          {connected ? "Live telemetry" : "Disconnected"}
        </div>
      </section>

      <section className="stat-grid">
        <div className="stat-card">
          <span className="stat-icon">◉</span>
          <div>
            <small>Total Sensors</small>
            <strong>24</strong>
          </div>
          <span className="stat-trend">+2 this week</span>
        </div>

        <div className="stat-card">
          <span className="stat-icon">⌘</span>
          <div>
            <small>Active Rules</small>
            <strong>18</strong>
          </div>
          <span className="stat-trend">All healthy</span>
        </div>

        <div className="stat-card">
          <span className="stat-icon alert-icon">!</span>
          <div>
            <small>Alerts Today</small>
            <strong>03</strong>
          </div>
          <span className="stat-trend warning-text">Needs review</span>
        </div>
      </section>

      <section className="section-heading">
        <div>
          <span className="eyebrow">Live telemetry</span>
          <h2>Sensor Overview</h2>
        </div>
        <span className="updated-label">Updates every 2 seconds</span>
      </section>

      {loading ? (
        <div className="loading-state">Loading telemetry...</div>
      ) : sensors.length ? (
        <section className="sensor-grid">
          {sensors.map((sensor) => (
            <SensorCard key={`${sensor.id}-${sensor.name}`} {...sensor} />
          ))}
        </section>
      ) : (
        <div className="empty-state large">No telemetry data available.</div>
      )}

      <section className="dashboard-grid">
        <div className="panel">
          <div className="panel-header">
            <div>
              <span className="eyebrow">Live stream</span>
              <h2>Telemetry Trends</h2>
            </div>
            <select className="range-select" defaultValue="1m">
              <option value="1m">Last 1 minute</option>
              <option value="5m">Last 5 minutes</option>
            </select>
          </div>
          <TelemetryChart data={history} />
        </div>

        <RecentAlerts />
      </section>
    </div>
  );
}