import React, { useState, useEffect } from "react";
import { subscribeToRuleTrigger, connectSocket } from "../services/socket";
import ExecutionHistory from "./ExecutionHistory";

/**
 * Clean and sanitize compilation/validation errors to avoid exposing
 * raw JavaScript errors (e.g. TypeError, stack traces) to the user.
 */
function formatCompilationError(errorObjOrString) {
  if (!errorObjOrString) return "Rule could not be executed.";

  let raw = typeof errorObjOrString === "string"
    ? errorObjOrString
    : errorObjOrString.message || errorObjOrString.error || JSON.stringify(errorObjOrString);

  // Strip generic prefixes
  raw = raw.replace(/^Error:\s*/i, "");
  raw = raw.replace(/^TypeError:\s*/i, "");
  raw = raw.replace(/^ValidationError:\s*/i, "");
  raw = raw.replace(/^CompilationError:\s*/i, "");

  if (raw.toLowerCase().includes("cannot read properties of undefined") ||
      raw.toLowerCase().includes("cannot read property") ||
      raw.toLowerCase().includes("value is missing") ||
      raw.toLowerCase().includes("missing value")) {
    return "Condition node is missing a value.";
  }

  if (raw.toLowerCase().includes("missing a valid 'id'") || raw.toLowerCase().includes("missing a valid 'type'")) {
    return "One or more nodes in the graph are incomplete.";
  }

  return raw;
}

/**
 * RuleExecutionStatus Component (Steps 1 to 6)
 *
 * Displays in-place rule execution monitoring & live trigger feedback
 * inside the Rule Builder.
 */
export default function RuleExecutionStatus({
  ruleId,
  ruleName = "High Temperature Alert",
  isRuleActive = true,
  ruleStatus = "RUNNING",
  compilationStatus,
  onTriggerUpdate,
}) {
  const [latestTrigger, setLatestTrigger] = useState(null);
  const [triggerHistory, setTriggerHistory] = useState([]);
  const [isFlashing, setIsFlashing] = useState(false);

  useEffect(() => {
    // Ensure socket connection
    connectSocket();

    // Subscribe to Rule Engine live triggers
    const unsubscribe = subscribeToRuleTrigger((data) => {
      if (!data) return;

      const isMatchingRule =
        !ruleId ||
        data.ruleId === ruleId ||
        (ruleName && data.ruleName && data.ruleName.trim().toLowerCase() === ruleName.trim().toLowerCase());

      if (isMatchingRule) {
        const dateObj = data.timestamp ? new Date(data.timestamp) : new Date();
        const formattedTime = !isNaN(dateObj.getTime())
          ? dateObj.toLocaleTimeString(undefined, {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })
          : new Date().toLocaleTimeString();

        const enriched = {
          ...data,
          formattedTime,
        };

        setLatestTrigger(enriched);
        setTriggerHistory((prev) => [enriched, ...prev.slice(0, 4)]);
        setIsFlashing(true);

        setTimeout(() => setIsFlashing(false), 2500);

        if (onTriggerUpdate) {
          onTriggerUpdate(enriched);
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, [ruleId, ruleName, onTriggerUpdate]);

  const formatFieldValue = (trigger) => {
    if (!trigger) return "--";
    const field = (trigger.field || "temperature").toLowerCase();
    const val = trigger.value !== undefined && trigger.value !== null ? trigger.value : "--";
    if (field.includes("temp")) return `${val}°C`;
    if (field.includes("press")) return `${val} PSI`;
    if (field.includes("humid")) return `${val}%`;
    if (field.includes("rpm")) return `${val} RPM`;
    return `${val}`;
  };

  const isCompilationError =
    (compilationStatus && compilationStatus.status === "error") ||
    ruleStatus === "COMPILATION_FAILED" ||
    ruleStatus === "ERROR";

  const resolvedStatus = isCompilationError
    ? "COMPILATION_FAILED"
    : isFlashing
    ? "TRIGGERED"
    : !isRuleActive || ruleStatus === "INACTIVE"
    ? "INACTIVE"
    : ruleStatus === "RUNNING"
    ? "RUNNING"
    : "ACTIVE";

  return (
    <div className="rule-execution-status-panel">
      <div className="execution-panel-header">
        <div className="panel-title-wrap">
          <span className="panel-icon">⚡</span>
          <h4>{ruleName || "High Temperature Alert"}</h4>
        </div>
        <div className="execution-runtime-badge">
          {resolvedStatus === "COMPILATION_FAILED" ? (
            <span className="status-badge-compilation-failed">
              ⚠ Compilation Failed
            </span>
          ) : resolvedStatus === "TRIGGERED" ? (
            <span className="status-badge-triggered">
              ⚡ Triggered
            </span>
          ) : resolvedStatus === "RUNNING" ? (
            <span className="live-pulse-badge">
              <span className="pulse-dot"></span> ● Running
            </span>
          ) : resolvedStatus === "ACTIVE" ? (
            <span className="live-pulse-badge">
              <span className="pulse-dot"></span> ● Active
            </span>
          ) : (
            <span className="idle-badge">○ Inactive</span>
          )}
        </div>
      </div>

      {/* Step 3: Compilation Feedback & Sanitized Error Display */}
      {isCompilationError ? (
        <div className="compilation-error-card">
          <div className="compilation-error-header">
            <span className="error-icon">⚠</span>
            <strong>Rule could not be executed</strong>
          </div>
          <p className="compilation-error-message">
            {formatCompilationError(compilationStatus?.message || compilationStatus?.error || "Condition node is missing a value.")}
          </p>
        </div>
      ) : compilationStatus ? (
        <div className={`compilation-pill-bar ${compilationStatus.status || "info"}`}>
          {compilationStatus.message}
        </div>
      ) : null}

      {/* Step 4: Show Last Execution/Trigger */}
      <div className="execution-last-trigger-block">
        <div className="section-label-row">
          <span className="section-label-text">Last Triggered</span>
          {latestTrigger && isFlashing && (
            <span className="realtime-pill">Live Update</span>
          )}
        </div>

        {latestTrigger ? (
          <div className={`last-trigger-info-card ${isFlashing ? "trigger-pulse-glow" : ""}`}>
            <div className="trigger-info-row">
              <span className="trigger-label">Rule:</span>
              <span className="trigger-val rule-title">{latestTrigger.ruleName || ruleName}</span>
            </div>
            <div className="trigger-info-row">
              <span className="trigger-label">Sensor:</span>
              <span className="trigger-val sensor-code">{latestTrigger.sensorId || "TURBINE-001"}</span>
            </div>
            <div className="trigger-info-row">
              <span className="trigger-label">Value:</span>
              <span className="trigger-val metric-code">{formatFieldValue(latestTrigger)}</span>
            </div>
            <div className="trigger-info-row">
              <span className="trigger-label">Time:</span>
              <span className="trigger-val time-code">{latestTrigger.formattedTime}</span>
            </div>
          </div>
        ) : (
          <div className="no-triggers-yet-state">
            <span className="waiting-pulse">⏳</span>
            <p>Awaiting live telemetry threshold crossings...</p>
          </div>
        )}
      </div>

      {/* Step 7: Recent Executions History Component */}
      <ExecutionHistory
        ruleId={ruleId}
        ruleName={ruleName}
        sensorId={latestTrigger?.sensorId || "TURBINE-001"}
        field={latestTrigger?.field || "temperature"}
        threshold={80}
      />
    </div>
  );
}
