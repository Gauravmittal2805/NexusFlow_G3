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

  const handleOperatorChange = (e) => {
    const newOp = e.target.value;
    const newConfig = CONDITION_MAP[newOp] || CONDITION_MAP[">"];

    if (data.onConditionChange) {
      data.onConditionChange(id, newOp, newConfig);
    } else if (data.onChange) {
      data.onChange(id, "operator", newOp);
    }
  };

  const handleValueChange = (e) => {
    if (data.onChange) {
      data.onChange(id, "value", Number(e.target.value));
    }
  };

  return (
    <div className={`flow-custom-node condition-node ${selected ? "is-selected" : ""}`}>
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
          <label className="field-label">Operator:</label>
          <select
            className="node-input-select"
            value={currentOp}
            onChange={handleOperatorChange}
          >
            <option value=">">Greater Than (&gt;)</option>
            <option value="<">Less Than (&lt;)</option>
            <option value="=">Equals (=)</option>
            <option value=">=">Greater or Equal (&gt;=)</option>
            <option value="<=">Less or Equal (&lt;=)</option>
          </select>
        </div>

        <div className="node-field">
          <label className="field-label">Threshold Value:</label>
          <input
            type="number"
            className="node-input-number"
            value={data.value ?? 80}
            onChange={handleValueChange}
          />
        </div>
      </div>

      <Handle type="source" position={Position.Bottom} className="flow-handle handle-bottom" />
    </div>
  );
}
