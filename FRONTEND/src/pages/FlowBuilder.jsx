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

import SensorNode from "../nodes/SensorNode";
import MovingAverageNode from "../nodes/MovingAverageNode";
import ConditionNode from "../nodes/ConditionNode";
import AlertNode from "../nodes/AlertNode";

import { validateGraph, validateConnectionWithReason } from "../utils/graphValidation";
import { serializeGraph, deserializeGraph } from "../utils/graphSerializer";
import { createRuleRequest, getRuleByIdRequest } from "../services/api";
import { useSearchParams } from "react-router-dom";

const nodeTypes = {
  sensorNode: SensorNode,
  processingNode: MovingAverageNode,
  movingAverageNode: MovingAverageNode,
  conditionNode: ConditionNode,
  alertNode: AlertNode
};

// Canonical initial default pipeline (Temperature -> Moving Avg (5) -> Greater Than (80) -> SMS Alert)
const defaultInitialRule = {
  id: "rule-default-1",
  name: "High Turbine Temperature",
  nodes: [
    {
      id: "1",
      type: "sensor",
      position: { x: 260, y: 40 },
      data: {
        sensor: "temperature",
        sensorId: "T-001"
      }
    },
    {
      id: "2",
      type: "movingAverage",
      position: { x: 260, y: 190 },
      data: {
        window: 5,
        operation: "movingAverage"
      }
    },
    {
      id: "3",
      type: "condition",
      position: { x: 260, y: 340 },
      data: {
        operator: ">",
        value: 80
      }
    },
    {
      id: "4",
      type: "sms",
      position: { x: 260, y: 490 },
      data: {
        phone: "+919876543210",
        severity: "high"
      }
    }
  ],
  edges: [
    { id: "e1-2", source: "1", target: "2" },
    { id: "e2-3", source: "2", target: "3" },
    { id: "e3-4", source: "3", target: "4" }
  ]
};

