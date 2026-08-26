import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { formatTriggerTime } from "../context/TelemetryContext";

const NODE_CATEGORIES = [
  {
    title: "DATA SOURCES",
    badge: "Source",
    items: [
      {
        id: "sensor-generic",
        nodeType: "sensor",
        label: "Sensor",
        icon: "🔌",
        sensorId: "TURBINE-001",
        field: "temperature",
        sensor: "temperature",
        unit: "°C"
      },
      {
        id: "temp-turbine",
        nodeType: "sensor",
        label: "Temperature (Turbine 1)",
        icon: "🌡️",
        sensorId: "TURBINE-001",
        field: "temperature",
        sensor: "temperature",
        unit: "°C"
      },
      {
        id: "pressure-boiler",
        nodeType: "sensor",
        label: "Pressure (Boiler 101)",
        icon: "⏲️",
        sensorId: "BOILER-101",
        field: "pressure",
        sensor: "pressure",
        unit: "PSI"
      },
      {
        id: "humidity-turbine",
        nodeType: "sensor",
        label: "Humidity (Turbine 2)",
        icon: "💧",
        sensorId: "TURBINE-002",
        field: "humidity",
        sensor: "humidity",
        unit: "%"
      },
      {
        id: "rpm-turbine",
        nodeType: "sensor",
        label: "RPM (Turbine 3)",
        icon: "🔄",
        sensorId: "TURBINE-003",
        field: "rpm",
        sensor: "rpm",
        unit: "RPM"
      }
    ]
  },
  {
    title: "OPERATIONS",
    badge: "Process",
    items: [
      {
        id: "cond-gt",
        nodeType: "condition",
        label: "Condition (> 80)",
        icon: ">",
        operator: ">",
        value: 80,
        field: "temperature"
      },
      {
        id: "cond-lt",
        nodeType: "condition",
        label: "Condition (< 20)",
        icon: "<",
        operator: "<",
        value: 20,
        field: "temperature"
      },
      {
        id: "cond-gte",
        nodeType: "condition",
        label: "Condition (>= 90)",
        icon: ">=",
        operator: ">=",
        value: 90,
        field: "temperature"
      },
      {
        id: "cond-lte",
        nodeType: "condition",
        label: "Condition (<= 40)",
        icon: "<=",
        operator: "<=",
        value: 40,
        field: "temperature"
      },
      {
        id: "cond-eq",
        nodeType: "condition",
        label: "Condition (== 50)",
        icon: "==",
        operator: "==",
        value: 50,
        field: "temperature"
      },
      {
        id: "cond-neq",
        nodeType: "condition",
        label: "Condition (!= 0)",
        icon: "!=",
        operator: "!=",
        value: 0,
        field: "temperature"
      },
      {
        id: "math-mavg",
        nodeType: "math",
        label: "Math / Moving Avg (5)",
        icon: "📈",
        operation: "movingAverage",
        window: 5
      },
      {
        id: "math-avg",
        nodeType: "math",
        label: "Math / Average (10)",
        icon: "📊",
        operation: "average",
        window: 10
      },
      {
        id: "math-min",
        nodeType: "math",
        label: "Math / Minimum (5)",
        icon: "⬇️",
        operation: "minimum",
        window: 5
      },
      {
        id: "math-max",
        nodeType: "math",
        label: "Math / Maximum (5)",
        icon: "⬆️",
        operation: "maximum",
        window: 5
      }
    ]
  },
  {
    title: "ACTIONS",
    badge: "Trigger",
    items: [
      {
        id: "act-alert",
        nodeType: "action",
        label: "Alert Trigger",
        icon: "🚨",
        action: "ALERT",
        actionType: "ALERT",
        severity: "HIGH"
      },
      {
        id: "act-notification",
        nodeType: "action",
        label: "Notification",
        icon: "🔔",
        action: "NOTIFICATION",
        actionType: "NOTIFICATION",
        severity: "MEDIUM"
      },
      {
        id: "act-sms",
        nodeType: "action",
        label: "SMS Action",
        icon: "📱",
        action: "SMS",
        actionType: "SMS",
        severity: "HIGH"
      },
      {
        id: "act-system",
        nodeType: "action",
        label: "System Log",
        icon: "📋",
        action: "SYSTEM",
        actionType: "SYSTEM",
        severity: "INFO"
      }
    ]
  }
];

