import React from "react";
import { Handle, Position } from "@xyflow/react";

const ALERT_MAP = {
  SMS: { label: "SMS Alert", icon: "📱", actionType: "SMS" },
  Email: { label: "Email Alert", icon: "✉️", actionType: "Email" },
  System: { label: "System Alert", icon: "🚨", actionType: "System" }
};

export default function AlertNode({ id, data, selected }) {
  const currentAction = data.actionType || "SMS";
  const config = ALERT_MAP[currentAction] || ALERT_MAP.SMS;

  const handleActionChange = (e) => {
    const newAction = e.target.value;
    const newConfig = ALERT_MAP[newAction] || ALERT_MAP.SMS;

    if (data.onAlertChange) {
      data.onAlertChange(id, newAction, newConfig);
    } else if (data.onChange) {
      data.onChange(id, "actionType", newAction);
    }
  };

  const handleFieldChange = (field, value) => {
    if (data.onChange) {
      data.onChange(id, field, value);
    }
  };

  return (
    <div className={`flow-custom-node alert-node ${selected ? "is-selected" : ""}`}>
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
          <label className="field-label">Action Type:</label>
          <select
            className="node-input-select"
            value={currentAction}
            onChange={handleActionChange}
          >
            <option value="SMS">SMS Alert (📱)</option>
            <option value="Email">Email Alert (✉️)</option>
            <option value="System">System Alert (🚨)</option>
          </select>
        </div>

        {currentAction === "SMS" && (
          <div className="node-field">
            <label className="field-label">Phone:</label>
            <input
              type="text"
              className="node-input-text"
              value={data.phone || "+919876543210"}
              onChange={(e) => handleFieldChange("phone", e.target.value)}
              placeholder="+91XXXXXXXXXX"
            />
          </div>
        )}

        {currentAction === "Email" && (
          <div className="node-field">
            <label className="field-label">Email:</label>
            <input
              type="email"
              className="node-input-text"
              value={data.email || "admin@nexusflow.io"}
              onChange={(e) => handleFieldChange("email", e.target.value)}
              placeholder="admin@nexusflow.io"
            />
          </div>
        )}

        <div className="node-field">
          <label className="field-label">Severity:</label>
          <select
            className="node-input-select"
            value={data.severity || "High"}
            onChange={(e) => handleFieldChange("severity", e.target.value)}
          >
            <option value="Critical">Critical</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Info">Info</option>
          </select>
        </div>
      </div>

      <Handle type="source" position={Position.Bottom} className="flow-handle handle-bottom" />
    </div>
  );
}
