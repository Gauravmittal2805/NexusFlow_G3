import React, { useState, useEffect } from "react";
import { subscribeToRuleTrigger, subscribeToTelemetry, connectSocket } from "../services/socket";

/**
 * ExecutionHistory Component (Step 7)
 *
 * Displays a lightweight execution history section for Rule Details & Monitor:
 *
 * Recent Executions
 * ✓ 10:32:14 Temperature = 85°C
 * ✓ 10:31:40 Temperature = 83°C
 * ✕ 10:30:55 Temperature = 78°C
 *
 * Lightweight, real-time responsive via Socket.IO events.
 */
export default function ExecutionHistory({
  ruleId,
  ruleName = "High Temperature Alert",
  sensorId = "TURBINE-001",
  field = "temperature",
  operator = ">",
  threshold = 80,
  maxItems = 5,
  initialExecutions = null,
}) {
  const [executions, setExecutions] = useState(() => {
    if (Array.isArray(initialExecutions) && initialExecutions.length > 0) {
      return initialExecutions;
    }
    // Default sample execution seed to demonstrate UI immediately
    return [
      { id: "e-1", status: "passed", time: "10:32:14", field: "Temperature", value: 85, unit: "°C" },
      { id: "e-2", status: "passed", time: "10:31:40", field: "Temperature", value: 83, unit: "°C" },
      { id: "e-3", status: "failed", time: "10:30:55", field: "Temperature", value: 78, unit: "°C" },
    ];
  });

  const formatUnit = (fld) => {
    const lower = (fld || "").toLowerCase();
    if (lower.includes("temp")) return "°C";
    if (lower.includes("press")) return " PSI";
    if (lower.includes("humid")) return "%";
    if (lower.includes("rpm")) return " RPM";
    return "";
  };

  const formatFieldName = (fld) => {
    if (!fld) return "Temperature";
    return fld.charAt(0).toUpperCase() + fld.slice(1);
  };

  const formatTime = (ts) => {
    if (!ts) return new Date().toLocaleTimeString();
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

  useEffect(() => {
    connectSocket();

    // 1. Listen for positive rule triggers (✓ Passed)
    const unsubTrigger = subscribeToRuleTrigger((data) => {
      if (!data) return;

      const isMatching =
        !ruleId ||
        data.ruleId === ruleId ||
        (ruleName && data.ruleName && data.ruleName.trim().toLowerCase() === ruleName.trim().toLowerCase());

      if (isMatching) {
        const itemField = data.field || field || "temperature";
        const newEntry = {
          id: `trig-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
          status: "passed",
          time: formatTime(data.timestamp),
          field: formatFieldName(itemField),
          value: data.value !== undefined && data.value !== null ? data.value : 85,
          unit: formatUnit(itemField),
        };

        setExecutions((prev) => [newEntry, ...prev.slice(0, maxItems - 1)]);
      }
    });

    // 2. Listen for live sensor telemetry readings (evaluates ✓ / ✕)
    const unsubTelemetry = subscribeToTelemetry((data) => {
      if (!data) return;

      const incomingSensor = data.sensorId || data.sensor;
      const targetSensor = sensorId || "TURBINE-001";

      if (incomingSensor && targetSensor && incomingSensor.trim().toLowerCase() === targetSensor.trim().toLowerCase()) {
        const itemField = (field || "temperature").toLowerCase();
        const readingValue = data[itemField] ?? data.temperature ?? data.value;

        if (readingValue !== undefined && readingValue !== null) {
          // Evaluate condition against threshold
          const threshNum = Number(threshold) || 80;
          const valNum = Number(readingValue);
          let conditionPassed = false;

          switch (operator) {
            case ">":  conditionPassed = valNum > threshNum; break;
            case ">=": conditionPassed = valNum >= threshNum; break;
            case "<":  conditionPassed = valNum < threshNum; break;
            case "<=": conditionPassed = valNum <= threshNum; break;
            case "==":
            case "===": conditionPassed = valNum === threshNum; break;
            case "!=":
            case "!==": conditionPassed = valNum !== threshNum; break;
            default: conditionPassed = valNum > threshNum;
          }

          // If condition is false, record non-matching evaluation (✕)
          if (!conditionPassed) {
            const newEntry = {
              id: `eval-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
              status: "failed",
              time: formatTime(data.timestamp),
              field: formatFieldName(itemField),
              value: valNum,
              unit: formatUnit(itemField),
            };

            setExecutions((prev) => [newEntry, ...prev.slice(0, maxItems - 1)]);
          }
        }
      }
    });

    return () => {
      unsubTrigger();
      unsubTelemetry();
    };
  }, [ruleId, ruleName, sensorId, field, operator, threshold, maxItems]);

  return (
    <div className="execution-history-widget">
      <div className="execution-history-header">
        <h5 className="execution-history-title">Recent Executions</h5>
      </div>

      <div className="execution-history-items">
        {executions.map((exec) => (
          <div
            key={exec.id}
            className={`execution-history-item ${exec.status === "passed" ? "item-passed" : "item-failed"}`}
          >
            <span className={`execution-status-icon ${exec.status === "passed" ? "icon-passed" : "icon-failed"}`}>
              {exec.status === "passed" ? "✓" : "✕"}
            </span>
            <span className="execution-timestamp">{exec.time}</span>
            <span className="execution-metric-text">
              {exec.field} = {exec.value}{exec.unit}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
