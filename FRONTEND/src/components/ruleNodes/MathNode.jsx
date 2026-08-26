import React from "react";
import { Handle, Position } from "@xyflow/react";

const MATH_OPERATIONS = [
  { value: "movingAverage", label: "Moving Average", icon: "📈", defaultWindow: 5 },
  { value: "average", label: "Average", icon: "📊", defaultWindow: 10 },
  { value: "minimum", label: "Minimum", icon: "⬇️", defaultWindow: 5 },
  { value: "maximum", label: "Maximum", icon: "⬆️", defaultWindow: 5 },
  { value: "add", label: "Add (+)", icon: "➕", defaultWindow: 0 },
  { value: "subtract", label: "Subtract (-)", icon: "➖", defaultWindow: 0 },
  { value: "multiply", label: "Multiply (×)", icon: "✖️", defaultWindow: 1 },
  { value: "divide", label: "Divide (÷)", icon: "➗", defaultWindow: 1 }
];

export default function MathNode({ id, data, selected }) {
  const currentOp = data.operation || data.op || "movingAverage";
  const opInfo = MATH_OPERATIONS.find((o) => o.value === currentOp) || MATH_OPERATIONS[0];
  const currentWindow = data.window !== undefined ? data.window : opInfo.defaultWindow;

  const handleOpChange = (e) => {
    const val = e.target.value;
    const info = MATH_OPERATIONS.find((o) => o.value === val) || MATH_OPERATIONS[0];
    if (data.onChange) {
      data.onChange(id, {
        operation: val,
        label: info.label,
        icon: info.icon,
        window: data.window ?? info.defaultWindow
      });
    }
  };

  const handleWindowChange = (e) => {
    const val = Number(e.target.value);
    if (data.onChange) {
      data.onChange(id, { window: val });
    }
  };

  return (
    <div className={`flow-custom-node processing-node ${selected ? "is-selected" : ""}`}>
      {/* Top Target Handle */}
      <Handle type="target" position={Position.Top} className="flow-handle handle-top" />

      {/* Header */}
      <div className="node-header">
        <div className="node-header-left">
          <span className="node-icon">{data.icon || opInfo.icon}</span>
          <div>
            <span className="node-category-tag">MATH / OPERATION</span>
            <span className="node-title">{data.label || opInfo.label}</span>
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
          <label className="node-label">Operation</label>
          <div className="nodrag" onMouseDown={(e) => e.stopPropagation()}>
            <select
              className="node-select"
              value={currentOp}
              onChange={handleOpChange}
            >
              {MATH_OPERATIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="node-field-group">
          <label className="node-label">
            {["add", "subtract", "multiply", "divide"].includes(currentOp)
              ? "Operand Value"
              : "Window Size (Samples)"}
          </label>
          <div className="nodrag" onMouseDown={(e) => e.stopPropagation()}>
            <input
              type="number"
              className="node-input"
              value={currentWindow}
              onChange={handleWindowChange}
              min="1"
              max="1000"
            />
          </div>
        </div>
      </div>

      {/* Bottom Source Handle */}
      <Handle type="source" position={Position.Bottom} className="flow-handle handle-bottom" />
    </div>
  );
}
