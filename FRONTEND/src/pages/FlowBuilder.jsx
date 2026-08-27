import React, { useState, useCallback, useRef, useEffect, useMemo } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  useNodesState,
  useEdgesState,
  addEdge,
  Background,
  Controls,
  MiniMap,
  useReactFlow,
  MarkerType
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import NodePanel from "../components/NodePanel";
import NodeConfigPanel from "../components/NodeConfigPanel";
import SavedRulesPanel from "../components/SavedRulesPanel";

import { nodeTypes } from "../components/ruleNodes";
import { validateGraph, validateConnectionWithReason } from "../utils/graphValidation";
import { serializeRule, deserializeRule } from "../utils/ruleSerializer";
import {
  createRule,
  updateRule,
  getRuleById,
  getRules
} from "../services/ruleService";
import { useSearchParams } from "react-router-dom";

// Canonical initial default pipeline (Sensor -> Condition -> Action)
const defaultInitialRule = {
  id: "rule-default-1",
  name: "High Temperature Alert",
  description: "Temperature exceeds 80°C",
  nodes: [
    {
      id: "sensor1",
      type: "sensor",
      position: { x: 260, y: 40 },
      data: {
        sensorId: "TURBINE-001",
        field: "temperature"
      }
    },
    {
      id: "condition1",
      type: "condition",
      position: { x: 260, y: 220 },
      data: {
        operator: ">",
        value: 80
      }
    },
    {
      id: "action1",
      type: "action",
      position: { x: 260, y: 400 },
      data: {
        action: "ALERT",
        severity: "HIGH"
      }
    }
  ],
  edges: [
    { id: "e-sensor-condition", source: "sensor1", target: "condition1" },
    { id: "e-condition-action", source: "condition1", target: "action1" }
  ]
};

