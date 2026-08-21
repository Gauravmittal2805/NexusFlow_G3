import React, { useState, useMemo } from "react";
import { mockSensors as initialSensors } from "../data/mockSensors";
import { useTelemetry } from "../context/TelemetryContext";

export default function Sensors() {
  const [sensorsList, setSensorsList] = useState(() => {
    try {
      const saved = localStorage.getItem("nexusflow_sensors_list");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.warn("Failed to read sensors from localStorage", e);
    }
    return initialSensors;
  });

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [selectedSensor, setSelectedSensor] = useState(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [toast, setToast] = useState(null);

  // Form State for Adding Sensor
  const [formData, setFormData] = useState({
    id: "",
    name: "",
    location: "",
    status: "Online",
    type: "General Sensor Unit"
  });
  const [formError, setFormError] = useState("");

  // Live telemetry from TelemetryContext (e.g. for TURBINE-001)
  const { sensors: liveTelemetryMap } = useTelemetry();

  const showToast = (type, message) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  // Helper to persist list in localStorage
  const saveSensorsToStorage = (updated) => {
    setSensorsList(updated);
    try {
      localStorage.setItem("nexusflow_sensors_list", JSON.stringify(updated));
    } catch (e) {
      console.error("Failed to save sensors to localStorage", e);
    }
  };

  // Filter and Search logic (Step 4 & Step 5)
  const filteredSensors = useMemo(() => {
    return sensorsList.filter((sensor) => {
      const matchesStatus =
        statusFilter === "All" ||
        sensor.status.toLowerCase() === statusFilter.toLowerCase();

      const term = searchTerm.trim().toLowerCase();
      const matchesSearch =
        !term ||
        sensor.id.toLowerCase().includes(term) ||
        sensor.name.toLowerCase().includes(term) ||
        sensor.location.toLowerCase().includes(term);

      return matchesStatus && matchesSearch;
    });
  }, [sensorsList, searchTerm, statusFilter]);

  // Counts for status filters
  const counts = useMemo(() => {
    return {
      all: sensorsList.length,
      online: sensorsList.filter((s) => s.status.toLowerCase() === "online").length,
      warning: sensorsList.filter((s) => s.status.toLowerCase() === "warning").length,
      offline: sensorsList.filter((s) => s.status.toLowerCase() === "offline").length
    };
  }, [sensorsList]);

  // Handle Add Sensor Submit (Step 7)
  const handleAddSensorSubmit = (e) => {
    e.preventDefault();
    setFormError("");

    const idClean = formData.id.trim().toUpperCase();
    const nameClean = formData.name.trim();
    const locationClean = formData.location.trim();

    if (!idClean) {
      setFormError("Sensor ID is required.");
      return;
    }
    if (!nameClean) {
      setFormError("Sensor Name is required.");
      return;
    }
    if (!locationClean) {
      setFormError("Location is required.");
      return;
    }

    // Check duplicate ID
    if (sensorsList.some((s) => s.id === idClean)) {
      setFormError(`Sensor with ID "${idClean}" already exists.`);
      return;
    }

    const newSensor = {
      id: idClean,
      name: nameClean,
      location: locationClean,
      status: formData.status,
      lastSeen: "Just added",
      type: formData.type || "General Sensor Unit",
      telemetry: {
        temperature: +(70 + Math.random() * 15).toFixed(1),
        pressure: +(110 + Math.random() * 15).toFixed(1),
        rpm: Math.round(1500 + Math.random() * 400),
        humidity: +(40 + Math.random() * 10).toFixed(1)
      }
    };

    const updated = [newSensor, ...sensorsList];
    saveSensorsToStorage(updated);
    setIsAddModalOpen(false);
    setFormData({ id: "", name: "", location: "", status: "Online", type: "General Sensor Unit" });
    showToast("success", `✅ Sensor "${newSensor.id}" registered successfully!`);
  };

  // Helper to get real-time or fallback telemetry for a sensor (Step 6)
  const getSensorTelemetry = (sensor) => {
    // If it is TURBINE-001 and live telemetry is active in context
    if (sensor.id === "TURBINE-001" && liveTelemetryMap) {
      const tempSensor = liveTelemetryMap.find((s) => s.name?.toLowerCase().includes("temp"));
      const pressureSensor = liveTelemetryMap.find((s) => s.name?.toLowerCase().includes("press"));
      const rpmSensor = liveTelemetryMap.find((s) => s.name?.toLowerCase().includes("rpm"));
      const humiditySensor = liveTelemetryMap.find((s) => s.name?.toLowerCase().includes("humid"));

      return {
        temperature: tempSensor?.value ?? sensor.telemetry?.temperature ?? 78.5,
        pressure: pressureSensor?.value ?? sensor.telemetry?.pressure ?? 120.0,
        rpm: rpmSensor?.value ?? sensor.telemetry?.rpm ?? 1800,
        humidity: humiditySensor?.value ?? sensor.telemetry?.humidity ?? 43.0
      };
    }

    return sensor.telemetry || {
      temperature: 75.0,
      pressure: 118.0,
      rpm: 1750,
      humidity: 42.0
    };
  };

  return (
    <div className="sensors-page">
      {/* Toast Notification Banner */}
      {toast && <div className={`sensors-toast-banner ${toast.type}`}>{toast.message}</div>}

      {/* ─── Page Header ─── */}
      <div className="sensors-header">
        <div>
          <h2>Sensor Management</h2>
          <p>Monitor status, live telemetry, and location for all registered industrial sensors</p>
        </div>

        <button className="btn-add-sensor" onClick={() => setIsAddModalOpen(true)}>
          + Add Sensor
        </button>
      </div>

      {/* ─── Metric Summary Stat Cards ─── */}
      <div className="sensor-stats-grid">
        <div className="stat-card" onClick={() => setStatusFilter("All")}>
          <div className="stat-icon total">◉</div>
          <div>
            <span className="stat-label">Total Sensors</span>
            <strong className="stat-value">{counts.all}</strong>
          </div>
        </div>

        <div className="stat-card" onClick={() => setStatusFilter("Online")}>
          <div className="stat-icon online">🟢</div>
          <div>
            <span className="stat-label">Online</span>
            <strong className="stat-value text-green">{counts.online}</strong>
          </div>
        </div>

        <div className="stat-card" onClick={() => setStatusFilter("Warning")}>
          <div className="stat-icon warning">🟡</div>
          <div>
            <span className="stat-label">Warning</span>
            <strong className="stat-value text-amber">{counts.warning}</strong>
          </div>
        </div>

        <div className="stat-card" onClick={() => setStatusFilter("Offline")}>
          <div className="stat-icon offline">⚪</div>
          <div>
            <span className="stat-label">Offline</span>
            <strong className="stat-value text-muted">{counts.offline}</strong>
          </div>
        </div>
      </div>

      {/* ─── Controls: Search & Filter Toolbar ─── */}
      <div className="sensors-controls-bar">
        <div className="search-input-wrapper">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            className="sensor-search-input"
            placeholder="Search sensors by ID, name, location..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          {searchTerm && (
            <button className="btn-clear-search" onClick={() => setSearchTerm("")}>
              ✕
            </button>
          )}
        </div>

        <div className="status-filter-group">
          {["All", "Online", "Warning", "Offline"].map((status) => {
            const countVal =
              status === "All"
                ? counts.all
                : status === "Online"
                ? counts.online
                : status === "Warning"
                ? counts.warning
                : counts.offline;

            return (
              <button
                key={status}
                type="button"
                className={`status-pill-btn ${statusFilter === status ? "active" : ""} ${status.toLowerCase()}`}
                onClick={() => setStatusFilter(status)}
              >
                <span>{status}</span>
                <span className="pill-count">{countVal}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ─── Sensor List Table ─── */}
      <div className="sensors-table-container">
        {filteredSensors.length === 0 ? (
          <div className="sensors-empty-state">
            <div className="empty-icon">🔍</div>
            <h3>No Sensors Found</h3>
            <p>
              {searchTerm || statusFilter !== "All"
                ? "No sensors match your search and filter criteria."
                : "No sensors have been registered yet."}
            </p>
            {(searchTerm || statusFilter !== "All") && (
              <button
                className="btn-reset-filters"
                onClick={() => {
                  setSearchTerm("");
                  setStatusFilter("All");
                }}
              >
                Reset Filters
              </button>
            )}
          </div>
        ) : (
          <table className="sensors-table">
            <thead>
              <tr>
                <th>Sensor ID</th>
                <th>Name</th>
                <th>Status</th>
                <th>Location</th>
                <th>Live Telemetry</th>
                <th>Last Seen</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredSensors.map((sensor) => {
                const telem = getSensorTelemetry(sensor);
                const isWarning = sensor.status.toLowerCase() === "warning";
                const isOnline = sensor.status.toLowerCase() === "online";

                return (
                  <tr
                    key={sensor.id}
                    className="sensor-row"
                    onClick={() => setSelectedSensor(sensor)}
                  >
                    <td>
                      <span className="sensor-id-tag">{sensor.id}</span>
                    </td>
                    <td>
                      <div className="sensor-name-cell">
                        <strong>{sensor.name}</strong>
                        <small>{sensor.type || "Telemetry Sensor"}</small>
                      </div>
                    </td>
                    <td>
                      <span className={`sensor-status-badge ${sensor.status.toLowerCase()}`}>
                        <span className="status-dot"></span>
                        {sensor.status}
                      </span>
                    </td>
                    <td>
                      <div className="location-cell">
                        <span>📍 {sensor.location}</span>
                      </div>
                    </td>
                    <td>
                      <div className="telemetry-summary-pill">
                        <span>🌡️ {telem.temperature}°C</span>
                        <span className="divider">·</span>
                        <span>⏲️ {telem.pressure} PSI</span>
                      </div>
                    </td>
                    <td>
                      <span className="last-seen-text">{sensor.lastSeen || "Live"}</span>
                    </td>
                    <td className="text-right" onClick={(e) => e.stopPropagation()}>
                      <button
                        className="btn-view-details"
                        onClick={() => setSelectedSensor(sensor)}
                      >
                        View Details →
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ─── Step 6: Sensor Details Modal ─── */}
      {selectedSensor && (
        <div className="modal-backdrop" onClick={() => setSelectedSensor(null)}>
          <div className="modal-content sensor-details-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="details-header-title">
                <span className="details-sensor-icon">◉</span>
                <div>
                  <h3>{selectedSensor.id}</h3>
                  <span className="details-sensor-subtitle">{selectedSensor.name} · {selectedSensor.location}</span>
                </div>
              </div>
              <button className="modal-close-btn" onClick={() => setSelectedSensor(null)}>
                ✕
              </button>
            </div>

            <div className="modal-body">
              <div className="details-status-row">
                <div className="details-meta-item">
                  <span className="meta-label">Status</span>
                  <span className={`sensor-status-badge ${selectedSensor.status.toLowerCase()}`}>
                    <span className="status-dot"></span>
                    {selectedSensor.status}
                  </span>
                </div>

                <div className="details-meta-item">
                  <span className="meta-label">Location</span>
                  <strong>📍 {selectedSensor.location}</strong>
                </div>

                <div className="details-meta-item">
                  <span className="meta-label">Last Seen</span>
                  <strong>🕒 {selectedSensor.lastSeen || "12:45:23"}</strong>
                </div>

                <div className="details-meta-item">
                  <span className="meta-label">Sensor Type</span>
                  <span>{selectedSensor.type || "Industrial Turbine"}</span>
                </div>
              </div>

              <h4 className="details-telemetry-heading">Live Telemetry Readings</h4>
              {(() => {
                const telem = getSensorTelemetry(selectedSensor);
                return (
                  <div className="details-telemetry-grid">
                    <div className="telemetry-box temp">
                      <span className="telem-icon">🌡️</span>
                      <div className="telem-info">
                        <span className="telem-label">Temperature</span>
                        <strong className="telem-value">{telem.temperature} <small>°C</small></strong>
                      </div>
                    </div>

                    <div className="telemetry-box pressure">
                      <span className="telem-icon">⏲️</span>
                      <div className="telem-info">
                        <span className="telem-label">Pressure</span>
                        <strong className="telem-value">{telem.pressure} <small>PSI</small></strong>
                      </div>
                    </div>

                    <div className="telemetry-box rpm">
                      <span className="telem-icon">⚙️</span>
                      <div className="telem-info">
                        <span className="telem-label">RPM</span>
                        <strong className="telem-value">{telem.rpm} <small>RPM</small></strong>
                      </div>
                    </div>

                    <div className="telemetry-box humidity">
                      <span className="telem-icon">💧</span>
                      <div className="telem-info">
                        <span className="telem-label">Humidity</span>
                        <strong className="telem-value">{telem.humidity} <small>%</small></strong>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>

            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setSelectedSensor(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Step 7: Register Sensor Modal ─── */}
      {isAddModalOpen && (
        <div className="modal-backdrop" onClick={() => setIsAddModalOpen(false)}>
          <div className="modal-content add-sensor-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Register New Sensor</h3>
              <button className="modal-close-btn" onClick={() => setIsAddModalOpen(false)}>
                ✕
              </button>
            </div>

            <form onSubmit={handleAddSensorSubmit}>
              <div className="modal-body">
                {formError && <div className="form-error-banner">{formError}</div>}

                <div className="form-group">
                  <label className="form-label">Sensor ID *</label>
                  <input
                    type="text"
                    className="form-input uppercase"
                    placeholder="e.g. TURBINE-004"
                    value={formData.id}
                    onChange={(e) => setFormData({ ...formData, id: e.target.value })}
                    required
                  />
                  <small className="form-hint">Unique identifier for telemetry streaming</small>
                </div>

                <div className="form-group">
                  <label className="form-label">Sensor Name *</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. Turbine 4 / Main Boiler"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Location *</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. Plant A / Sector 4"
                    value={formData.location}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Initial Status</label>
                  <select
                    className="form-select"
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  >
                    <option value="Online">Online</option>
                    <option value="Warning">Warning</option>
                    <option value="Offline">Offline</option>
                  </select>
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setIsAddModalOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary-action">
                  + Add Sensor
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