function FlowCanvas({
  ruleName,
  setRuleName,
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
  const { screenToFlowPosition, fitView } = useReactFlow();

  const showToast = (type, message) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4500);
  };

  // Helper to load initial state from localStorage or default template
  const getInitialGraphState = () => {
    try {
      const storedRulesRaw = localStorage.getItem("nexusflow_rules");
      if (storedRulesRaw) {
        const storedRules = JSON.parse(storedRulesRaw);
        if (Array.isArray(storedRules) && storedRules.length > 0) {
          const lastActiveId = localStorage.getItem("nexusflow_active_rule_id");
          const target = storedRules.find((r) => r.id === lastActiveId) || storedRules[0];
          return deserializeGraph(target);
        }
      }
    } catch (e) {
      console.warn("Could not parse nexusflow_rules from localStorage", e);
    }
    return deserializeGraph(defaultInitialRule);
  };

  const initialData = useMemo(() => getInitialGraphState(), []);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialData.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialData.edges);

  // Initialize Rule ID & Name on first render
  useEffect(() => {
    if (initialData.id) setActiveRuleId(initialData.id);
    if (initialData.ruleName) setRuleName(initialData.ruleName);
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

        const newId = `node-${Date.now()}`;
        const newNode = {
          ...target,
          id: newId,
          position: {
            x: target.position.x + 50,
            y: target.position.y + 50
          },
          selected: true,
          data: { ...target.data }
        };

        showToast("info", `Duplicated: ${target.data.label || target.id}`);
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
          onDuplicate: handleDuplicateNode,
          onDelete: handleDeleteNode
        }
      }))
    );
  }, [handleDuplicateNode, handleDeleteNode, setNodes]);

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

  // Connection Validator Callback (Step 4)
  const checkConnection = useCallback(
    (connection) => {
      const validation = validateConnectionWithReason(connection, nodes);
      if (!validation.isValid) {
        // Visual toast alert for invalid connection attempt
        showToast("error", validation.reason);
        return false;
      }
      return true;
    },
    [nodes]
  );

  // Add edge with styled directional arrow marker (Step 13)
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
          onDuplicate: handleDuplicateNode,
          onDelete: handleDeleteNode
        }
      };

      setNodes((nds) => nds.concat(newNode));
      setSelectedNode(newNode);
      setRightPanelTab("config");
      showToast("info", `Added ${nodeData.label} to canvas.`);
    },
    [screenToFlowPosition, setNodes, setSelectedNode, setRightPanelTab, handleDuplicateNode, handleDeleteNode]
  );

  // Step 5 & 6 & 8: Save Rule (Validation -> Serialization -> LocalStorage + Backend API)
  const handleSaveRule = async () => {
    // 1. Complete Rule Validation
    const validation = validateGraph(nodes, edges);
    if (!validation.valid) {
      showToast("error", validation.message);
      return;
    }

    // 2. Generate Clean Graph JSON using Serializer (Step 6 & 7)
    const ruleIdToSave = activeRuleId || `rule-${Date.now()}`;
    const cleanPayload = serializeGraph(ruleName, nodes, edges, ruleIdToSave);

    console.log("=========================================");
    console.log("🚀 NEXUSFLOW RULE GRAPH JSON PAYLOAD");
    console.log("=========================================");
    console.log(JSON.stringify(cleanPayload, null, 2));

    // 3. Save to localStorage under `nexusflow_rules` (Step 8)
    try {
      let existingRules = [];
      const stored = localStorage.getItem("nexusflow_rules");
      if (stored) {
        existingRules = JSON.parse(stored);
      }

      const existingIndex = existingRules.findIndex((r) => r.id === ruleIdToSave);
      if (existingIndex >= 0) {
        existingRules[existingIndex] = cleanPayload;
      } else {
        existingRules.unshift(cleanPayload);
      }

      localStorage.setItem("nexusflow_rules", JSON.stringify(existingRules));
      localStorage.setItem("nexusflow_active_rule_id", ruleIdToSave);
      setActiveRuleId(ruleIdToSave);

      // 4. Try Backend API (Step 14)
      try {
        await createRuleRequest(cleanPayload);
        showToast("success", `✅ Rule "${ruleName}" saved to Database & LocalStorage!`);
      } catch (backendError) {
        const msg = backendError.response?.data?.message || "Saved locally (Backend unauthenticated/offline)";
        showToast("success", `✅ Rule "${ruleName}" saved locally! (${msg})`);
      }
    } catch (e) {
      console.error("Storage error:", e);
      showToast("error", "Failed to save rule.");
    }
  };

  // Step 9 & 10: Load a saved rule from My Rules into canvas
  const handleLoadSavedRule = (ruleData) => {
    const deserialized = deserializeGraph(ruleData, {
      onDuplicate: handleDuplicateNode,
      onDelete: handleDeleteNode
    });

    setNodes(deserialized.nodes);
    setEdges(deserialized.edges);
    setRuleName(deserialized.ruleName);
    setActiveRuleId(deserialized.id);
    setSelectedNode(null);
    localStorage.setItem("nexusflow_active_rule_id", deserialized.id);

    showToast("info", `Loaded rule: "${deserialized.ruleName}"`);
    setTimeout(() => fitView({ padding: 0.2, duration: 400 }), 50);
  };

  // Step 9: Automatic rule loading when navigating from Alert Details (e.g. /flow?ruleId=xyz)
  const [searchParams] = useSearchParams();
  const urlRuleId = searchParams.get("ruleId");

  useEffect(() => {
    if (!urlRuleId) return;

    let isMounted = true;
    const loadRuleFromParam = async () => {
      // 1. Check localStorage first
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
            return;
          }
        }
      } catch (err) {
        console.warn("Could not load rule from localStorage:", err);
      }

      // 2. Fetch from backend API
      try {
        const res = await getRuleByIdRequest(urlRuleId);
        const fetchedRule = res?.data?.rule || res?.data;
        if (fetchedRule && isMounted) {
          handleLoadSavedRule(fetchedRule);
        }
      } catch (apiErr) {
        console.warn("Could not load rule from backend API:", apiErr.message);
      }
    };

    loadRuleFromParam();
    return () => {
      isMounted = false;
    };
  }, [urlRuleId]);

  // Step 11: Delete a saved rule from localStorage
  const handleDeleteSavedRule = (ruleId) => {
    try {
      const stored = localStorage.getItem("nexusflow_rules");
      if (stored) {
        const parsed = JSON.parse(stored);
        const filtered = parsed.filter((r) => r.id !== ruleId);
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

  // Step 12: Clear Canvas Handler
  const handleConfirmClearCanvas = () => {
    setNodes([]);
    setEdges([]);
    setSelectedNode(null);
    setRuleName("New Rule");
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
          <button
            className="btn-canvas-action"
            onClick={() => onOpenJsonModal(serializeGraph(ruleName, nodes, edges, activeRuleId))}
            title="Inspect clean Compiler JSON"
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
            title="Reset to default Temperature -> Moving Avg -> Condition -> SMS rule"
          >
            ↺ Reset Demo
          </button>
          <button className="btn-save-rule" onClick={handleSaveRule} title="Validate & Save Rule">
            💾 Save Rule
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

      {/* ─── Step 12: Clear Canvas Confirmation Modal ─── */}
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
  const [ruleName, setRuleName] = useState("High Turbine Temperature");
  const [activeRuleId, setActiveRuleId] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [rightPanelTab, setRightPanelTab] = useState("config");
  const [jsonModalData, setJsonModalData] = useState(null);

  return (
    <div className="flow-builder-page">
      {/* Top Navigation & Rule Name Bar */}
      <div className="flow-builder-header">
        <div className="flow-builder-title">
          <h2>NexusFlow Rule Builder</h2>
          <p>Design real-time telemetry processing pipelines & automated threshold triggers</p>
        </div>

        {/* Step 2: Rule Name Input */}
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
              placeholder="e.g. High Turbine Temperature"
            />
          </div>
        </div>
      </div>

      {/* Step 1: 3-Column Product Layout (Library | Canvas | Config/Rules) */}
      <div className="flow-builder-workspace">
        <NodePanel />
        <div className="flow-canvas-wrapper">
          <ReactFlowProvider>
            <FlowCanvas
              ruleName={ruleName}
              setRuleName={setRuleName}
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

      {/* Step 6 & 7: Clean Graph JSON Viewer Modal */}
      {jsonModalData && (
        <div className="modal-backdrop" onClick={() => setJsonModalData(null)}>
          <div className="modal-content json-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Rule Compiler JSON Payload</h3>
              <button className="modal-close-btn" onClick={() => setJsonModalData(null)}>
                ✕
              </button>
            </div>
            <div className="modal-body">
              <p className="modal-desc">
                Clean serializable graph JSON ready for the Node.js Compiler & RxJS Stream Engine:
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
