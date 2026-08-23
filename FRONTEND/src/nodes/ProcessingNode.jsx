import React from "react";
import { Handle, Position } from "@xyflow/react";

const OPERATION_MAP = {
  movingAverage: { label: "Moving Average", icon: "📈", defaultWindow: 5 },
  average: { label: "Average Window", icon: "📊", defaultWindow: 10 },
  minimum: { label: "Minimum Window", icon: "⬇️", defaultWindow: 5 },
  maximum: { label: "Maximum Window", icon: "⬆️", defaultWindow: 5 }
};

export default function MovingAverageNode({ id, data, selected }) {
  const currentOpKey = data.operation || "movingAverage";
  const config = OPERATION_MAP[currentOpKey] || OPERATION_MAP.movingAverage;
  const windowSize = data.window ?? config.defaultWindow;

  return (
    <div className={`flow-custom-node processing-node ${selected ? "is-selected" : ""}`}>
      <Handle type="target" position={Position.Top} className="flow-handle handle-top" />

      <div className="node-header">
        <div className="node-header-left">
          <span className="node-icon">{data.icon || config.icon}</span>
          <div>
            <span className="node-category-tag">OPERATION</span>
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
          <span className="summary-label">Window:</span>
          <span className="summary-value window-badge">
            {windowSize} samples
          </span>
        </div>
        <div className="node-summary-row">
          <span className="summary-label">Type:</span>
          <span className="summary-id-pill">{config.label}</span>
        </div>
      </div>

      <Handle type="source" position={Position.Bottom} className="flow-handle handle-bottom" />
    </div>
  );
}
