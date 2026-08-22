import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  useNodesState,
  useEdgesState,
  addEdge,
  Background,
  Controls,
  MiniMap,
  useReactFlow
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import NodePanel from "../components/NodePanel";
import SensorNode from "../nodes/SensorNode";
import MovingAverageNode from "../nodes/MovingAverageNode";
import ConditionNode from "../nodes/ConditionNode";
import AlertNode from "../nodes/AlertNode";

import { validateGraph, isValidConnection } from "../utils/graphValidation";
import ruleService from "../services/ruleService";
import { useTelemetry, formatTriggerTime } from "../context/TelemetryContext";

const nodeTypes = {
  sensorNode: SensorNode,
  processingNode: MovingAverageNode,
  movingAverageNode: MovingAverageNode,
  conditionNode: ConditionNode,
  alertNode: AlertNode
};

// Canonical initial rule graph
const defaultInitialNodes = [
  {
    id: "node-1",
    type: "sensorNode",
    position: { x: 260, y: 40 },
    data: {
      label: "Temperature Sensor",
      icon: "🌡️",
      sensor: "temperature",
      sensorId: "T-001"
    }
  },
  {
    id: "node-2",
    type: "movingAverageNode",
    position: { x: 260, y: 200 },
    data: {
      label: "Moving Average",
      icon: "📈",
      operation: "movingAverage",
      window: 5
    }
  },
  {
    id: "node-3",
    type: "conditionNode",
    position: { x: 260, y: 360 },
    data: {
      label: "Greater Than",
      icon: ">",
      operator: ">",
      value: 80
    }
  },
  {
    id: "node-4",
    type: "alertNode",
    position: { x: 260, y: 520 },
    data: {
      label: "SMS Alert",
      icon: "📱",
      actionType: "SMS",
      phone: "+919876543210",
      severity: "High"
    }
  }
];

const defaultInitialEdges = [
  {
    id: "edge-1-2",
    source: "node-1",
    target: "node-2",
    animated: true,
    style: { stroke: "#3b82f6", strokeWidth: 2 }
  },
  {
    id: "edge-2-3",
    source: "node-2",
    target: "node-3",
    animated: true,
    style: { stroke: "#f59e0b", strokeWidth: 2 }
  },
  {
    id: "edge-3-4",
    source: "node-3",
    target: "node-4",
    animated: true,
    style: { stroke: "#ef4444", strokeWidth: 2 }
  }
];

/**
 * Step 10: Centralized user-friendly error message resolver
 */
function getFriendlyErrorMessage(error, defaultMsg) {
  if (!error) return defaultMsg;
  const status = error.response?.status;
  const backendMsg = error.response?.data?.message;

  if (status === 401 || status === 403) {
    return "You don't have permission to perform this action.";
  }
  if (status === 404) {
    return "Rule not found. It may have been deleted.";
  }
  if (
    status === 400 &&
    backendMsg &&
    typeof backendMsg === "string" &&
    !backendMsg.includes("Cast to ObjectId") &&
    !backendMsg.includes("MongoError")
  ) {
    return backendMsg;
  }
  return defaultMsg || "Unable to process request. Please try again.";
}

/**
 * Normalizes backend node types to React Flow node types
 */
function normalizeNodeType(type) {
  if (!type) return "sensorNode";
  const lower = type.toLowerCase();
  if (lower === "sensor" || lower === "sensornode") return "sensorNode";
  if (
    lower === "movingaverage" ||
    lower === "movingaveragenode" ||
    lower === "processing" ||
    lower === "processingnode"
  ) {
    return "movingAverageNode";
  }
  if (lower === "condition" || lower === "conditionnode") return "conditionNode";
  if (
    lower === "alert" ||
    lower === "alertnode" ||
    lower === "sms" ||
    lower === "email" ||
    lower === "system"
  ) {
    return "alertNode";
  }
  return type;
}

