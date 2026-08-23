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
  const sev = (data.severity || "High").toLowerCase();

  return (
    <div className={`flow-custom-node alert-node ${selected ? "is-selected" : ""}`}>
      <Handle type="target" position={Position.Top} className="flow-handle handle-top" />

      <div className="node-header">
        <div className="node-header-left">
          <span className="node-icon">{data.icon || config.icon}</span>
          <div>
            <span className="node-category-tag">ACTION</span>
            <span className="node-title">{data.label || config.label}</span>
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
          <span className="summary-label">Channel:</span>
          <span className="summary-value channel-badge">{currentAction}</span>
        </div>
        <div className="node-summary-row">
          <span className="summary-label">Target:</span>
          <span className="summary-id-pill" title={currentAction === "SMS" ? data.phone : data.email}>
            {currentAction === "SMS"
              ? (data.phone || "+919876543210")
              : currentAction === "Email"
              ? (data.email || "admin@nexusflow.io")
              : "Dashboard"}
          </span>
        </div>
        <div className="node-summary-row">
          <span className="summary-label">Severity:</span>
          <span className={`severity-tag ${sev}`}>{data.severity || "High"}</span>
        </div>
      </div>

      {/* Bottom Handle - Alert nodes are terminal */}
      <Handle type="source" position={Position.Bottom} className="flow-handle handle-bottom" />
    </div>
  );
}
