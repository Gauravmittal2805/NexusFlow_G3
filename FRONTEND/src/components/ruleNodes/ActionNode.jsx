import React from "react";
import { Handle, Position } from "@xyflow/react";

const ACTION_OPTIONS = [
  { value: "ALERT", label: "Alert", icon: "🚨" },
  { value: "NOTIFICATION", label: "Notification", icon: "🔔" },
  { value: "SMS", label: "SMS", icon: "📱" },
  { value: "EMAIL", label: "Email", icon: "✉️" },
  { value: "SYSTEM", label: "System Log", icon: "📋" }
];

const SEVERITY_OPTIONS = [
  { value: "CRITICAL", label: "Critical", color: "#ef4444" },
  { value: "HIGH", label: "High", color: "#f97316" },
  { value: "MEDIUM", label: "Medium", color: "#eab308" },
  { value: "LOW", label: "Low", color: "#3b82f6" },
  { value: "INFO", label: "Info", color: "#06b6d4" }
];

export default function ActionNode({ id, data, selected }) {
  const currentAction = (data.action || data.actionType || "ALERT").toUpperCase();
  const currentSeverity = (data.severity || "HIGH").toUpperCase();
  const actionInfo = ACTION_OPTIONS.find((a) => a.value === currentAction) || ACTION_OPTIONS[0];

  const handleActionChange = (e) => {
    const val = e.target.value.toUpperCase();
    const info = ACTION_OPTIONS.find((a) => a.value === val) || ACTION_OPTIONS[0];
    if (data.onChange) {
      data.onChange(id, {
        action: val,
        actionType: val,
        label: `${info.label} Action`,
        icon: info.icon
      });
    }
  };

  const handleSeverityChange = (e) => {
    const val = e.target.value.toUpperCase();
    if (data.onChange) {
      data.onChange(id, { severity: val });
    }
  };

  return (
    <div className={`flow-custom-node alert-node ${selected ? "is-selected" : ""}`}>
      {/* Top Input Handle */}
      <Handle type="target" position={Position.Top} className="flow-handle handle-top" />

      {/* Header */}
      <div className="node-header">
        <div className="node-header-left">
          <span className="node-icon">{data.icon || actionInfo.icon}</span>
          <div>
            <span className="node-category-tag">ACTION</span>
            <span className="node-title">{data.label || `${actionInfo.label} Action`}</span>
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
          <label className="node-label">Action</label>
          <div className="nodrag" onMouseDown={(e) => e.stopPropagation()}>
            <select
              className="node-select"
              value={currentAction}
              onChange={handleActionChange}
            >
              {ACTION_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="node-field-group">
          <label className="node-label">Severity</label>
          <div className="nodrag" onMouseDown={(e) => e.stopPropagation()}>
            <select
              className="node-select"
              value={currentSeverity}
              onChange={handleSeverityChange}
            >
              {SEVERITY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Bottom Output Handle for optional chaining */}
      <Handle type="source" position={Position.Bottom} className="flow-handle handle-bottom" />
    </div>
  );
}
