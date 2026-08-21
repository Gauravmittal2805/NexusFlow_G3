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

  return (
    <div className={`flow-custom-node sensor-node ${selected ? "is-selected" : ""}`}>
      {/* Top Handle - Sensors typically don't have inputs, but handle is kept for flexibility */}
      <Handle type="target" position={Position.Top} className="flow-handle handle-top" />

      <div className="node-header">
        <div className="node-header-left">
          <span className="node-icon">{data.icon || config.icon}</span>
          <div>
            <span className="node-category-tag">DATA SOURCE</span>
            <span className="node-title">{data.label || `${config.label} Sensor`}</span>
          </div>
        </div>
        <div className="node-header-actions" onMouseDown={(e) => e.stopPropagation()}>
          {data.onDuplicate && (
            <button
              className="node-mini-btn"
              onClick={() => data.onDuplicate(id)}
              title="Duplicate Node"
            >
              📋
            </button>
          )}
          {data.onDelete && (
            <button
              className="node-mini-btn delete"
              onClick={() => data.onDelete(id)}
              title="Delete Node"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      <div className="node-content">
        <div className="node-summary-row">
          <span className="summary-label">Metric:</span>
          <span className="summary-value metric-tag">
            {config.label} <span className="unit-text">({data.unit || config.unit})</span>
          </span>
        </div>
        <div className="node-summary-row">
          <span className="summary-label">Sensor ID:</span>
          <span className="summary-id-pill">{data.sensorId || config.sensorId}</span>
        </div>
      </div>

      <Handle type="source" position={Position.Bottom} className="flow-handle handle-bottom" />
    </div>
  );
}
