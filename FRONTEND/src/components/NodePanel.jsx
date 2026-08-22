import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { formatTriggerTime } from "../context/TelemetryContext";

const NODE_CATEGORIES = [
  {
    title: "DATA SOURCES",
    items: [
      {
        id: "temp",
        nodeType: "sensorNode",
        label: "Temperature",
        icon: "🌡️",
        sensor: "temperature",
        sensorId: "T-001"
      },
      {
        id: "humidity",
        nodeType: "sensorNode",
        label: "Humidity",
        icon: "💧",
        sensor: "humidity",
        sensorId: "H-002"
      },
      {
        id: "pressure",
        nodeType: "sensorNode",
        label: "Pressure",
        icon: "⏲️",
        sensor: "pressure",
        sensorId: "P-003"
      },
      {
        id: "rpm",
        nodeType: "sensorNode",
        label: "RPM",
        icon: "🔄",
        sensor: "rpm",
        sensorId: "R-004"
      }
    ]
  },
  {
    title: "PROCESSING",
    items: [
      {
        id: "mavg",
        nodeType: "processingNode",
        label: "Moving Average",
        icon: "📈",
        window: 5
      },
      {
        id: "avg",
        nodeType: "processingNode",
        label: "Average",
        icon: "📊",
        window: 10
      },
      {
        id: "min",
        nodeType: "processingNode",
        label: "Minimum Window",
        icon: "⬇️",
        window: 5
      },
      {
        id: "max",
        nodeType: "processingNode",
        label: "Maximum Window",
        icon: "⬆️",
        window: 5
      }
    ]
  },
  {
    title: "CONDITIONS",
    items: [
      {
        id: "gt",
        nodeType: "conditionNode",
        label: "Greater Than",
        icon: ">",
        operator: ">",
        value: 80
      },
      {
        id: "lt",
        nodeType: "conditionNode",
        label: "Less Than",
        icon: "<",
        operator: "<",
        value: 20
      },
      {
        id: "eq",
        nodeType: "conditionNode",
        label: "Equals",
        icon: "=",
        operator: "=",
        value: 50
      }
    ]
  },
  {
    title: "ACTIONS",
    items: [
      {
        id: "sms",
        nodeType: "alertNode",
        label: "SMS Alert",
        icon: "📱",
        actionType: "SMS",
        phone: "+919876543210",
        severity: "High"
      },
      {
        id: "email",
        nodeType: "alertNode",
        label: "Email Alert",
        icon: "✉️",
        actionType: "Email",
        email: "admin@nexusflow.io",
        severity: "Medium"
      },
      {
        id: "alert",
        nodeType: "alertNode",
        label: "System Alert",
        icon: "🚨",
        actionType: "System",
        severity: "Critical"
      }
    ]
  }
];

export default function NodePanel({
  activeTab = "nodes",
  setActiveTab,
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
      {/* Panel Top Tabs */}
      <div className="panel-tab-bar">
        <button
          type="button"
          className={`panel-tab-btn ${activeTab === "nodes" ? "active" : ""}`}
          onClick={() => handleTabChange("nodes")}
        >
          <span>🧩</span>
          <span>Nodes</span>
        </button>
        <button
          type="button"
          className={`panel-tab-btn ${activeTab === "rules" ? "active" : ""}`}
          onClick={() => handleTabChange("rules")}
        >
          <span>📋</span>
          <span>Saved Rules</span>
          {savedRules.length > 0 && (
            <span className="panel-tab-count">{savedRules.length}</span>
          )}
        </button>
      </div>

      {activeTab === "nodes" ? (
        <>
          <div className="panel-header">
            <h3>Node Library</h3>
            <p className="panel-subtitle">Drag & drop nodes into canvas</p>
          </div>

          <div className="node-categories">
            {NODE_CATEGORIES.map((category) => (
              <div key={category.title} className="category-section">
                <h4 className="category-title">{category.title}</h4>
                <div className="category-items">
                  {category.items.map((item) => (
                    <div
                      key={item.id}
                      className="draggable-node-item"
                      onDragStart={(event) => onDragStart(event, item)}
                      draggable
                    >
                      <span className="item-icon">{item.icon}</span>
                      <span className="item-label">{item.label}</span>
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

