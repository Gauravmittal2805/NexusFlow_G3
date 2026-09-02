import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { getRules, deleteRule, updateRuleStatus } from "../services/ruleService";
import { subscribeToRuleTrigger, connectSocket } from "../services/socket";
import RuleCard from "../components/RuleCard";

export default function Rules() {
  const navigate = useNavigate();

  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL"); // ALL, ACTIVE, DISABLED
  const [togglingId, setTogglingId] = useState(null);
  const [flashingRuleId, setFlashingRuleId] = useState(null);
  const [feedbackToast, setFeedbackToast] = useState(null);

  const showToast = (type, message) => {
    setFeedbackToast({ type, message });
    setTimeout(() => setFeedbackToast(null), 4000);
  };

  // Step 2: Fetch rules from GET /api/rules
  const fetchRules = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await getRules();
      const fetchedRules = res.data?.rules || res.data || [];
      if (Array.isArray(fetchedRules)) {
        setRules(fetchedRules);
      } else {
        setRules([]);
      }
    } catch (err) {
      console.error("Failed to load rules from backend:", err);
      // Fallback to localStorage cache if backend has an issue
      try {
        const storedRaw = localStorage.getItem("nexusflow_rules");
        if (storedRaw) {
          const parsed = JSON.parse(storedRaw);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setRules(parsed);
            setError("Note: Loaded from offline cache. Could not reach server.");
            setLoading(false);
            return;
          }
        }
      } catch (storageErr) {
        console.warn("Storage fallback error:", storageErr);
      }

      setError("Failed to load rules.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  // Connect WebSocket for real-time trigger feedback
  useEffect(() => {
    connectSocket();

    const unsubscribe = subscribeToRuleTrigger((data) => {
      if (!data) return;

      const triggerRuleId = data.ruleId;
      const triggerRuleName = data.ruleName;

      setRules((prevRules) =>
        prevRules.map((rule) => {
          const ruleId = rule._id || rule.id;
          const isMatch =
            (triggerRuleId &&
              (ruleId === triggerRuleId ||
                rule._id === triggerRuleId ||
                rule.id === triggerRuleId)) ||
            (triggerRuleName &&
              rule.name &&
              rule.name.trim().toLowerCase() ===
                triggerRuleName.trim().toLowerCase());

          if (isMatch) {
            setFlashingRuleId(ruleId);
            setTimeout(() => setFlashingRuleId(null), 2500);

            return {
              ...rule,
              lastTriggered: data.timestamp || new Date().toISOString(),
              lastTriggeredSensor: data.sensorId || rule.lastTriggeredSensor,
              lastTriggeredValue: data.value !== undefined ? data.value : rule.lastTriggeredValue,
              lastTriggeredField: data.field || "temperature",
            };
          }
          return rule;
        })
      );
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // Step 5: Enable / Disable Rule with backend synchronization
  const handleToggleStatus = async (rule, e) => {
    e.stopPropagation();
    const ruleId = rule._id || rule.id;
    const isCurrentActive =
      rule.status !== undefined
        ? rule.status === "ACTIVE" || rule.status === "RUNNING"
        : rule.isActive !== false;
    const newActive = !isCurrentActive;

    setTogglingId(ruleId);

    try {
      if (rule._id && /^[0-9a-fA-F]{24}$/.test(rule._id)) {
        await updateRuleStatus(rule._id, newActive);
      }

      setRules((prev) =>
        prev.map((r) => {
          if ((r._id || r.id) === ruleId) {
            return {
              ...r,
              isActive: newActive,
              status: newActive ? "ACTIVE" : "INACTIVE",
            };
          }
          return r;
        })
      );

      // Also persist to localStorage cache
      try {
        const raw = localStorage.getItem("nexusflow_rules");
        if (raw) {
          const list = JSON.parse(raw);
          const updated = list.map((r) =>
            r._id === ruleId || r.id === ruleId
              ? { ...r, isActive: newActive, status: newActive ? "ACTIVE" : "INACTIVE" }
              : r
          );
          localStorage.setItem("nexusflow_rules", JSON.stringify(updated));
        }
      } catch (e) {}

      showToast(
        "success",
        `Rule "${rule.name || 'Rule'}" is now ${newActive ? "Active" : "Disabled"}.`
      );
    } catch (err) {
      console.error("Failed to update status on backend:", err);
      showToast("error", "Failed to update rule status on server.");
    } finally {
      setTogglingId(null);
    }
  };

  // Step 6: Delete Rule
  const handleDelete = async (ruleId, e) => {
    if (e && e.stopPropagation) e.stopPropagation();

    try {
      if (ruleId && /^[0-9a-fA-F]{24}$/.test(ruleId)) {
        await deleteRule(ruleId);
      }

      // Remove from localStorage
      try {
        const raw = localStorage.getItem("nexusflow_rules");
        if (raw) {
          const list = JSON.parse(raw);
          const filtered = list.filter((r) => r._id !== ruleId && r.id !== ruleId);
          localStorage.setItem("nexusflow_rules", JSON.stringify(filtered));
        }
      } catch (e) {}

      setRules((prev) => prev.filter((r) => (r._id || r.id) !== ruleId));
      showToast("success", "Rule deleted successfully.");
    } catch (err) {
      console.error("Failed to delete rule:", err);
      showToast("error", "Failed to delete rule from backend.");
    }
  };

  // Step 3 & Step 4: Open rule in Rule Builder
  const handleViewRule = (rule) => {
    const targetId = rule._id || rule.id;
    navigate(`/flow?id=${targetId}`);
  };

  // Filter rules based on search and status
  const filteredRules = rules.filter((rule) => {
    const isRuleActive =
      rule.status !== undefined
        ? rule.status === "ACTIVE" || rule.status === "RUNNING"
        : rule.isActive !== false;

    if (statusFilter === "ACTIVE" && !isRuleActive) return false;
    if (statusFilter === "DISABLED" && isRuleActive) return false;

    if (!searchQuery.trim()) return true;

    const q = searchQuery.toLowerCase();
    const nameMatch = (rule.name || "").toLowerCase().includes(q);
    const descMatch = (rule.description || "").toLowerCase().includes(q);
    const sensorMatch = (rule.nodes || []).some(
      (n) =>
        (n.data?.sensorId || "").toLowerCase().includes(q) ||
        (n.data?.sensor || "").toLowerCase().includes(q) ||
        (n.data?.field || "").toLowerCase().includes(q)
    );

    return nameMatch || descMatch || sensorMatch;
  });

  const activeCount = rules.filter((r) =>
    r.status !== undefined
      ? r.status === "ACTIVE" || r.status === "RUNNING"
      : r.isActive !== false
  ).length;

  return (
    <div className="rules-page-container" style={{ padding: "24px", maxWidth: "1200px", margin: "0 auto" }}>
      {/* Toast Notification */}
      {feedbackToast && (
        <div
          style={{
            position: "fixed",
            bottom: "24px",
            right: "24px",
            background: feedbackToast.type === "error" ? "#dc2626" : "#059669",
            color: "#ffffff",
            padding: "12px 20px",
            borderRadius: "8px",
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            zIndex: 9999,
            fontWeight: "500",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <span>{feedbackToast.type === "error" ? "⚠" : "✓"}</span>
          <span>{feedbackToast.message}</span>
        </div>
      )}

      {/* Page Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "24px",
          flexWrap: "wrap",
          gap: "16px",
        }}
      >
        <div>
          <h1 style={{ fontSize: "28px", fontWeight: "700", margin: "0 0 6px 0", color: "#0f172a" }}>
            My Rules
          </h1>
          <p style={{ margin: 0, color: "#64748b", fontSize: "14px" }}>
            Manage and monitor automated IoT telemetry condition pipelines ({rules.length} total, {activeCount} active).
          </p>
        </div>

        <div style={{ display: "flex", gap: "12px" }}>
          <button
            onClick={fetchRules}
            disabled={loading}
            style={{
              padding: "9px 16px",
              background: "#f1f5f9",
              border: "1px solid #cbd5e1",
              borderRadius: "8px",
              cursor: "pointer",
              fontWeight: "500",
              color: "#334155",
            }}
            title="Refresh rules list"
          >
            {loading ? "Refreshing..." : "🔄 Refresh"}
          </button>
          <button
            onClick={() => navigate("/flow")}
            style={{
              padding: "9px 18px",
              background: "#4f46e5",
              color: "#ffffff",
              border: "none",
              borderRadius: "8px",
              cursor: "pointer",
              fontWeight: "600",
              boxShadow: "0 2px 4px rgba(79, 70, 229, 0.2)",
            }}
          >
            + Create Rule
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div
        style={{
          display: "flex",
          gap: "16px",
          marginBottom: "24px",
          flexWrap: "wrap",
          background: "#ffffff",
          padding: "16px",
          borderRadius: "12px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
          border: "1px solid #e2e8f0",
        }}
      >
        <div style={{ flex: "1 1 280px" }}>
          <input
            type="text"
            placeholder="Search by rule name, sensor ID, or metric..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: "100%",
              padding: "10px 14px",
              border: "1px solid #cbd5e1",
              borderRadius: "8px",
              fontSize: "14px",
              boxSizing: "border-box",
            }}
          />
        </div>

        <div style={{ display: "flex", gap: "8px" }}>
          <button
            onClick={() => setStatusFilter("ALL")}
            style={{
              padding: "8px 14px",
              borderRadius: "8px",
              border: "1px solid",
              borderColor: statusFilter === "ALL" ? "#4f46e5" : "#cbd5e1",
              background: statusFilter === "ALL" ? "#eef2ff" : "#ffffff",
              color: statusFilter === "ALL" ? "#4f46e5" : "#475569",
              fontWeight: statusFilter === "ALL" ? "600" : "500",
              cursor: "pointer",
            }}
          >
            All ({rules.length})
          </button>
          <button
            onClick={() => setStatusFilter("ACTIVE")}
            style={{
              padding: "8px 14px",
              borderRadius: "8px",
              border: "1px solid",
              borderColor: statusFilter === "ACTIVE" ? "#10b981" : "#cbd5e1",
              background: statusFilter === "ACTIVE" ? "#ecfdf5" : "#ffffff",
              color: statusFilter === "ACTIVE" ? "#059669" : "#475569",
              fontWeight: statusFilter === "ACTIVE" ? "600" : "500",
              cursor: "pointer",
            }}
          >
            Active ({activeCount})
          </button>
          <button
            onClick={() => setStatusFilter("DISABLED")}
            style={{
              padding: "8px 14px",
              borderRadius: "8px",
              border: "1px solid",
              borderColor: statusFilter === "DISABLED" ? "#ef4444" : "#cbd5e1",
              background: statusFilter === "DISABLED" ? "#fef2f2" : "#ffffff",
              color: statusFilter === "DISABLED" ? "#dc2626" : "#475569",
              fontWeight: statusFilter === "DISABLED" ? "600" : "500",
              cursor: "pointer",
            }}
          >
            Disabled ({rules.length - activeCount})
          </button>
        </div>
      </div>

      {/* Rules Content State */}
      {loading ? (
        <div
          style={{
            textAlign: "center",
            padding: "60px 20px",
            background: "#ffffff",
            borderRadius: "12px",
            border: "1px solid #e2e8f0",
          }}
        >
          <div style={{ fontSize: "36px", marginBottom: "12px" }}>⏳</div>
          <h3 style={{ margin: "0 0 6px 0", color: "#334155" }}>Loading rules...</h3>
          <p style={{ margin: 0, color: "#94a3b8", fontSize: "14px" }}>
            Fetching configured rule pipelines from backend...
          </p>
        </div>
      ) : error && rules.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: "60px 20px",
            background: "#ffffff",
            borderRadius: "12px",
            border: "1px solid #fee2e2",
          }}
        >
          <div style={{ fontSize: "36px", marginBottom: "12px" }}>⚠</div>
          <h3 style={{ margin: "0 0 6px 0", color: "#dc2626" }}>Failed to load rules.</h3>
          <p style={{ margin: "0 0 16px 0", color: "#64748b", fontSize: "14px" }}>
            {error}
          </p>
          <button
            onClick={fetchRules}
            style={{
              padding: "8px 16px",
              background: "#4f46e5",
              color: "#ffffff",
              border: "none",
              borderRadius: "8px",
              cursor: "pointer",
              fontWeight: "500",
            }}
          >
            Retry Fetch
          </button>
        </div>
      ) : filteredRules.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: "60px 20px",
            background: "#ffffff",
            borderRadius: "12px",
            border: "1px solid #e2e8f0",
          }}
        >
          <div style={{ fontSize: "36px", marginBottom: "12px" }}>📋</div>
          <h3 style={{ margin: "0 0 6px 0", color: "#334155" }}>No rules found.</h3>
          <p style={{ margin: "0 0 16px 0", color: "#64748b", fontSize: "14px" }}>
            {searchQuery || statusFilter !== "ALL"
              ? "No rules match your search or filter criteria."
              : "Create your first rule pipeline in the Rule Builder."}
          </p>
          <button
            onClick={() => navigate("/flow")}
            style={{
              padding: "10px 20px",
              background: "#4f46e5",
              color: "#ffffff",
              border: "none",
              borderRadius: "8px",
              cursor: "pointer",
              fontWeight: "600",
            }}
          >
            + Create First Rule
          </button>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
            gap: "20px",
          }}
        >
          {filteredRules.map((rule) => {
            const ruleId = rule._id || rule.id;
            return (
              <RuleCard
                key={ruleId}
                rule={rule}
                isFlashing={flashingRuleId === ruleId}
                onView={handleViewRule}
                onToggleStatus={handleToggleStatus}
                onDelete={handleDelete}
                isToggling={togglingId === ruleId}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
