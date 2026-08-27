import React, { useState, useEffect } from "react";
import { subscribeToRuleTrigger } from "../services/socket";

/**
 * RuleExecutionStatus Component (Steps 7, 8, 13)
 *
 * Displays in-place rule execution monitoring & live trigger feedback
 * inside the Rule Builder.
 *
 * Receives `rule:triggered` events from Backend RxJS Rule Engine via Socket.IO:
 * {
 *   ruleId: "...",
 *   ruleName: "High Temperature Alert",
 *   sensorId: "TURBINE-001",
 *   field: "temperature",
 *   value: 85,
 *   timestamp: "..."
 * }
 *
 * Note: Member 4 handles global dashboard toasts — this component focuses on
 * rule-level execution monitoring inside Rule Builder / Details.
 */
export default function RuleExecutionStatus({
  ruleId,
  ruleName,
  isRuleActive = true,
  compilationStatus,
  onTriggerUpdate,
}) {
  const [latestTrigger, setLatestTrigger] = useState(null);
  const [triggerHistory, setTriggerHistory] = useState([]);
  const [isFlashing, setIsFlashing] = useState(false);

  useEffect(() => {
    // Subscribe to Rule Engine live triggers
    const unsubscribe = subscribeToRuleTrigger((data) => {
      if (!data) return;

      const isMatchingRule =
        !ruleId ||
        data.ruleId === ruleId ||
        (ruleName && data.ruleName && data.ruleName.trim() === ruleName.trim());

      if (isMatchingRule) {
        const enriched = {
          ...data,
          formattedTime: data.timestamp
            ? new Date(data.timestamp).toLocaleTimeString(undefined, {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })
            : new Date().toLocaleTimeString(),
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
    if (!trigger) return "";
    const field = trigger.field || "temperature";
    const val = trigger.value !== undefined && trigger.value !== null ? trigger.value : "--";
    const unit = field === "temperature" ? "°C" : field === "pressure" ? " PSI" : field === "humidity" ? "%" : field === "rpm" ? " RPM" : "";
    const label = field.charAt(0).toUpperCase() + field.slice(1);
    return `${label}: ${val}${unit}`;
  };

  return (
    <div className="rule-execution-status-panel">
      <div className="execution-panel-header">
        <div className="panel-title-wrap">
          <span className="panel-icon">⚡</span>
          <h4>Rule Runtime & Trigger Monitor</h4>
        </div>
        <div className="execution-runtime-badge">
          {isRuleActive ? (
            <span className="live-pulse-badge">
              <span className="pulse-dot"></span> Pipeline Active
            </span>
          ) : (
            <span className="idle-badge">○ Pipeline Stopped</span>
          )}
        </div>
      </div>

      {/* Compilation Feedback Display */}
      {compilationStatus && (
        <div className={`compilation-pill-bar ${compilationStatus.status || "info"}`}>
          {compilationStatus.message}
        </div>
      )}

      {/* Live Trigger Feedback Card (Step 7) */}
      {latestTrigger ? (
        <div className={`live-trigger-card ${isFlashing ? "trigger-pulse-glow" : ""}`}>
          <div className="trigger-card-top">
            <span className="trigger-alert-badge">⚡ Rule Triggered</span>
            <span className="trigger-time-stamp">{latestTrigger.formattedTime}</span>
          </div>

          <div className="trigger-details-body">
            <h5 className="trigger-rule-name">
              {latestTrigger.ruleName || ruleName || "Rule Alert"}
            </h5>
            <div className="trigger-meta-row">
              <span className="trigger-sensor-tag">
                🔌 Sensor: <strong>{latestTrigger.sensorId || "TURBINE-001"}</strong>
              </span>
              <span className="trigger-metric-value">
                📊 {formatFieldValue(latestTrigger)}
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="no-triggers-yet-state">
          <span className="waiting-pulse">⏳</span>
          <p>Awaiting live telemetry threshold crossings...</p>
        </div>
      )}

      {/* Trigger History (Step 8) */}
      {triggerHistory.length > 1 && (
        <div className="trigger-history-section">
          <span className="history-section-title">Recent Triggers:</span>
          <div className="history-list">
            {triggerHistory.slice(1).map((item, idx) => (
              <div key={idx} className="history-item-row">
                <span className="history-time">{item.formattedTime}</span>
                <span className="history-sensor">{item.sensorId}</span>
                <span className="history-val">{formatFieldValue(item)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
