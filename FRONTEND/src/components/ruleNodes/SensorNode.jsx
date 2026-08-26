import React from "react";
import { Handle, Position } from "@xyflow/react";

const SENSOR_OPTIONS = [
  { id: "TURBINE-001", name: "Turbine 1 (TURBINE-001)" },
  { id: "TURBINE-002", name: "Turbine 2 (TURBINE-002)" },
  { id: "TURBINE-003", name: "Turbine 3 (TURBINE-003)" },
  { id: "BOILER-101", name: "Boiler Pressure (BOILER-101)" },
  { id: "CHILLER-201", name: "Chiller Temp (CHILLER-201)" },
  { id: "T-001", name: "Temperature (T-001)" },
  { id: "P-003", name: "Pressure (P-003)" },
  { id: "H-002", name: "Humidity (H-002)" },
  { id: "R-004", name: "RPM (R-004)" }
];

const FIELD_OPTIONS = [
  { key: "temperature", label: "Temperature", unit: "°C", icon: "🌡️" },
  { key: "pressure", label: "Pressure", unit: "PSI", icon: "⏲️" },
  { key: "humidity", label: "Humidity", unit: "%", icon: "💧" },
  { key: "rpm", label: "RPM", unit: "RPM", icon: "🔄" }
];

export default function SensorNode({ id, data, selected }) {
  const currentSensorId = data.sensorId || data.sensor_id || "TURBINE-001";
  const currentField = (data.field || data.sensor || "temperature").toLowerCase();
  const fieldInfo = FIELD_OPTIONS.find((f) => f.key === currentField) || FIELD_OPTIONS[0];

  const handleSensorChange = (e) => {
    const val = e.target.value;
    if (data.onChange) {
      data.onChange(id, { sensorId: val, sensor_id: val });
    }
  };

  const handleFieldChange = (e) => {
    const val = e.target.value;
    const info = FIELD_OPTIONS.find((f) => f.key === val) || FIELD_OPTIONS[0];
    if (data.onChange) {
      data.onChange(id, {
        field: val,
        sensor: val,
        unit: info.unit,
        icon: info.icon,
        label: `${info.label} Sensor`
      });
    }
  };

  return (
    <div className={`flow-custom-node sensor-node ${selected ? "is-selected" : ""}`}>
      {/* Top Handle for flexible pipeline connections */}
      <Handle type="target" position={Position.Top} className="flow-handle handle-top" />

      {/* Header */}
      <div className="node-header">
        <div className="node-header-left">
          <span className="node-icon">{data.icon || fieldInfo.icon}</span>
          <div>
            <span className="node-category-tag">DATA SOURCE</span>
            <span className="node-title">{data.label || `${fieldInfo.label} Sensor`}</span>
          </div>
        </div>
        <div className="node-header-actions nodrag" onMouseDown={(e) => e.stopPropagation()}>
          {data.onDuplicate && (
            <button
              className="node-mini-btn"
              onClick={() => data.onDuplicate(id)}
              title="Duplicate Node"
              type="button"
            >
              📋
            </button>
          )}
          {data.onDelete && (
            <button
              className="node-mini-btn delete"
              onClick={() => data.onDelete(id)}
              title="Delete Node"
              type="button"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Content Form */}
      <div className="node-content">
        <div className="node-field-group">
          <label className="node-label">Sensor</label>
          <div className="nodrag" onMouseDown={(e) => e.stopPropagation()}>
            <select
              className="node-select"
              value={currentSensorId}
              onChange={handleSensorChange}
            >
              {SENSOR_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.id}
                </option>
              ))}
              {!SENSOR_OPTIONS.some((o) => o.id === currentSensorId) && (
                <option value={currentSensorId}>{currentSensorId}</option>
              )}
            </select>
          </div>
        </div>

        <div className="node-field-group">
          <label className="node-label">Field</label>
          <div className="nodrag" onMouseDown={(e) => e.stopPropagation()}>
            <select
              className="node-select"
              value={currentField}
              onChange={handleFieldChange}
            >
              {FIELD_OPTIONS.map((opt) => (
                <option key={opt.key} value={opt.key}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Bottom Source Handle */}
      <Handle type="source" position={Position.Bottom} className="flow-handle handle-bottom" />
    </div>
  );
}
