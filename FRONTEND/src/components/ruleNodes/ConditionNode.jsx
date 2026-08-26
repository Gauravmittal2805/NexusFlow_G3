import React from "react";
import { Handle, Position } from "@xyflow/react";

const OPERATOR_OPTIONS = [
  { value: ">", label: "> (Greater Than)" },
  { value: "<", label: "< (Less Than)" },
  { value: ">=", label: ">= (Greater or Equal)" },
  { value: "<=", label: "<= (Less or Equal)" },
  { value: "==", label: "== (Equals)" },
  { value: "!=", label: "!= (Not Equals)" }
];

const FIELD_OPTIONS = [
  { key: "temperature", label: "Temperature" },
  { key: "pressure", label: "Pressure" },
  { key: "humidity", label: "Humidity" },
  { key: "rpm", label: "RPM" }
];

export default function ConditionNode({ id, data, selected }) {
  const currentField = (data.field || data.sensor || "temperature").toLowerCase();
  const currentOp = data.operator || ">";
  const currentValue = data.value !== undefined ? data.value : 80;

  const handleFieldChange = (e) => {
    const val = e.target.value;
    if (data.onChange) {
      data.onChange(id, { field: val, sensor: val });
    }
  };

  const handleOperatorChange = (e) => {
    const val = e.target.value;
    if (data.onChange) {
      data.onChange(id, { operator: val });
    }
  };

  const handleValueChange = (e) => {
    const val = e.target.value === "" ? "" : Number(e.target.value);
    if (data.onChange) {
      data.onChange(id, { value: val });
    }
  };

  return (
    <div className={`flow-custom-node condition-node ${selected ? "is-selected" : ""}`}>
      {/* Top Input Handle */}
      <Handle type="target" position={Position.Top} className="flow-handle handle-top" />

      {/* Header */}
      <div className="node-header">
        <div className="node-header-left">
          <span className="node-icon condition-icon">{data.icon || "⚙"}</span>
          <div>
            <span className="node-category-tag">CONDITION</span>
            <span className="node-title">{data.label || "Condition"}</span>
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

        <div className="node-field-group">
          <label className="node-label">Operator</label>
          <div className="nodrag" onMouseDown={(e) => e.stopPropagation()}>
            <select
              className="node-select font-mono"
              value={currentOp}
              onChange={handleOperatorChange}
            >
              {OPERATOR_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="node-field-group">
          <label className="node-label">Value</label>
          <div className="nodrag" onMouseDown={(e) => e.stopPropagation()}>
            <input
              type="number"
              className="node-input"
              value={currentValue}
              onChange={handleValueChange}
              placeholder="e.g. 80"
              step="any"
            />
          </div>
        </div>
      </div>

      {/* Bottom Output Handle */}
      <Handle type="source" position={Position.Bottom} className="flow-handle handle-bottom" />
    </div>
  );
}
