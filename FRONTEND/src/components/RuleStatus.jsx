import React from "react";

/**
 * RuleStatus Component (Steps 1, 2, 4)
 *
 * Displays standard rule runtime status badge, enable/disable toggle control,
 * and detailed last-triggered execution information.
 *
 * Supported states:
 * - RUNNING (● Running)
 * - ACTIVE (● Active)
 * - INACTIVE (○ Inactive)
 * - COMPILATION_FAILED (⚠ Compilation Failed)
 * - TRIGGERED (⚡ Triggered)
 * - DRAFT (📝 Draft)
 */
export default function RuleStatus({
  ruleName,
  status,
  isActive = true,
  lastTriggered,
  sensorId,
  lastTriggeredSensor,
  lastTriggeredValue,
  field = "temperature",
  onToggleStatus,
  disabled = false,
  compact = false,
}) {
  const normalizedStatus = (status || "").toUpperCase();

  let displayLabel = "Inactive";
  let statusClass = "inactive";
  let statusDot = "○";

  if (normalizedStatus === "COMPILATION_FAILED" || normalizedStatus === "ERROR") {
    displayLabel = "Compilation Failed";
    statusClass = "compilation-failed";
    statusDot = "⚠";
  } else if (normalizedStatus === "TRIGGERED") {
    displayLabel = "Triggered";
    statusClass = "triggered";
    statusDot = "⚡";
  } else if (normalizedStatus === "RUNNING") {
    displayLabel = "Running";
    statusClass = "running";
    statusDot = "●";
  } else if (normalizedStatus === "ACTIVE" || (isActive && !status)) {
    displayLabel = "Active";
    statusClass = "active";
    statusDot = "●";
  } else if (normalizedStatus === "DRAFT") {
    displayLabel = "Draft";
    statusClass = "draft";
    statusDot = "📝";
  } else {
    displayLabel = "Inactive";
    statusClass = "inactive";
    statusDot = "○";
  }

  const isRuleActive =
    normalizedStatus === "RUNNING" ||
    normalizedStatus === "ACTIVE" ||
    normalizedStatus === "TRIGGERED" ||
    (isActive !== false && normalizedStatus !== "INACTIVE" && normalizedStatus !== "COMPILATION_FAILED");

  const formatTime = (ts) => {
    if (!ts) return "Never";
    try {
      const date = new Date(ts);
      if (isNaN(date.getTime())) return String(ts);
      return date.toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    } catch {
      return String(ts);
    }
  };

  const formatValue = (val, fld) => {
    if (val === undefined || val === null) return "--";
    const lower = (fld || "").toLowerCase();
    if (lower.includes("temp")) return `${val}°C`;
    if (lower.includes("press")) return `${val} PSI`;
    if (lower.includes("humid")) return `${val}%`;
    if (lower.includes("rpm")) return `${val} RPM`;
    return `${val}`;
  };

  const resolvedSensor = lastTriggeredSensor || sensorId || "TURBINE-001";
  const formattedVal = formatValue(lastTriggeredValue, field);

  if (compact) {
    return (
      <div className="rule-status-compact-container">
        <span className="runtime-status-label">
          Status:
          <span className={`status-pill ${statusClass}`}>
            <span className="status-dot-symbol">{statusDot}</span>
            <span className="status-name-text">{displayLabel}</span>
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
        <h4 className="rule-status-title">{ruleName || "High Temperature Alert"}</h4>
        <div className="rule-status-badge-group">
          <span className={`status-pill ${statusClass}`}>
            <span className="status-dot-symbol">{statusDot}</span>
            <span className="status-name-text">{displayLabel}</span>
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

      <div className="rule-last-triggered-section">
        <div className="last-triggered-header">
          <span className="last-triggered-title">Last Triggered</span>
        </div>
        <div className="rule-status-meta-grid">
          <div className="meta-item">
            <span className="meta-label">Rule:</span>
            <span className="meta-value">{ruleName || "High Temperature Alert"}</span>
          </div>
          <div className="meta-item">
            <span className="meta-label">Sensor:</span>
            <span className="meta-value sensor-badge">{resolvedSensor}</span>
          </div>
          <div className="meta-item">
            <span className="meta-label">Value:</span>
            <span className="meta-value value-highlight">{formattedVal}</span>
          </div>
          <div className="meta-item">
            <span className="meta-label">Time:</span>
            <span className="meta-value">{formatTime(lastTriggered)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