function FlowCanvas({
  ruleName,
  setRuleName,
  ruleDescription,
  setRuleDescription,
  activeRuleId,
  setActiveRuleId,
  selectedNode,
  setSelectedNode,
  rightPanelTab,
  setRightPanelTab,
  onOpenJsonModal
}) {
  const reactFlowWrapper = useRef(null);
  const [toast, setToast] = useState(null);
  const [clearModalOpen, setClearModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const { screenToFlowPosition, fitView } = useReactFlow();

  const showToast = (type, message) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 5000);
  };

  // Helper to load initial state from localStorage or default template
  const getInitialGraphState = () => {
    try {
      const storedRulesRaw = localStorage.getItem("nexusflow_rules");
      if (storedRulesRaw) {
        const storedRules = JSON.parse(storedRulesRaw);
        if (Array.isArray(storedRules) && storedRules.length > 0) {
          const lastActiveId = localStorage.getItem("nexusflow_active_rule_id");
          const target = storedRules.find((r) => r._id === lastActiveId || r.id === lastActiveId) || storedRules[0];
          return deserializeRule(target);
        }
      }
    } catch (e) {
      console.warn("Could not parse nexusflow_rules from localStorage", e);
    }
    return deserializeRule(defaultInitialRule);
  };

  const initialData = useMemo(() => getInitialGraphState(), []);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialData.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialData.edges);

  // Initialize Rule ID & Name on first render
  useEffect(() => {
    if (initialData.id || initialData._id) setActiveRuleId(initialData._id || initialData.id);
    if (initialData.name) setRuleName(initialData.name);
    if (initialData.description) setRuleDescription(initialData.description);
  }, []);

  // Update a node's data in state
  const handleUpdateNodeData = useCallback(
    (nodeId, partialData) => {
      setNodes((nds) =>
        nds.map((node) => {
          if (node.id === nodeId) {
            return {
              ...node,
              data: {
                ...node.data,
                ...partialData
              }
            };
          }
          return node;
        })
      );
    },
    [setNodes]
  );

  // Duplicate a node
  const handleDuplicateNode = useCallback(
    (nodeId) => {
      setNodes((nds) => {
        const target = nds.find((n) => n.id === nodeId);
        if (!target) return nds;

        const newId = `${target.type}-${Date.now().toString().slice(-4)}`;
        const newNode = {
          ...target,
          id: newId,
          position: {
            x: (target.position?.x || 200) + 40,
            y: (target.position?.y || 200) + 40
          },
          selected: true,
          data: { ...target.data }
        };

        showToast("info", `Duplicated node: ${target.data.label || target.id}`);
        setSelectedNode(newNode);
        return nds.map((n) => ({ ...n, selected: false })).concat(newNode);
      });
    },
    [setNodes, setSelectedNode]
  );

  // Delete a specific node
  const handleDeleteNode = useCallback(
    (nodeId) => {
      setNodes((nds) => nds.filter((n) => n.id !== nodeId));
      setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
      setSelectedNode(null);
      showToast("info", "Node deleted from canvas.");
    },
    [setNodes, setEdges, setSelectedNode]
  );

  // Attach callbacks to nodes whenever rendered
  useEffect(() => {
    setNodes((nds) =>
      nds.map((n) => ({
        ...n,
        data: {
          ...n.data,
          onChange: handleUpdateNodeData,
          onUpdate: handleUpdateNodeData,
          onDuplicate: handleDuplicateNode,
          onDelete: handleDeleteNode
        }
      }))
    );
  }, [handleUpdateNodeData, handleDuplicateNode, handleDeleteNode, setNodes]);

  // Track currently selected node
  const onNodeClick = useCallback(
    (event, node) => {
      setSelectedNode(node);
      if (rightPanelTab !== "config") {
        setRightPanelTab("config");
      }
    },
    [setSelectedNode, rightPanelTab, setRightPanelTab]
  );

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, [setSelectedNode]);

  // Connection Validator Callback
  const checkConnection = useCallback(
    (connection) => {
      const validation = validateConnectionWithReason(connection, nodes);
      if (!validation.isValid) {
        showToast("error", validation.reason);
        return false;
      }
      return true;
    },
    [nodes]
  );

  // Add edge with styled directional arrow marker
  const onConnect = useCallback(
    (params) => {
      setEdges((eds) =>
        addEdge(
          {
            ...params,
            animated: true,
            style: { stroke: "#6366f1", strokeWidth: 2 },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              width: 16,
              height: 16,
              color: "#6366f1"
            }
          },
          eds
        )
      );
      showToast("info", "Connected nodes!");
    },
    [setEdges]
  );

  const onDragOver = useCallback((event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const [addNodeMenuOpen, setAddNodeMenuOpen] = useState(false);

  const handleAddNode = useCallback(
    (nodeType, customData = {}) => {
      const newId = `${nodeType}-${Date.now().toString().slice(-4)}`;
      const position = {
        x: 260 + (nodes.length % 4) * 30,
        y: 60 + nodes.length * 80
      };

      let initialData = {};
      if (nodeType === "sensor" || nodeType === "sensorNode") {
        initialData = {
          sensorId: customData.sensorId || "TURBINE-001",
          field: customData.field || customData.sensor || "temperature",
          sensor: customData.field || customData.sensor || "temperature",
          label: customData.label || "Sensor (TURBINE-001)",
          unit: customData.unit || "°C",
          icon: customData.icon || "🌡️",
          ...customData
        };
      } else if (nodeType === "condition" || nodeType === "conditionNode") {
        initialData = {
          operator: customData.operator || ">",
          value: customData.value !== undefined ? Number(customData.value) : 80,
          field: customData.field || "temperature",
          label: customData.label || "Condition (> 80)",
          icon: customData.icon || ">",
          ...customData
        };
      } else if (nodeType === "math" || nodeType === "mathNode" || nodeType === "movingAverageNode") {
        initialData = {
          operation: customData.operation || "movingAverage",
          window: customData.window !== undefined ? Number(customData.window) : 5,
          label: customData.label || "Moving Average",
          icon: customData.icon || "📈",
          ...customData
        };
      } else if (nodeType === "action" || nodeType === "alertNode") {
        const act = (customData.action || customData.actionType || "ALERT").toUpperCase();
        const sev = (customData.severity || "HIGH").toUpperCase();
        initialData = {
          action: act,
          actionType: act,
          severity: sev,
          label: customData.label || `${act} Action`,
          icon: customData.icon || "🚨",
          ...customData
        };
      }

      const newNode = {
        id: newId,
        type: nodeType === "sensorNode" ? "sensor" : nodeType === "conditionNode" ? "condition" : nodeType === "alertNode" ? "action" : nodeType,
        position,
        data: {
          ...initialData,
          onDuplicate: handleDuplicateNode,
          onDelete: handleDeleteNode
        }
      };

      setNodes((nds) => nds.concat(newNode));
      setSelectedNode(newNode);
      setRightPanelTab("config");
      setAddNodeMenuOpen(false);
      showToast("info", `Added ${newNode.data.label || nodeType} to canvas.`);
    },
    [nodes, setNodes, setSelectedNode, setRightPanelTab, handleDuplicateNode, handleDeleteNode]
  );

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

      const normalizedType =
        nodeData.nodeType === "sensorNode"
          ? "sensor"
          : nodeData.nodeType === "conditionNode"
          ? "condition"
          : nodeData.nodeType === "alertNode"
          ? "action"
          : nodeData.nodeType || "sensor";

      const newId = `${normalizedType}-${Date.now().toString().slice(-4)}`;
      const newNode = {
        id: newId,
        type: normalizedType,
        position,
        data: {
          ...nodeData,
          onDuplicate: handleDuplicateNode,
          onDelete: handleDeleteNode
        }
      };

      setNodes((nds) => nds.concat(newNode));
      setSelectedNode(newNode);
      setRightPanelTab("config");
      showToast("info", `Added ${nodeData.label || normalizedType} to canvas.`);
    },
    [screenToFlowPosition, setNodes, setSelectedNode, setRightPanelTab, handleDuplicateNode, handleDeleteNode]
  );

  // Step 4, 5, 6: Save Rule (Validation -> Serialization -> LocalStorage + Backend API POST/PUT)
  const handleSaveRule = async () => {
    // 1. Pre-save Validation (Graph topology & Node configuration completeness)
    const validation = validateGraph(nodes, edges);
    if (!validation.valid) {
      showToast("error", validation.message);
      return;
    }

    setIsSaving(true);

    // 2. Serialization via ruleSerializer.js (Step 1, 2, 3)
    const cleanPayload = serializeRule(nodes, edges, {
      name: ruleName,
      description: ruleDescription,
      id: activeRuleId,
      _id: activeRuleId && activeRuleId.length === 24 ? activeRuleId : undefined
    });

    console.log("=========================================");
    console.log("🚀 SERIALIZED RULE JSON PAYLOAD (POST /api/rules)");
    console.log("=========================================");
    console.log(JSON.stringify(cleanPayload, null, 2));

    try {
      let savedRuleId = activeRuleId;
      let backendSaved = false;

      // 3. Connect to backend API: POST /api/rules or PUT /api/rules/:id
      try {
        const isMongoId = activeRuleId && activeRuleId.length === 24 && /^[0-9a-fA-F]{24}$/.test(activeRuleId);
        let res;
        if (isMongoId) {
          try {
            res = await updateRule(activeRuleId, cleanPayload);
          } catch (updateErr) {
            // If update fails because 404, fallback to create; otherwise throw
            if (updateErr.response?.status === 404) {
              res = await createRule(cleanPayload);
            } else {
              throw updateErr;
            }
          }
        } else {
          res = await createRule(cleanPayload);
        }

        const returnedRule = res.data?.rule || res.data;
        if (returnedRule && (returnedRule._id || returnedRule.id)) {
          savedRuleId = returnedRule._id || returnedRule.id;
          setActiveRuleId(savedRuleId);
          backendSaved = true;
        }
      } catch (backendError) {
        console.warn("Backend save failed:", backendError.response?.data?.message || backendError.message);
        
        // Step 11 — Test API Error Handling:
        // If backend returns: 400 -> "Unable to save rule. Please check the rule configuration."
        // For network failure -> "Server unavailable. Please try again."
        if (backendError.response && backendError.response.status === 400) {
          showToast("error", "Unable to save rule. Please check the rule configuration.");
          setIsSaving(false);
          return;
        } else if (!backendError.response || backendError.code === "ERR_NETWORK" || backendError.message?.includes("Network Error")) {
          showToast("error", "Server unavailable. Please try again.");
        } else {
          showToast("error", backendError.response?.data?.message || "Server unavailable. Please try again.");
        }
      }

      // 4. Save to localStorage under `nexusflow_rules`
      const ruleIdForStorage = savedRuleId || `rule-${Date.now()}`;
      const ruleForStorage = {
        ...cleanPayload,
        id: ruleIdForStorage,
        _id: savedRuleId && savedRuleId.length === 24 ? savedRuleId : undefined,
        updatedAt: new Date().toISOString()
      };

      let existingRules = [];
      const stored = localStorage.getItem("nexusflow_rules");
      if (stored) {
        try {
          existingRules = JSON.parse(stored);
        } catch (e) {
          existingRules = [];
        }
      }

      const existingIndex = existingRules.findIndex(
        (r) => (r._id && r._id === savedRuleId) || (r.id && r.id === ruleIdForStorage)
      );

      if (existingIndex >= 0) {
        existingRules[existingIndex] = ruleForStorage;
      } else {
        existingRules.unshift(ruleForStorage);
      }

      localStorage.setItem("nexusflow_rules", JSON.stringify(existingRules));
      localStorage.setItem("nexusflow_active_rule_id", ruleIdForStorage);
      if (!activeRuleId) setActiveRuleId(ruleIdForStorage);

      if (backendSaved) {
        showToast("success", `✅ Rule "${ruleName}" saved successfully to database!`);
      } else {
        showToast("info", `Rule "${ruleName}" cached locally.`);
      }
    } catch (e) {
      console.error("Storage error:", e);
      showToast("error", "Failed to save rule.");
    } finally {
      setIsSaving(false);
    }
  };

  // Step 7: Load a saved rule from My Rules into canvas (GET /api/rules/:id)
  const handleLoadSavedRule = async (ruleDataOrId) => {
    let targetRule = ruleDataOrId;

    // If string ID was passed, fetch from backend or localStorage
    if (typeof ruleDataOrId === "string") {
      try {
        const res = await getRuleById(ruleDataOrId);
        if (res?.data?.rule || res?.data) {
          targetRule = res.data.rule || res.data;
        }
      } catch (err) {
        console.warn("Backend getRuleById failed, checking localStorage:", err.message);
        try {
          const stored = localStorage.getItem("nexusflow_rules");
          if (stored) {
            const list = JSON.parse(stored);
            targetRule = list.find((r) => r._id === ruleDataOrId || r.id === ruleDataOrId);
          }
        } catch (e) {}
      }
    }

    if (!targetRule) {
      showToast("error", "Could not load rule.");
      return;
    }

    const deserialized = deserializeRule(targetRule, {
      onChange: handleUpdateNodeData,
      onUpdate: handleUpdateNodeData,
      onDuplicate: handleDuplicateNode,
      onDelete: handleDeleteNode
    });

    setNodes(deserialized.nodes);
    setEdges(deserialized.edges);
    setRuleName(deserialized.name || "Untitled Rule");
    setRuleDescription(deserialized.description || "");
    setActiveRuleId(deserialized.id);
    setSelectedNode(null);
    localStorage.setItem("nexusflow_active_rule_id", deserialized.id);

    showToast("info", `Loaded rule: "${deserialized.name}"`);
    setTimeout(() => fitView({ padding: 0.2, duration: 400 }), 50);
  };

  // Automatic rule loading when navigating from Alert Details (e.g. /flow?ruleId=xyz)
  const [searchParams] = useSearchParams();
  const urlRuleId = searchParams.get("ruleId");

  useEffect(() => {
    if (!urlRuleId) return;

    let isMounted = true;
    const loadRuleFromParam = async () => {
      // 1. Fetch from backend API
      try {
        const res = await getRuleByIdRequest(urlRuleId);
        const fetchedRule = res?.data?.rule || res?.data;
        if (fetchedRule && isMounted) {
          handleLoadSavedRule(fetchedRule);
          return;
        }
      } catch (apiErr) {
        console.warn("Could not load rule from backend API:", apiErr.message);
      }

      // 2. Check localStorage fallback
      try {
        const storedRulesRaw = localStorage.getItem("nexusflow_rules");
        if (storedRulesRaw) {
          const storedRules = JSON.parse(storedRulesRaw);
          const matched = storedRules.find(
            (r) =>
              (r.id && r.id.toString() === urlRuleId) ||
              (r._id && r._id.toString() === urlRuleId)
          );
          if (matched && isMounted) {
            handleLoadSavedRule(matched);
          }
        }
      } catch (err) {
        console.warn("Could not load rule from localStorage:", err);
      }
    };

    loadRuleFromParam();
    return () => {
      isMounted = false;
    };
  }, [urlRuleId]);

  // Delete a saved rule from localStorage
  const handleDeleteSavedRule = (ruleId) => {
    try {
      const stored = localStorage.getItem("nexusflow_rules");
      if (stored) {
        const parsed = JSON.parse(stored);
        const filtered = parsed.filter((r) => r.id !== ruleId && r._id !== ruleId);
        localStorage.setItem("nexusflow_rules", JSON.stringify(filtered));
      }
      if (activeRuleId === ruleId) {
        setActiveRuleId(null);
      }
      showToast("info", "Rule deleted from My Rules.");
    } catch (e) {
      console.error("Failed to delete rule", e);
    }
  };

  // Clear Canvas Handler
  const handleConfirmClearCanvas = () => {
    setNodes([]);
    setEdges([]);
    setSelectedNode(null);
    setRuleName("New Rule");
    setRuleDescription("");
    setActiveRuleId(`rule-${Date.now()}`);
    setClearModalOpen(false);
    showToast("info", "Canvas cleared. Drag new nodes from library.");
  };

  // Create new rule from template
  const handleCreateNewRule = () => {
    setNodes([]);
    setEdges([]);
    setSelectedNode(null);
    setRuleName("New Rule");
    setRuleDescription("");
    setActiveRuleId(`rule-${Date.now()}`);
    showToast("info", "Started new rule.");
  };

  // Reset to default sample pipeline
  const handleResetSample = () => {
    handleLoadSavedRule(defaultInitialRule);
  };

  const validationState = validateGraph(nodes, edges);

  // Find latest selected node from nodes state so changes reflect immediately
  const activeSelectedNode = nodes.find((n) => selectedNode && n.id === selectedNode.id) || null;

  return (
    <div className="flow-builder-container" ref={reactFlowWrapper}>
      {/* Toast Alert Banner */}
      {toast && <div className={`save-toast-banner ${toast.type}`}>{toast.message}</div>}

      {/* ─── Center Canvas Header Bar ─── */}
      <div className="canvas-header-bar">
        <div className="canvas-info">
          <span className={`canvas-status-dot ${validationState.valid ? "valid" : "invalid"}`}></span>
          <span className="canvas-status-text">
            {validationState.valid ? "Rule Valid & Connected" : "Rule Needs Attention"}
          </span>
          <span className="canvas-node-count">
            ({nodes.length} nodes, {edges.length} connections)
          </span>
        </div>

        <div className="canvas-actions">
          {/* + Add Node Quick Menu */}
          <div className="add-node-dropdown-container">
            <button
              className="btn-canvas-action primary-accent"
              onClick={() => setAddNodeMenuOpen((prev) => !prev)}
              title="Add a new node to the canvas"
            >
              ➕ Add Node
            </button>
            {addNodeMenuOpen && (
              <div className="add-node-menu" onClick={(e) => e.stopPropagation()}>
                <div className="add-node-group-title">DATA SOURCES</div>
                <button
                  className="add-node-menu-item"
                  onClick={() => handleAddNode("sensor", { sensorId: "TURBINE-001", field: "temperature" })}
                >
                  <span className="node-icon">🔌</span>
                  <span>Sensor</span>
                </button>
                <div className="add-node-group-title">CONDITIONS</div>
                <button
                  className="add-node-menu-item"
                  onClick={() => handleAddNode("condition", { operator: ">", value: 80 })}
                >
                  <span className="node-icon">⚙️</span>
                  <span>Condition (&gt; 80)</span>
                </button>
                <button
                  className="add-node-menu-item"
                  onClick={() => handleAddNode("condition", { operator: "<", value: 20 })}
                >
                  <span className="node-icon">⚙️</span>
                  <span>Condition (&lt; 20)</span>
                </button>
                <div className="add-node-group-title">ACTIONS</div>
                <button
                  className="add-node-menu-item"
                  onClick={() => handleAddNode("action", { action: "ALERT", severity: "HIGH" })}
                >
                  <span className="node-icon">🚨</span>
                  <span>Alert (High)</span>
                </button>
                <button
                  className="add-node-menu-item"
                  onClick={() => handleAddNode("action", { action: "NOTIFICATION", severity: "MEDIUM" })}
                >
                  <span className="node-icon">🔔</span>
                  <span>Notification (Medium)</span>
                </button>
                <button
                  className="add-node-menu-item"
                  onClick={() => handleAddNode("action", { action: "SMS", severity: "HIGH" })}
                >
                  <span className="node-icon">📱</span>
                  <span>SMS Action</span>
                </button>
                <div className="add-node-group-title">OPERATIONS</div>
                <button
                  className="add-node-menu-item"
                  onClick={() => handleAddNode("math", { operation: "movingAverage", window: 5 })}
                >
                  <span className="node-icon">📈</span>
                  <span>Math / Moving Avg</span>
                </button>
              </div>
            )}
          </div>

          <button
            className="btn-canvas-action"
            onClick={() =>
              onOpenJsonModal(
                serializeRule(nodes, edges, {
                  name: ruleName,
                  description: ruleDescription,
                  id: activeRuleId
                })
              )
            }
            title="Inspect clean Rule JSON Payload"
          >
            🔍 View JSON
          </button>
          <button
            className={`btn-canvas-action ${rightPanelTab === "rules" ? "active" : ""}`}
            onClick={() => setRightPanelTab(rightPanelTab === "rules" ? "config" : "rules")}
            title="Browse and load saved rules"
          >
            📂 My Rules
          </button>
          <button
            className="btn-canvas-action danger"
            onClick={() => setClearModalOpen(true)}
            title="Clear all nodes from canvas"
          >
            🗑️ Clear Canvas
          </button>
          <button
            className="btn-canvas-action"
            onClick={handleResetSample}
            title="Reset to default Temperature -> Condition -> Alert rule"
          >
            ↺ Reset Demo
          </button>
          <button
            className="btn-save-rule"
            onClick={handleSaveRule}
            disabled={isSaving}
            title="Validate & Save Rule to Database"
          >
            {isSaving ? "💾 Saving..." : "💾 Save Rule"}
          </button>
        </div>
      </div>

      {/* ─── Main ReactFlow Workspace ─── */}
      <div className="react-flow-split-view">
        <div className="flow-canvas-inner">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            isValidConnection={checkConnection}
            onDragOver={onDragOver}
            onDrop={onDrop}
            nodeTypes={nodeTypes}
            fitView
            snapToGrid
            snapGrid={[15, 15]}
            deleteKeyCode={["Backspace", "Delete"]}
            defaultEdgeOptions={{
              animated: true,
              style: { stroke: "#6366f1", strokeWidth: 2 },
              markerEnd: {
                type: MarkerType.ArrowClosed,
                width: 16,
                height: 16,
                color: "#6366f1"
              }
            }}
          >
            <Background color="#cbd5e1" gap={20} size={1} />
            <Controls className="custom-flow-controls" />
            <MiniMap
              nodeColor={(node) => {
                switch (node.type) {
                  case "sensor":
                  case "sensorNode":
                    return "#3b82f6";
                  case "math":
                  case "mathNode":
                  case "movingAverageNode":
                  case "processingNode":
                    return "#8b5cf6";
                  case "condition":
                  case "conditionNode":
                    return "#f59e0b";
                  case "action":
                  case "alert":
                  case "alertNode":
                    return "#ef4444";
                  default:
                    return "#64748b";
                }
              }}
              style={{ height: 95 }}
              zoomable
              pannable
            />
          </ReactFlow>
        </div>

        {/* ─── Right Side Panel (Tabs: Node Config OR My Rules) ─── */}
        <div className="flow-right-sidebar">
          <div className="right-panel-tabs">
            <button
              className={`panel-tab-btn ${rightPanelTab === "config" ? "active" : ""}`}
              onClick={() => setRightPanelTab("config")}
            >
              ⚙️ Node Config
            </button>
            <button
              className={`panel-tab-btn ${rightPanelTab === "rules" ? "active" : ""}`}
              onClick={() => setRightPanelTab("rules")}
            >
              📂 My Rules
            </button>
          </div>

          <div className="right-panel-content">
            {rightPanelTab === "config" ? (
              <NodeConfigPanel
                selectedNode={activeSelectedNode}
                onUpdateNodeData={handleUpdateNodeData}
                onDuplicateNode={handleDuplicateNode}
                onDeleteNode={handleDeleteNode}
                onClose={() => setSelectedNode(null)}
              />
            ) : (
              <SavedRulesPanel
                activeRuleId={activeRuleId}
                onLoadRule={handleLoadSavedRule}
                onNewRule={handleCreateNewRule}
                onDeleteRule={handleDeleteSavedRule}
                onViewJson={onOpenJsonModal}
                onClose={() => setRightPanelTab("config")}
              />
            )}
          </div>
        </div>
      </div>

      {/* ─── Clear Canvas Confirmation Modal ─── */}
      {clearModalOpen && (
        <div className="modal-backdrop" onClick={() => setClearModalOpen(false)}>
          <div className="modal-content confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Clear Flow Canvas?</h3>
              <button className="modal-close-btn" onClick={() => setClearModalOpen(false)}>
                ✕
              </button>
            </div>
            <div className="modal-body">
              <p>Are you sure you want to clear the canvas? All unsaved nodes and connections will be removed.</p>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setClearModalOpen(false)}>
                Cancel
              </button>
              <button className="btn-danger-solid" onClick={handleConfirmClearCanvas}>
                Yes, Clear Canvas
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function FlowBuilder() {
  const [ruleName, setRuleName] = useState("High Temperature Alert");
  const [ruleDescription, setRuleDescription] = useState("Temperature exceeds 80°C");
  const [activeRuleId, setActiveRuleId] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [rightPanelTab, setRightPanelTab] = useState("config");
  const [jsonModalData, setJsonModalData] = useState(null);

  return (
    <div className="flow-builder-page">
      {/* Top Navigation & Rule Info Bar */}
      <div className="flow-builder-header">
        <div className="flow-builder-title">
          <h2>NexusFlow Rule Builder</h2>
          <p>Design real-time telemetry processing pipelines & automated threshold triggers</p>
        </div>

        {/* Rule Name & Description Inputs */}
        <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
          <div className="rule-name-input-group">
            <label htmlFor="rule-name-input">Rule Name:</label>
            <div className="rule-name-wrapper">
              <span className="rule-name-icon">🏷️</span>
              <input
                id="rule-name-input"
                type="text"
                className="rule-name-input"
                value={ruleName}
                onChange={(e) => setRuleName(e.target.value)}
                placeholder="e.g. High Temperature Alert"
              />
            </div>
          </div>

          <div className="rule-name-input-group">
            <label htmlFor="rule-desc-input">Description:</label>
            <div className="rule-name-wrapper">
              <span className="rule-name-icon">📝</span>
              <input
                id="rule-desc-input"
                type="text"
                className="rule-name-input"
                style={{ width: "220px" }}
                value={ruleDescription}
                onChange={(e) => setRuleDescription(e.target.value)}
                placeholder="e.g. Temperature exceeds 80°C"
              />
            </div>
          </div>
        </div>
      </div>

      {/* 3-Column Product Layout (Library | Canvas | Config/Rules) */}
      <div className="flow-builder-workspace">
        {/* Left Node Library Panel */}
        <NodePanel />

        {/* Center Flow Canvas */}
        <div className="flow-canvas-wrapper">
          <ReactFlowProvider>
            <FlowCanvas
              ruleName={ruleName}
              setRuleName={setRuleName}
              ruleDescription={ruleDescription}
              setRuleDescription={setRuleDescription}
              activeRuleId={activeRuleId}
              setActiveRuleId={setActiveRuleId}
              selectedNode={selectedNode}
              setSelectedNode={setSelectedNode}
              rightPanelTab={rightPanelTab}
              setRightPanelTab={setRightPanelTab}
              onOpenJsonModal={(payload) => setJsonModalData(payload)}
            />
          </ReactFlowProvider>
        </div>
      </div>

      {/* Clean Graph JSON Viewer Modal */}
      {jsonModalData && (
        <div className="modal-backdrop" onClick={() => setJsonModalData(null)}>
          <div
            className="modal-content json-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h3>Rule JSON Payload (API Format)</h3>
              <button className="modal-close-btn" onClick={() => setJsonModalData(null)}>
                ✕
              </button>
            </div>
            <div className="modal-body">
              <p className="modal-desc">
                Clean serializable graph JSON ready for <code>POST /api/rules</code> and the backend Rule Engine:
              </p>
              <pre className="json-code-block">
                {JSON.stringify(jsonModalData, null, 2)}
              </pre>
            </div>
            <div className="modal-footer">
              <button
                className="btn-secondary"
                onClick={() => {
                  navigator.clipboard.writeText(JSON.stringify(jsonModalData, null, 2));
                  alert("JSON copied to clipboard!");
                }}
              >
                📋 Copy JSON
              </button>
              <button className="btn-secondary" onClick={() => setJsonModalData(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
