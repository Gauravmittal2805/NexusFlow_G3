import React, { useState, useEffect, useCallback } from "react";
import { getRules, deleteRule } from "../services/ruleService";

export default function SavedRulesPanel({
  activeRuleId,
  onLoadRule,
  onNewRule,
  onDeleteRule,
  onViewJson,
  onClose
}) {
  const [savedRules, setSavedRules] = useState([]);
  const [loading, setLoading] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

  const fetchRules = useCallback(async () => {
    setLoading(true);
    let backendSuccess = false;

    // 1. Try Backend API first (GET /api/rules)
    try {
      const res = await getRules();
      const rules = res.data?.rules || res.data || [];
      if (Array.isArray(rules)) {
        setSavedRules(rules);
        backendSuccess = true;
      }
    } catch (err) {
      console.warn("Backend rules fetch failed, falling back to localStorage:", err.message);
    }

    // 2. Fallback to localStorage if backend failed or returned empty
    if (!backendSuccess) {
      try {
        const raw = localStorage.getItem("nexusflow_rules");
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            setSavedRules(parsed);
          }
        }
      } catch (e) {
        console.error("Failed to read nexusflow_rules from localStorage", e);
      }
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    fetchRules();
  }, [fetchRules, activeRuleId]);

  const handleDelete = async (id, e) => {
    e.stopPropagation();
    try {
      // Try backend delete
      if (id && id.length === 24) {
        await deleteRule(id);
      }
    } catch (err) {
      console.warn("Backend delete rule error:", err.message);
    }

    if (onDeleteRule) {
      onDeleteRule(id);
    }

    // Remove from local state
    setSavedRules((prev) => prev.filter((r) => (r._id || r.id) !== id));
    setDeleteConfirmId(null);
  };

  return (
    <aside className="saved-rules-panel">
      <div className="rules-panel-header">
        <div className="rules-header-title">
          <span className="rules-header-icon">📂</span>
          <div>
            <h3>My Rules</h3>
            <span className="rules-count">
              {savedRules.length} saved pipeline{savedRules.length === 1 ? "" : "s"}
            </span>
          </div>
        </div>
        <div className="rules-header-actions">
          <button
            className="btn-icon-refresh"
            onClick={fetchRules}
            disabled={loading}
            title="Refresh rules list"
            style={{ marginRight: "4px" }}
          >
            {loading ? "⏳" : "🔄"}
          </button>
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
        {loading ? (
          <div className="rules-empty-state">
            <div className="empty-rules-icon">⏳</div>
            <h4>Loading rules...</h4>
          </div>
        ) : savedRules.length === 0 ? (
          <div className="rules-empty-state">
            <div className="empty-rules-icon">📋</div>
            <h4>No Saved Rules Yet</h4>
            <p>Construct a flow on the canvas and click <strong>Save Rule</strong> to store your rule.</p>
            <button className="btn-create-first" onClick={onNewRule}>
              Create First Rule
            </button>
          </div>
        ) : (
          <div className="rules-list">
            {savedRules.map((rule) => {
              const ruleId = rule._id || rule.id;
              const isActive = ruleId === activeRuleId || rule.id === activeRuleId;
              const nodeCount = rule.nodes ? rule.nodes.length : 0;
              const edgeCount = rule.edges ? rule.edges.length : 0;
              const dateStr = rule.createdAt || rule.updatedAt
                ? new Date(rule.createdAt || rule.updatedAt).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit"
                  })
                : "Recently";

              return (
                <div
                  key={ruleId}
                  className={`saved-rule-card ${isActive ? "is-active" : ""}`}
                  onClick={() => onLoadRule(rule)}
                >
                  <div className="rule-card-header">
                    <span className="rule-card-name" title={rule.name}>
                      {rule.name || "Untitled Rule"}
                    </span>
                    {isActive && <span className="active-pill">Active</span>}
                  </div>

                  {rule.description && (
                    <p style={{ fontSize: "12px", color: "#64748b", margin: "2px 0 6px" }}>
                      {rule.description}
                    </p>
                  )}

                  <div className="rule-card-meta">
                    <span>⚡ {nodeCount} nodes, {edgeCount} edges</span>
                    <span>🕒 {dateStr}</span>
                  </div>

                  {deleteConfirmId === ruleId ? (
                    <div className="delete-confirm-box" onClick={(e) => e.stopPropagation()}>
                      <span>Delete rule permanently?</span>
                      <div className="confirm-btns">
                        <button
                          className="btn-confirm-delete"
                          onClick={(e) => handleDelete(ruleId, e)}
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
                        ✏️ Load
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
                        onClick={() => setDeleteConfirmId(ruleId)}
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
