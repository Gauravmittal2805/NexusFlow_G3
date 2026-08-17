import React from "react";
import { Handle, Position } from "@xyflow/react";

const METRIC_MAP = {
  temperature: { label: "Temperature", icon: "🌡️", unit: "°C", sensorId: "T-001" },
  humidity: { label: "Humidity", icon: "💧", unit: "%", sensorId: "H-002" },
  pressure: { label: "Pressure", icon: "⏲️", unit: "PSI", sensorId: "P-003" },
  rpm: { label: "RPM", icon: "🔄", unit: "RPM", sensorId: "R-004" }
};

export default function SensorNode({ id, data, selected }) {
  const currentMetricKey = data.sensor || "temperature";
  const config = METRIC_MAP[currentMetricKey] || METRIC_MAP.temperature;

  const handleMetricChange = (e) => {
    const newMetricKey = e.target.value;
    const newConfig = METRIC_MAP[newMetricKey];

    if (data.onMetricChange) {
      data.onMetricChange(id, newMetricKey, newConfig);
    } else if (data.onChange) {
      data.onChange(id, "sensor", newMetricKey);
    }
  };

  const handleSensorIdChange = (e) => {
    if (data.onChange) {
      data.onChange(id, "sensorId", e.target.value);
    }
  };

  return (
    <div className={`flow-custom-node sensor-node ${selected ? "is-selected" : ""}`}>
      <Handle type="target" position={Position.Top} className="flow-handle handle-top" />

      <div className="node-header">
        <span className="node-icon">{data.icon || config.icon}</span>
        <span className="node-title">{data.label || config.label}</span>
        {data.onDuplicate && (
          <button
            className="node-action-btn"
            onClick={(e) => {
              e.stopPropagation();
              data.onDuplicate(id);
            }}
            title="Duplicate Node"
          >
            📋
          </button>
        )}
      </div>

      <div className="node-content" onMouseDown={(e) => e.stopPropagation()}>
        <div className="node-field">
          <label className="field-label">Metric:</label>
          <select
            className="node-input-select"
            value={currentMetricKey}
            onChange={handleMetricChange}
          >
            <option value="temperature">Temperature (🌡️)</option>
            <option value="humidity">Humidity (💧)</option>
            <option value="pressure">Pressure (⏲️)</option>
            <option value="rpm">RPM (🔄)</option>
          </select>
        </div>

        <div className="node-field">
          <label className="field-label">Sensor ID:</label>
          <input
            type="text"
            className="node-input-text"
            value={data.sensorId || config.sensorId}
            onChange={handleSensorIdChange}
            placeholder="e.g. T-001"
          />
        </div>

        <div className="node-field secondary">
          <span className="field-label">Unit:</span>
          <span className="field-value metric-unit-badge">{data.unit || config.unit}</span>
        </div>
      </div>

      <Handle type="source" position={Position.Bottom} className="flow-handle handle-bottom" />
    </div>
  );
}
