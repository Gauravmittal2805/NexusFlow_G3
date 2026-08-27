import React from "react";

/**
 * RuleStatus Component (Step 1, 2, 8)
 *
 * Displays standard rule runtime status badge, enable/disable toggle control,
 * and last-triggered monitoring information.
 *
 * Possible states:
 * - ACTIVE (● Active)
 * - INACTIVE (○ Inactive)
 * - DRAFT (📝 Draft)
 * - RUNNING (⚡ Running)
 */
export default function RuleStatus({
  ruleName,
  status,
  isActive = true,
  lastTriggered,
  sensorId,
  onToggleStatus,
  disabled = false,
  compact = false,
}) {
  const isRuleActive =
    status !== undefined
      ? status === "ACTIVE" || status === "RUNNING"
      : isActive !== false;

  const displayStatus =
    status === "DRAFT"
      ? "Draft"
      : isRuleActive
      ? "Active"
      : "Inactive";

  const formatTime = (ts) => {
    if (!ts) return "Never";
    try {
      const date = new Date(ts);
      if (isNaN(date.getTime())) return ts;
      return date.toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    } catch {
      return String(ts);
    }
  };

  if (compact) {
    return (
      <div className="rule-status-compact-container">
        <span className="runtime-status-label">
          Status:
          <span className={`status-pill ${isRuleActive ? "active" : "inactive"}`}>
            <span className="status-dot-symbol">{isRuleActive ? "●" : "○"}</span>
            <span className="status-name-text">{displayStatus}</span>
          </span>
        </span>

        {onToggleStatus && (
          <button
            className={`btn-control-enable-disable ${
              isRuleActive ? "btn-disable-action" : "btn-enable-action"
            }`}
            onClick={onToggleStatus}
            disabled={disabled}
            title={
              isRuleActive
                ? "Click to Disable rule runtime execution"
                : "Click to Enable rule runtime execution"
            }
          >
            {disabled ? "..." : isRuleActive ? "Disable" : "Enable"}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="rule-status-card">
      <div className="rule-status-header">
        <h4 className="rule-status-title">{ruleName || "Rule"}</h4>
        <div className="rule-status-badge-group">
          <span className={`status-pill ${isRuleActive ? "active" : "inactive"}`}>
            <span className="status-dot-symbol">{isRuleActive ? "●" : "○"}</span>
            <span className="status-name-text">{displayStatus}</span>
          </span>
          {onToggleStatus && (
            <button
              className={`btn-control-enable-disable ${
                isRuleActive ? "btn-disable-action" : "btn-enable-action"
              }`}
              onClick={onToggleStatus}
              disabled={disabled}
              title={isRuleActive ? "Disable Rule" : "Enable Rule"}
            >
              {disabled ? "..." : isRuleActive ? "Disable" : "Enable"}
            </button>
          )}
        </div>
      </div>

      <div className="rule-status-meta-grid">
        <div className="meta-item">
          <span className="meta-label">Last Triggered:</span>
          <span className="meta-value">{formatTime(lastTriggered)}</span>
        </div>
        {sensorId && (
          <div className="meta-item">
            <span className="meta-label">Sensor:</span>
            <span className="meta-value sensor-badge">{sensorId}</span>
          </div>
        )}
      </div>
    </div>
  );
}