export default function NodePanel({
  activeTab = "nodes",
  setActiveTab,
  onAddNode,
  savedRules = [],
  loadingRules = false,
  loadingRuleId = null,
  deletingRuleId = null,
  togglingRuleId = null,
  selectedRuleId = null,
  ruleTriggers = {},
  onSelectRule,
  onDeleteRule,
  onToggleRuleStatus,
  onRefreshRules,
  onNewRule
}) {
  // Interval tick to refresh "just now" triggers dynamically
  const [, setTick] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    const timer = setInterval(() => {
      setTick((t) => t + 1);
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  const onDragStart = (event, nodeData) => {
    event.dataTransfer.setData("application/reactflow", JSON.stringify(nodeData));
    event.dataTransfer.effectAllowed = "move";
  };

  const handleTabChange = (tab) => {
    if (setActiveTab) {
      setActiveTab(tab);
    }
  };

  return (
    <aside className="node-library-panel">
      <div className="panel-header">
        <div className="panel-header-icon">🧩</div>
        <div>
          <h3>Node Library</h3>
          <p className="panel-subtitle">Drag & drop onto canvas</p>
        </div>
      </div>

      {activeTab === "nodes" ? (
        <>
          <div className="node-categories">
            {NODE_CATEGORIES.map((category) => (
              <div key={category.title} className="category-section">
                <div className="category-header-row">
                  <h4 className="category-title">{category.title}</h4>
                  <span className={`category-badge ${category.badge.toLowerCase()}`}>
                    {category.badge}
                  </span>
                </div>
                <div className="category-items">
                  {category.items.map((item) => (
                    <div
                      key={item.id}
                      className="draggable-node-item"
                      onDragStart={(event) => onDragStart(event, item)}
                      onClick={() => onAddNode && onAddNode(item)}
                      draggable
                      title={`Drag or click to add ${item.label} to canvas`}
                    >
                      <span className="item-icon">{item.icon}</span>
                      <span className="item-label">{item.label}</span>
                      <span className="item-add-tag">+ Add</span>
                      <span className="drag-handle-dots">⋮⋮</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="saved-rules-section">
          <div className="saved-rules-toolbar">
            <h4>Saved Pipeline Rules</h4>
            <div style={{ display: "flex", gap: "6px" }}>
              {onNewRule && (
                <button
                  type="button"
                  className="btn-icon-refresh"
                  onClick={onNewRule}
                  title="Create New Blank Rule Canvas"
                >
                  ➕ New
                </button>
              )}
              {onRefreshRules && (
                <button
                  type="button"
                  className="btn-icon-refresh"
                  onClick={onRefreshRules}
                  disabled={loadingRules}
                  title="Refresh Rules List"
                >
                  {loadingRules ? "⏳" : "🔄"}
                </button>
              )}
            </div>
          </div>

          {loadingRules ? (
            <div className="saved-rules-empty">
              <span>⏳ Loading rules from backend...</span>
            </div>
          ) : savedRules.length === 0 ? (
            <div className="saved-rules-empty">
              <span className="empty-icon">📁</span>
              <p>No saved rules found on backend database.</p>
              {onNewRule && (
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ fontSize: "11px" }}
                  onClick={onNewRule}
                >
                  Create Your First Rule
                </button>
              )}
            </div>
          ) : (
            <div className="saved-rules-list">
              {savedRules.map((rule) => {
                const ruleId = rule._id || rule.id;
                const isSelected = selectedRuleId === ruleId;
                const isLoadingThis = loadingRuleId === ruleId;
                const isDeletingThis = deletingRuleId === ruleId;
                const isTogglingThis = togglingRuleId === ruleId;
                const nodeCount = Array.isArray(rule.nodes) ? rule.nodes.length : 0;
                const edgeCount = Array.isArray(rule.edges) ? rule.edges.length : 0;

                // Steps 3, 4, 5: Match triggered rule and format trigger status + timestamp
                const triggerInfo =
                  (ruleId && ruleTriggers[ruleId]) ||
                  (ruleId && ruleTriggers[String(ruleId)]) ||
                  (rule.id && ruleTriggers[rule.id]) ||
                  null;

                const isJustNow = Boolean(
                  triggerInfo &&
                    triggerInfo.triggeredAtMs &&
                    Date.now() - triggerInfo.triggeredAtMs < 60000
                );

                const formattedTime = triggerInfo?.timestamp
                  ? formatTriggerTime(triggerInfo.timestamp)
                  : null;

                return (
                  <div
                    key={ruleId}
                    className={`saved-rule-card ${isSelected ? "active-selected" : ""} ${isLoadingThis ? "loading" : ""} ${isJustNow ? "card-triggered" : ""}`}
                    onClick={() => {
                      if (!isLoadingThis && !isDeletingThis && onSelectRule) {
                        onSelectRule(ruleId);
                      }
                    }}
                    title={
                      isLoadingThis
                        ? "Loading rule..."
                        : "Click to open this rule into the visual canvas"
                    }
                  >
                    <div className="saved-rule-top">
                      <h5 className="saved-rule-title">
                        {rule.name || "Untitled Rule"}
                      </h5>
                      {isLoadingThis && (
                        <span style={{ fontSize: "10px", color: "#6366f1", fontWeight: "600" }}>
                          Loading...
                        </span>
                      )}
                    </div>

                    {rule.description && (
                      <p className="saved-rule-desc">{rule.description}</p>
                    )}

                    {/* Step 4 & 5: Live Trigger Status & Last Trigger Time */}
                    <div className="rule-trigger-status-box">
                      {isJustNow ? (
                        <div className="trigger-status-badge just-now">
                          <span className="trigger-icon">⚠</span>
                          <span className="trigger-headline">Triggered just now</span>
                          {formattedTime && (
                            <span className="trigger-time-tag">{formattedTime}</span>
                          )}
                        </div>
                      ) : triggerInfo && formattedTime ? (
                        <div className="trigger-status-badge historical">
                          <span className="trigger-icon">🕒</span>
                          <span className="trigger-headline">
                            Last Triggered: {formattedTime}
                          </span>
                        </div>
                      ) : (
                        <div className="trigger-status-badge normal">
                          <span className="trigger-dot">○</span>
                          <span className="trigger-headline">No recent trigger</span>
                        </div>
                      )}

                      {/* Step 7: View Alert button — only show when rule was triggered */}
                      {triggerInfo && (
                        <button
                          type="button"
                          className="btn-view-alert"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/alerts?ruleId=${ruleId}`);
                          }}
                          title="View related alert for this rule"
                        >
                          View Alert →
                        </button>
                      )}
                    </div>

                    <div className="saved-rule-footer">
                      <span className="saved-rule-meta">
                        {nodeCount} nodes • {edgeCount} edges
                      </span>

                      <div
                        className="saved-rule-actions"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          className={`rule-status-toggle ${rule.isActive !== false ? "active" : "inactive"}`}
                          disabled={isTogglingThis || isDeletingThis}
                          onClick={() =>
                            onToggleRuleStatus &&
                            onToggleRuleStatus(ruleId, rule.isActive !== false)
                          }
                          title={
                            rule.isActive !== false
                              ? "Active Rule (Click to disable)"
                              : "Disabled Rule (Click to enable)"
                          }
                        >
                          {/* Step 8: Show ○ Disabled when isActive = false */}
                          {isTogglingThis
                            ? "Updating..."
                            : rule.isActive !== false
                            ? "● Active"
                            : "○ Disabled"}
                        </button>

                        {onDeleteRule && (
                          <button
                            type="button"
                            className="rule-delete-icon-btn"
                            disabled={isDeletingThis || isTogglingThis}
                            onClick={() => {
                              if (
                                window.confirm(
                                  `Are you sure you want to delete this rule?`
                                )
                              ) {
                                onDeleteRule(ruleId);
                              }
                            }}
                            title="Delete Rule"
                          >
                            {isDeletingThis ? "..." : "🗑️"}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </aside>
  );
}

