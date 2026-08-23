import React from "react";
import { Handle, Position } from "@xyflow/react";

const CONDITION_MAP = {
  ">": { label: "Greater Than", icon: ">" },
  "<": { label: "Less Than", icon: "<" },
  "=": { label: "Equals", icon: "=" },
  ">=": { label: "Greater or Equal", icon: ">=" },
  "<=": { label: "Less or Equal", icon: "<=" }
};

export default function ConditionNode({ id, data, selected }) {
  const currentOp = data.operator || ">";
  const config = CONDITION_MAP[currentOp] || CONDITION_MAP[">"];
  const val = data.value ?? 80;

  return (
    <div className={`flow-custom-node condition-node ${selected ? "is-selected" : ""}`}>
      <Handle type="target" position={Position.Top} className="flow-handle handle-top" />

      <div className="node-header">
        <div className="node-header-left">
          <span className="node-icon condition-icon">{data.icon || config.icon}</span>
          <div>
            <span className="node-category-tag">CONDITION</span>
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
          <span className="summary-label">Operator:</span>
          <span className="summary-value condition-operator-tag">{currentOp}</span>
        </div>
        <div className="node-summary-row">
          <span className="summary-label">Threshold:</span>
          <span className="summary-value threshold-pill">{val}</span>
        </div>
      </div>

      <Handle type="source" position={Position.Bottom} className="flow-handle handle-bottom" />
    </div>
  );
}
