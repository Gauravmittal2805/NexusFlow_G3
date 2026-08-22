import React, { useState, useEffect } from "react";

export default function SavedRulesPanel({
  activeRuleId,
  onLoadRule,
  onNewRule,
  onDeleteRule,
  onViewJson,
  onClose
}) {
  const [savedRules, setSavedRules] = useState([]);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

  const refreshRules = () => {
    try {
      const raw = localStorage.getItem("nexusflow_rules");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setSavedRules(parsed);
          return;
        }
      }
    } catch (e) {
      console.error("Failed to read nexusflow_rules from localStorage", e);
    }
    setSavedRules([]);
  };

  useEffect(() => {
    refreshRules();
  }, [activeRuleId]);

  const handleDelete = (id, e) => {
    e.stopPropagation();
    if (onDeleteRule) {
      onDeleteRule(id);
      refreshRules();
      setDeleteConfirmId(null);
    }
  };

  return (
    <aside className="saved-rules-panel">
      <div className="rules-panel-header">
        <div className="rules-header-title">
          <span className="rules-header-icon">📂</span>
          <div>
            <h3>My Rules</h3>
            <span className="rules-count">{savedRules.length} saved pipeline{savedRules.length === 1 ? "" : "s"}</span>
          </div>
        </div>
        <div className="rules-header-actions">
          <button className="btn-new-rule" onClick={onNewRule} title="Create a blank new rule">
            + New Rule
          </button>
          {onClose && (
            <button className="rules-close-btn" onClick={onClose} title="Close Rules Panel">
              ✕
            </button>
          )}
        </div>
      </div>

      <div className="rules-list-container">
        {savedRules.length === 0 ? (
          <div className="rules-empty-state">
            <div className="empty-rules-icon">📋</div>
            <h4>No Saved Rules Yet</h4>
            <p>Construct a flow on the canvas and click <strong>Save Rule</strong> to store your rules locally.</p>
            <button className="btn-create-first" onClick={onNewRule}>
              Create First Rule
            </button>
          </div>
        ) : (
          <div className="rules-list">
            {savedRules.map((rule) => {
              const isActive = rule.id === activeRuleId;
              const nodeCount = rule.nodes ? rule.nodes.length : 0;
              const edgeCount = rule.edges ? rule.edges.length : 0;
              const dateStr = rule.updatedAt
                ? new Date(rule.updatedAt).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit"
                  })
                : "Recently";

              return (
                <div
                  key={rule.id}
                  className={`saved-rule-card ${isActive ? "is-active" : ""}`}
                  onClick={() => onLoadRule(rule)}
                >
                  <div className="rule-card-header">
                    <span className="rule-card-name" title={rule.name}>
                      {rule.name || "Untitled Rule"}
                    </span>
                    {isActive && <span className="active-pill">Active</span>}
                  </div>

                  <div className="rule-card-meta">
                    <span>⚡ {nodeCount} nodes, {edgeCount} edges</span>
                    <span>🕒 {dateStr}</span>
                  </div>

                  {deleteConfirmId === rule.id ? (
                    <div className="delete-confirm-box" onClick={(e) => e.stopPropagation()}>
                      <span>Delete rule permanently?</span>
                      <div className="confirm-btns">
                        <button
                          className="btn-confirm-delete"
                          onClick={(e) => handleDelete(rule.id, e)}
                        >
                          Confirm
                        </button>
                        <button
                          className="btn-confirm-cancel"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteConfirmId(null);
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="rule-card-actions" onClick={(e) => e.stopPropagation()}>
                      <button
                        className="btn-rule-action edit"
                        onClick={() => onLoadRule(rule)}
                        title="Load into Canvas & Edit"
                      >
                        ✏️ Edit
                      </button>
                      <button
                        className="btn-rule-action json"
                        onClick={() => onViewJson && onViewJson(rule)}
                        title="View Clean JSON Payload"
                      >
                        🔍 JSON
                      </button>
                      <button
                        className="btn-rule-action delete"
                        onClick={() => setDeleteConfirmId(rule.id)}
                        title="Delete Rule"
                      >
                        🗑️
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}