function FlowCanvasContent() {
  const reactFlowWrapper = useRef(null);
  const { screenToFlowPosition, fitView } = useReactFlow();
  const { ruleTriggers = {} } = useTelemetry();

  // Rule metadata state
  const [ruleName, setRuleName] = useState(() => {
    try {
      const saved = localStorage.getItem("nexusflow_rule_data");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.name) return parsed.name;
      }
    } catch (e) {}
    return "High Temperature Alert";
  });

  const [ruleDescription, setRuleDescription] = useState(() => {
    try {
      const saved = localStorage.getItem("nexusflow_rule_data");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.description) return parsed.description;
      }
    } catch (e) {}
    return "Alert when temperature exceeds 80°C";
  });

  const [selectedRuleId, setSelectedRuleId] = useState(null);
  const [activeTab, setActiveTab] = useState("nodes");
  const [savedRules, setSavedRules] = useState([]);
  
  // Step 9: Async loading flags for robust state management & multi-click prevention
  const [loadingRules, setLoadingRules] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [loadingRuleId, setLoadingRuleId] = useState(null);
  const [deletingRuleId, setDeletingRuleId] = useState(null);
  const [togglingRuleId, setTogglingRuleId] = useState(null);

  const [toast, setToast] = useState(null);
  const [jsonModalData, setJsonModalData] = useState(null);

  // React Flow graph states
  const [nodes, setNodes, onNodesChange] = useNodesState(() => {
    try {
      const saved = localStorage.getItem("nexusflow_rule_data");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.nodes && parsed.nodes.length > 0) return parsed.nodes;
      }
    } catch (e) {
      console.warn("Could not load nodes from localStorage", e);
    }
    return defaultInitialNodes;
  });

  const [edges, setEdges, onEdgesChange] = useEdgesState(() => {
    try {
      const saved = localStorage.getItem("nexusflow_rule_data");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.edges) return parsed.edges;
      }
    } catch (e) {
      console.warn("Could not load edges from localStorage", e);
    }
    return defaultInitialEdges;
  });

  const showToast = (type, message) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4500);
  };

  // Step 4: Fetch all saved rules from backend (GET /api/rules)
  const fetchRules = useCallback(async () => {
    setLoadingRules(true);
    try {
      const res = await ruleService.getRules();
      if (res.data && res.data.rules) {
        setSavedRules(res.data.rules);
      }
    } catch (err) {
      console.warn("Failed to fetch saved rules from API:", err.message);
    } finally {
      setLoadingRules(false);
    }
  }, []);

  // Fetch rules on component mount
  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  // Handle live node updates
  const updateNodeData = useCallback(
    (nodeId, field, value) => {
      setNodes((nds) =>
        nds.map((node) => {
          if (node.id === nodeId) {
            return {
              ...node,
              data: {
                ...node.data,
                [field]: value
              }
            };
          }
          return node;
        })
      );
    },
    [setNodes]
  );

  // Handle Metric change (updates metric, label, icon, unit, sensorId)
  const handleMetricChange = useCallback(
    (nodeId, newMetricKey, newConfig) => {
      setNodes((nds) =>
        nds.map((node) => {
          if (node.id === nodeId) {
            return {
              ...node,
              data: {
                ...node.data,
                sensor: newMetricKey,
                label: newConfig.label,
                icon: newConfig.icon,
                unit: newConfig.unit,
                sensorId: newConfig.sensorId
              }
            };
          }
          return node;
        })
      );
    },
    [setNodes]
  );

  // Handle Operation change (Moving Avg, Average, Min, Max)
  const handleOpChange = useCallback(
    (nodeId, newOpKey, newConfig) => {
      setNodes((nds) =>
        nds.map((node) => {
          if (node.id === nodeId) {
            return {
              ...node,
              data: {
                ...node.data,
                operation: newOpKey,
                label: newConfig.label,
                icon: newConfig.icon,
                window: node.data.window ?? newConfig.defaultWindow
              }
            };
          }
          return node;
        })
      );
    },
    [setNodes]
  );

  // Handle Condition change (>, <, =, >=, <=)
  const handleConditionChange = useCallback(
    (nodeId, newOp, newConfig) => {
      setNodes((nds) =>
        nds.map((node) => {
          if (node.id === nodeId) {
            return {
              ...node,
              data: {
                ...node.data,
                operator: newOp,
                label: newConfig.label,
                icon: newConfig.icon
              }
            };
          }
          return node;
        })
      );
    },
    [setNodes]
  );

  // Handle Alert/Action change (SMS, Email, System)
  const handleAlertChange = useCallback(
    (nodeId, newAction, newConfig) => {
      setNodes((nds) =>
        nds.map((node) => {
          if (node.id === nodeId) {
            return {
              ...node,
              data: {
                ...node.data,
                actionType: newAction,
                label: newConfig.label,
                icon: newConfig.icon
              }
            };
          }
          return node;
        })
      );
    },
    [setNodes]
  );

  // Duplicate Node
  const duplicateNode = useCallback(
    (nodeId) => {
      setNodes((nds) => {
        const target = nds.find((n) => n.id === nodeId);
        if (!target) return nds;

        const newId = `node-${Date.now()}`;
        const newNode = {
          ...target,
          id: newId,
          position: {
            x: target.position.x + 45,
            y: target.position.y + 45
          },
          selected: true,
          data: { ...target.data }
        };

        showToast("info", `Duplicated node: ${target.data.label}`);
        return nds.map((n) => ({ ...n, selected: false })).concat(newNode);
      });
    },
    [setNodes]
  );

  // Re-attach handlers to nodes on render
  useEffect(() => {
    setNodes((nds) =>
      nds.map((n) => ({
        ...n,
        data: {
          ...n.data,
          onChange: updateNodeData,
          onMetricChange: handleMetricChange,
          onOpChange: handleOpChange,
          onConditionChange: handleConditionChange,
          onAlertChange: handleAlertChange,
          onDuplicate: duplicateNode
        }
      }))
    );
  }, [
    updateNodeData,
    handleMetricChange,
    handleOpChange,
    handleConditionChange,
    handleAlertChange,
    duplicateNode,
    setNodes
  ]);

  // Connection Validator Callback using imported utility
  const checkConnection = useCallback(
    (connection) => isValidConnection(connection, nodes),
    [nodes]
  );

  const onConnect = useCallback(
    (params) =>
      setEdges((eds) =>
        addEdge(
          {
            ...params,
            animated: true,
            style: { stroke: "#6366f1", strokeWidth: 2 }
          },
          eds
        )
      ),
    [setEdges]
  );

  const onDragOver = useCallback((event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event) => {
      event.preventDefault();

      const rawData = event.dataTransfer.getData("application/reactflow");
      if (!rawData) return;

      const nodeData = JSON.parse(rawData);
      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY
      });

      const newId = `node-${Date.now()}`;
      const newNode = {
        id: newId,
        type: nodeData.nodeType,
        position,
        data: {
          ...nodeData,
          onChange: updateNodeData,
          onMetricChange: handleMetricChange,
          onOpChange: handleOpChange,
          onConditionChange: handleConditionChange,
          onAlertChange: handleAlertChange,
          onDuplicate: duplicateNode
        }
      };

      setNodes((nds) => nds.concat(newNode));
    },
    [
      screenToFlowPosition,
      setNodes,
      updateNodeData,
      handleMetricChange,
      handleOpChange,
      handleConditionChange,
      handleAlertChange,
      duplicateNode
    ]
  );

  // Step 3 & Step 6: Connect Save Button (POST /api/rules or PUT /api/rules/:id)
  const handleSaveRule = async (isSaveAsNew = false) => {
    if (isSaving) return;

    const validation = validateGraph(nodes, edges);
    if (!validation.valid) {
      showToast("error", validation.message);
      return;
    }

    setIsSaving(true);

    // Clean node data so no transient callback functions are sent to API
    const cleanNodes = nodes.map((n) => {
      const {
        onChange,
        onMetricChange,
        onOpChange,
        onConditionChange,
        onAlertChange,
        onDuplicate,
        ...cleanData
      } = n.data || {};

      return {
        id: n.id,
        type: n.type,
        position: n.position,
        data: cleanData
      };
    });

    const cleanEdges = edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      animated: e.animated ?? true,
      style: e.style
    }));

    const rulePayload = {
      name: (ruleName || "High Temperature Alert").trim(),
      description: (ruleDescription || "").trim(),
      nodes: cleanNodes,
      edges: cleanEdges
    };

    try {
      if (selectedRuleId && !isSaveAsNew) {
        // Step 6: Update existing rule (PUT /api/rules/:id)
        await ruleService.updateRule(selectedRuleId, rulePayload);
        showToast("success", "Rule updated successfully!");
      } else {
        // Step 3: Create new rule (POST /api/rules)
        const res = await ruleService.createRule(rulePayload);
        if (res.data?.rule?._id) {
          setSelectedRuleId(res.data.rule._id);
        }
        showToast("success", "Rule created successfully!");
      }

      // Persist locally as well
      localStorage.setItem(
        "nexusflow_rule_data",
        JSON.stringify({
          name: rulePayload.name,
          description: rulePayload.description,
          nodes,
          edges,
          compiled: rulePayload
        })
      );

      // Refresh list of saved rules
      fetchRules();
    } catch (e) {
      console.error("Save rule error:", e);
      // Step 10: Handle API errors gracefully
      const friendlyMsg = getFriendlyErrorMessage(
        e,
        selectedRuleId && !isSaveAsNew
          ? "Unable to update rule. Please try again."
          : "Unable to save rule. Please try again."
      );
      showToast("error", friendlyMsg);
    } finally {
      setIsSaving(false);
    }
  };

  // Step 5: Open Existing Rule (GET /api/rules/:id -> React Flow State)
  const handleLoadRule = async (ruleId) => {
    if (loadingRuleId) return;

    setLoadingRuleId(ruleId);
    try {
      const res = await ruleService.getRuleById(ruleId);
      const rule = res.data?.rule;

      if (!rule) {
        showToast("error", "Rule not found. It may have been deleted.");
        return;
      }

      // 1. Set Rule Name and Description
      setRuleName(rule.name || "Untitled Rule");
      setRuleDescription(rule.description || "");
      setSelectedRuleId(rule._id || ruleId);

      // 2. Rehydrate Nodes with normalized types and handlers
      const hydratedNodes = (rule.nodes || []).map((node, index) => {
        const normalizedType = normalizeNodeType(node.type);
        return {
          id: node.id || `node-${index + 1}`,
          type: normalizedType,
          position: node.position || { x: 260, y: index * 160 + 40 },
          data: {
            ...(node.data || {}),
            onChange: updateNodeData,
            onMetricChange: handleMetricChange,
            onOpChange: handleOpChange,
            onConditionChange: handleConditionChange,
            onAlertChange: handleAlertChange,
            onDuplicate: duplicateNode
          }
        };
      });

      // 3. Rehydrate Edges
      const hydratedEdges = (rule.edges || []).map((edge, index) => ({
        id: edge.id || `edge-${edge.source}-${edge.target}-${index}`,
        source: edge.source,
        target: edge.target,
        animated: edge.animated ?? true,
        style: edge.style || { stroke: "#6366f1", strokeWidth: 2 }
      }));

      // 4. Update React Flow state
      setNodes(hydratedNodes);
      setEdges(hydratedEdges);

      // 5. Center canvas on loaded rule
      setTimeout(() => {
        fitView({ padding: 0.2, duration: 400 });
      }, 100);

      showToast("success", `Loaded rule: "${rule.name}"`);
    } catch (err) {
      console.error("Error loading rule:", err);
      // Step 10: User friendly error message
      showToast("error", getFriendlyErrorMessage(err, "Unable to load rule. Please try again."));
    } finally {
      setLoadingRuleId(null);
    }
  };

  // Step 7: Enable / Disable Rule (PATCH /api/rules/:id/status)
  const handleToggleRuleStatus = async (ruleId, currentStatus) => {
    if (togglingRuleId) return;

    setTogglingRuleId(ruleId);
    try {
      const newStatus = !currentStatus;
      await ruleService.updateRuleStatus(ruleId, newStatus);
      showToast("info", `Rule ${newStatus ? "enabled" : "disabled"} successfully`);
      fetchRules();
    } catch (err) {
      console.error("Error updating status:", err);
      // Step 10: User friendly error message
      showToast("error", getFriendlyErrorMessage(err, "Unable to update rule status. Please try again."));
    } finally {
      setTogglingRuleId(null);
    }
  };

  // Step 8: Delete Rule (DELETE /api/rules/:id)
  const handleDeleteRule = async (ruleId) => {
    if (deletingRuleId) return;

    setDeletingRuleId(ruleId);
    try {
      await ruleService.deleteRule(ruleId);
      // Step 8: Show "Rule deleted successfully"
      showToast("info", "Rule deleted successfully");
      if (selectedRuleId === ruleId) {
        handleNewRule();
      }
      fetchRules();
    } catch (err) {
      console.error("Error deleting rule:", err);
      // Step 10: User friendly error message
      showToast("error", getFriendlyErrorMessage(err, "Unable to delete rule. Please try again."));
    } finally {
      setDeletingRuleId(null);
    }
  };

  // New Rule / Reset Canvas
  const handleNewRule = () => {
    setSelectedRuleId(null);
    setRuleName("High Temperature Alert");
    setRuleDescription("Alert when temperature exceeds 80°C");
    setNodes(defaultInitialNodes);
    setEdges(defaultInitialEdges);
    setActiveTab("nodes");
    setTimeout(() => {
      fitView({ padding: 0.2, duration: 400 });
    }, 100);
    showToast("info", "Started a new rule template.");
  };

  const handleDuplicateSelected = () => {
    const selectedNodes = nodes.filter((n) => n.selected);
    if (selectedNodes.length === 0) {
      showToast("info", "Select a node first to duplicate.");
      return;
    }
    selectedNodes.forEach((n) => duplicateNode(n.id));
  };

  const handleDeleteSelected = () => {
    setNodes((nds) => nds.filter((node) => !node.selected));
    setEdges((eds) => eds.filter((edge) => !edge.selected));
  };

  const currentValidation = validateGraph(nodes, edges);

  return (
    <div className="flow-builder-page">
      {/* Header Bar */}
      <div className="flow-builder-header">
        <div className="flow-builder-title">
          <h2>NexusFlow Rule Builder</h2>
          <p>Visually construct automated telemetry threshold triggers & actions</p>
        </div>

        <div className="rule-header-inputs">
          <div className="rule-name-input-group">
            <label htmlFor="rule-name-input">Rule Name:</label>
            <input
              id="rule-name-input"
              type="text"
              className="rule-name-input"
              value={ruleName}
              onChange={(e) => setRuleName(e.target.value)}
              placeholder="e.g. High Temperature Alert"
            />
          </div>

          <div className="rule-desc-input-group">
            <label htmlFor="rule-desc-input">Description:</label>
            <input
              id="rule-desc-input"
              type="text"
              className="rule-desc-input"
              value={ruleDescription}
              onChange={(e) => setRuleDescription(e.target.value)}
              placeholder="e.g. Alert when temperature exceeds 80°C"
            />
          </div>

          {selectedRuleId && (() => {
            const selectedTrigger =
              ruleTriggers[selectedRuleId] ||
              ruleTriggers[String(selectedRuleId)] ||
              null;
            const isJustNow = Boolean(
              selectedTrigger &&
                selectedTrigger.triggeredAtMs &&
                Date.now() - selectedTrigger.triggeredAtMs < 60000
            );
            return (
              <div className={`active-rule-pill ${isJustNow ? "triggered" : ""}`}>
                <span>Editing: {ruleName}</span>
                {isJustNow && (
                  <span className="live-rule-trigger-chip">⚠ Triggered Just Now</span>
                )}
                <button
                  type="button"
                  className="clear-loaded-btn"
                  onClick={handleNewRule}
                  title="Clear and create new rule"
                >
                  ✕
                </button>
              </div>
            );
          })()}
        </div>
      </div>

      {/* Main Workspace Layout */}
      <div className="flow-builder-workspace">
        {/* Left Node / Saved Rules Panel */}
        <NodePanel
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          savedRules={savedRules}
          loadingRules={loadingRules}
          loadingRuleId={loadingRuleId}
          deletingRuleId={deletingRuleId}
          togglingRuleId={togglingRuleId}
          selectedRuleId={selectedRuleId}
          ruleTriggers={ruleTriggers}
          onSelectRule={handleLoadRule}
          onDeleteRule={handleDeleteRule}
          onToggleRuleStatus={handleToggleRuleStatus}
          onRefreshRules={fetchRules}
          onNewRule={handleNewRule}
        />

        {/* Center Flow Canvas */}
        <div className="flow-canvas-wrapper">
          <div className="flow-canvas-container" ref={reactFlowWrapper}>
            {toast && (
              <div className={`save-toast-banner ${toast.type}`}>
                {toast.message}
              </div>
            )}

            <div className="canvas-header-bar">
              <div className="canvas-info">
                <span
                  className={`canvas-status-dot ${currentValidation.valid ? "valid" : "invalid"}`}
                ></span>
                <span className="canvas-status-text">
                  {currentValidation.valid
                    ? "Rule Valid"
                    : "Rule Needs Attention"}
                </span>
                <span className="canvas-node-count">
                  ({nodes.length} nodes, {edges.length} edges)
                </span>

                {selectedRuleId && (() => {
                  const currentTrigger =
                    ruleTriggers[selectedRuleId] ||
                    ruleTriggers[String(selectedRuleId)] ||
                    null;
                  if (!currentTrigger) return null;

                  const isJustNow = Boolean(
                    currentTrigger.triggeredAtMs &&
                      Date.now() - currentTrigger.triggeredAtMs < 60000
                  );
                  const timeFormatted = formatTriggerTime(currentTrigger.timestamp);

                  return (
                    <div
                      className={`canvas-trigger-pill ${isJustNow ? "just-now" : "historical"}`}
                    >
                      {isJustNow ? (
                        <span>⚠ Triggered just now ({timeFormatted})</span>
                      ) : (
                        <span>🕒 Last Triggered: {timeFormatted}</span>
                      )}
                    </div>
                  );
                })()}
              </div>

              <div className="canvas-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={handleDuplicateSelected}
                  title="Duplicate Selected Node"
                >
                  📋 Duplicate
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={handleDeleteSelected}
                  title="Delete Selected Node"
                >
                  🗑️ Delete
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() =>
                    setJsonModalData({
                      nodes,
                      edges,
                      name: ruleName,
                      description: ruleDescription
                    })
                  }
                  title="Inspect Rule JSON payload"
                >
                  🔍 View JSON
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={handleNewRule}
                  title="Reset to blank/sample rule"
                >
                  ➕ New / Reset
                </button>

                {selectedRuleId && (
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={isSaving}
                    onClick={() => handleSaveRule(true)}
                    title="Save current canvas as a new rule copy"
                  >
                    {isSaving ? "💾 Saving..." : "💾 Save as New"}
                  </button>
                )}

                {/* Step 9: Dynamic button text and disabled state */}
                <button
                  type="button"
                  className="btn-save"
                  disabled={isSaving}
                  onClick={() => handleSaveRule(false)}
                >
                  {isSaving
                    ? selectedRuleId
                      ? "💾 Updating Rule..."
                      : "💾 Saving Rule..."
                    : selectedRuleId
                    ? "💾 Update Rule"
                    : "💾 Save Rule"}
                </button>
              </div>
            </div>

            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              isValidConnection={checkConnection}
              onDragOver={onDragOver}
              onDrop={onDrop}
              nodeTypes={nodeTypes}
              fitView
              snapToGrid
              snapGrid={[15, 15]}
              deleteKeyCode={["Backspace", "Delete"]}
              defaultEdgeOptions={{ animated: true }}
            >
              <Background color="#cbd5e1" gap={20} size={1} />
              <Controls className="custom-flow-controls" />
              <MiniMap
                nodeColor={(node) => {
                  switch (node.type) {
                    case "sensorNode":
                      return "#3b82f6";
                    case "movingAverageNode":
                    case "processingNode":
                      return "#8b5cf6";
                    case "conditionNode":
                      return "#f59e0b";
                    case "alertNode":
                      return "#ef4444";
                    default:
                      return "#64748b";
                  }
                }}
                style={{ height: 100 }}
                zoomable
                pannable
              />
            </ReactFlow>
          </div>
        </div>
      </div>

      {/* JSON Viewer Modal */}
      {jsonModalData && (
        <div className="modal-backdrop" onClick={() => setJsonModalData(null)}>
          <div
            className="modal-content json-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h3>Rule Compiler JSON Payload</h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setJsonModalData(null)}
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              <p className="modal-desc">
                Payload sent to <strong>POST / PUT /api/rules</strong>:
              </p>
              <pre className="json-code-block">
                {JSON.stringify(
                  {
                    name: jsonModalData.name || "High Temperature Alert",
                    description: jsonModalData.description || "",
                    nodes: jsonModalData.nodes.map((n) => {
                      const {
                        onChange,
                        onMetricChange,
                        onOpChange,
                        onConditionChange,
                        onAlertChange,
                        onDuplicate,
                        ...cleanData
                      } = n.data || {};
                      return {
                        id: n.id,
                        type: n.type,
                        position: n.position,
                        data: cleanData
                      };
                    }),
                    edges: jsonModalData.edges.map((e) => ({
                      id: e.id,
                      source: e.source,
                      target: e.target,
                      animated: e.animated ?? true,
                      style: e.style
                    }))
                  },
                  null,
                  2
                )}
              </pre>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setJsonModalData(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function FlowBuilder() {
  return (
    <ReactFlowProvider>
      <FlowCanvasContent />
    </ReactFlowProvider>
  );
}
