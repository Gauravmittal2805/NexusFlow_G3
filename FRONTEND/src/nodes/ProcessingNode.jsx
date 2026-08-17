import React from "react";
import { Handle, Position } from "@xyflow/react";

const OPERATION_MAP = {
  movingAverage: { label: "Moving Average", icon: "📈", defaultWindow: 5 },
  average: { label: "Average Window", icon: "📊", defaultWindow: 10 },
  minimum: { label: "Minimum Window", icon: "⬇️", defaultWindow: 5 },
  maximum: { label: "Maximum Window", icon: "⬆️", defaultWindow: 5 }
};

export default function ProcessingNode({ id, data, selected }) {
  const currentOpKey = data.operation || "movingAverage";
  const config = OPERATION_MAP[currentOpKey] || OPERATION_MAP.movingAverage;

  const handleOpTypeChange = (e) => {
    const newOpKey = e.target.value;
    const newConfig = OPERATION_MAP[newOpKey] || OPERATION_MAP.movingAverage;

    if (data.onOpChange) {
      data.onOpChange(id, newOpKey, newConfig);
    } else if (data.onChange) {
      data.onChange(id, "operation", newOpKey);
    }
  };

  const handleWindowChange = (e) => {
    if (data.onChange) {
      data.onChange(id, "window", Number(e.target.value));
    }
  };

  return (
    <div className={`flow-custom-node processing-node ${selected ? "is-selected" : ""}`}>
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
          <label className="field-label">Operation:</label>
          <select
            className="node-input-select"
            value={currentOpKey}
            onChange={handleOpTypeChange}
          >
            <option value="movingAverage">Moving Avg (📈)</option>
            <option value="average">Average (📊)</option>
            <option value="minimum">Minimum (⬇️)</option>
            <option value="maximum">Maximum (⬆️)</option>
          </select>
        </div>

        <div className="node-field">
          <label className="field-label">Window Size:</label>
          <input
            type="number"
            min="1"
            max="100"
            className="node-input-number"
            value={data.window ?? config.defaultWindow}
            onChange={handleWindowChange}
          />
        </div>
      </div>

      <Handle type="source" position={Position.Bottom} className="flow-handle handle-bottom" />
    </div>
  );
}
