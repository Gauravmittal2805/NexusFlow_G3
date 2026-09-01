import React, { useState } from "react";

/**
 * RuleCard Component
 * Displays a single rule's configuration, status, and management actions.
 *
 * Props:
 * - rule: Object (Rule document from backend)
 * - isSelected: Boolean
 * - isFlashing: Boolean (trigger pulse)
 * - onView: Function (rule) => void
 * - onToggleStatus: Function (rule, e) => void
 * - onDelete: Function (ruleId, e) => void
 * - isToggling: Boolean
 */
export default function RuleCard({
  rule,
  isSelected = false,
  isFlashing = false,
  onView,
  onToggleStatus,
  onDelete,
  isToggling = false,
}) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const ruleId = rule._id || rule.id;
  const isRuleActive =
    rule.status !== undefined
      ? rule.status === "ACTIVE" || rule.status === "RUNNING"
      : rule.isActive !== false;

  const statusText = isRuleActive ? "Active" : "Disabled";

  // Extract Sensor details from nodes
  const sensorNode = (rule.nodes || []).find(
    (n) => (n.type || "").toLowerCase().includes("sensor")
  );
  const sensorId =
    sensorNode?.data?.sensorId ||
    sensorNode?.data?.sensor_id ||
    rule.sensorId ||
    "TURBINE-001";

  const sensorField =
    sensorNode?.data?.field ||
    sensorNode?.data?.sensor ||
    "temperature";

  // Extract Condition details from nodes
  const conditionNode = (rule.nodes || []).find(
    (n) => (n.type || "").toLowerCase().includes("condition")
  );
  const conditionOperator = conditionNode?.data?.operator || ">";
  const conditionValue =
    conditionNode?.data?.value !== undefined ? conditionNode.data.value : 80;
  const conditionField =
    conditionNode?.data?.field || sensorField || "Temperature";

  const conditionDisplay = `${
    conditionField.charAt(0).toUpperCase() + conditionField.slice(1)
  } ${conditionOperator} ${conditionValue}`;

  // Extract Action/Alert details
  const actionNode = (rule.nodes || []).find(
    (n) =>
      (n.type || "").toLowerCase().includes("action") ||
      (n.type || "").toLowerCase().includes("alert")
  );
  const actionType = actionNode?.data?.action || actionNode?.data?.actionType || "ALERT";
  const actionSeverity = actionNode?.data?.severity || "HIGH";

  const nodeCount = rule.nodes ? rule.nodes.length : 0;
  const edgeCount = rule.edges ? rule.edges.length : 0;

  const dateStr = rule.createdAt || rule.updatedAt
    ? new Date(rule.createdAt || rule.updatedAt).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "Recently";

  return (
    <div
      className={`saved-rule-card ${isSelected ? "is-active" : ""} ${
        isFlashing ? "trigger-pulse-glow" : ""
      }`}
      onClick={() => onView && onView(rule)}
      style={{ cursor: "pointer" }}
    >
      <div className="rule-card-header">
        <span className="rule-card-name" title={rule.name}>
          {rule.name || "Untitled Rule"}
        </span>
        {isSelected && <span className="active-pill">Viewing</span>}
        {isFlashing && (
          <span className="realtime-pill" style={{ marginLeft: "auto" }}>
            ⚡ Triggered
          </span>
        )}
      </div>

      {rule.description && (
        <p style={{ fontSize: "12px", color: "#64748b", margin: "2px 0 6px" }}>
          {rule.description}
        </p>
      )}

      {/* Summary Row: Sensor & Condition */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "8px",
          margin: "8px 0",
          fontSize: "12px",
        }}
      >
        <span
          style={{
            background: "rgba(59, 130, 246, 0.1)",
            color: "#3b82f6",
            padding: "3px 8px",
            borderRadius: "6px",
            fontWeight: "500",
          }}
        >
          🔌 Sensor: {sensorId}
        </span>
        <span
          style={{
            background: "rgba(245, 158, 11, 0.1)",
            color: "#d97706",
            padding: "3px 8px",
            borderRadius: "6px",
            fontWeight: "500",
          }}
        >
          ⚖️ Condition: {conditionDisplay}
        </span>
        <span
          style={{
            background: "rgba(239, 68, 68, 0.1)",
            color: "#dc2626",
            padding: "3px 8px",
            borderRadius: "6px",
            fontWeight: "500",
          }}
        >
          🚨 {actionSeverity} ({actionType})
        </span>
      </div>

      {/* Status & Control Row */}
      <div
        className="rule-card-status-row"
        onClick={(e) => e.stopPropagation()}
        style={{ marginTop: "10px" }}
      >
        <div className="rule-status-text-wrap">
          <span className="rule-status-label">Status:</span>
          <span
            className={`status-dot-indicator ${
              isRuleActive ? "active" : "inactive"
            }`}
          >
            {isRuleActive ? "●" : "○"}
          </span>
          <span
            className={`status-value-text ${
              isRuleActive ? "active" : "inactive"
            }`}
          >
            {statusText}
          </span>
        </div>

        <button
          className={`btn-enable-disable-toggle ${
            isRuleActive ? "btn-disable" : "btn-enable"
          }`}
          onClick={(e) => onToggleStatus && onToggleStatus(rule, e)}
          disabled={isToggling}
          title={isRuleActive ? "Disable rule execution" : "Enable rule execution"}
        >
          {isToggling ? "..." : isRuleActive ? "Disable" : "Enable"}
        </button>
      </div>

      {/* Meta info: Node & Edge counts */}
      <div className="rule-card-meta" style={{ marginTop: "10px" }}>
        <span>⚡ {nodeCount} nodes, {edgeCount} edges</span>
        <span>🕒 {dateStr}</span>
      </div>

      {/* Deletion confirmation or action buttons */}
      {showDeleteConfirm ? (
        <div
          className="delete-confirm-box"
          onClick={(e) => e.stopPropagation()}
          style={{ marginTop: "10px" }}
        >
          <span style={{ fontSize: "12px", fontWeight: "500", color: "#b91c1c" }}>
            Are you sure you want to delete this rule?
          </span>
          <div className="confirm-btns" style={{ marginTop: "6px" }}>
            <button
              className="btn-confirm-delete"
              onClick={(e) => {
                setShowDeleteConfirm(false);
                if (onDelete) onDelete(ruleId, e);
              }}
            >
              Confirm
            </button>
            <button
              className="btn-confirm-cancel"
              onClick={(e) => {
                e.stopPropagation();
                setShowDeleteConfirm(false);
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div
          className="rule-card-actions"
          onClick={(e) => e.stopPropagation()}
          style={{ marginTop: "10px" }}
        >
          <button
            className="btn-rule-action edit"
            onClick={() => onView && onView(rule)}
            title="Open and view graph in Rule Builder"
          >
            👁️ View Rule
          </button>
          <button
            className="btn-rule-action edit"
            onClick={() => onView && onView(rule)}
            title="Edit Rule Graph"
          >
            ✏️ Edit
          </button>
          <button
            className="btn-rule-action delete"
            onClick={() => setShowDeleteConfirm(true)}
            title="Delete Rule"
          >
            🗑️ Delete
          </button>
        </div>
      )}
    </div>
  );
}
