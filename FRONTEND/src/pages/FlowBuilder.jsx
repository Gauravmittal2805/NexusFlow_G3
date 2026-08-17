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

const nodeTypes = {
  sensorNode: SensorNode,
  processingNode: MovingAverageNode,
  movingAverageNode: MovingAverageNode,
  conditionNode: ConditionNode,
  alertNode: AlertNode
};

// Canonical Day 2 initial rule graph
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

function FlowCanvas({ ruleName, setRuleName, onOpenJsonModal }) {
  const reactFlowWrapper = useRef(null);

  // Load saved state from localStorage if present
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

  const [toast, setToast] = useState(null);
  const { screenToFlowPosition } = useReactFlow();

  const showToast = (type, message) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

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

  // Attach callbacks to nodes when rendered
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
  }, [updateNodeData, handleMetricChange, handleOpChange, handleConditionChange, handleAlertChange, duplicateNode, setNodes]);

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
    [screenToFlowPosition, setNodes, updateNodeData, handleMetricChange, handleOpChange, handleConditionChange, handleAlertChange, duplicateNode]
  );

  // Save Rule & Generate Clean JSON Payload
  const handleSaveRule = () => {
    const validation = validateGraph(nodes, edges);
    if (!validation.valid) {
      showToast("error", validation.message);
      return;
    }

    const formattedNodes = nodes.map((n) => {
      const base = { id: n.id };
      if (n.type === "sensorNode") {
        base.type = "sensor";
        base.data = {
          sensor: n.data.sensor || "temperature",
          sensorId: n.data.sensorId || "T-001"
        };
      } else if (n.type === "processingNode" || n.type === "movingAverageNode") {
        base.type = "movingAverage";
        base.data = { window: n.data.window ?? 5 };
      } else if (n.type === "conditionNode") {
        base.type = "condition";
        base.data = {
          operator: n.data.operator || ">",
          value: n.data.value ?? 80
        };
      } else if (n.type === "alertNode") {
        const actionType = (n.data.actionType || "SMS").toLowerCase();
        base.type = actionType;
        base.data = {
          severity: (n.data.severity || "High").toLowerCase()
        };
        if (actionType === "sms") base.data.phone = n.data.phone || "+919876543210";
        if (actionType === "email") base.data.email = n.data.email || "admin@nexusflow.io";
      }
      return base;
    });

    const formattedEdges = edges.map((e) => ({
      source: e.source,
      target: e.target
    }));

    const rulePayload = {
      name: ruleName || "High Turbine Temperature",
      nodes: formattedNodes,
      edges: formattedEdges
    };

    console.log("=========================================");
    console.log("🚀 NEXUSFLOW RULE GRAPH COMPILER JSON");
    console.log("=========================================");
    console.log(JSON.stringify(rulePayload, null, 2));

    try {
      const fullStorage = {
        name: ruleName,
        nodes,
        edges,
        compiled: rulePayload
      };
      localStorage.setItem("nexusflow_rule_data", JSON.stringify(fullStorage));
      showToast("success", "✅ Rule validated & saved to localStorage! Check console.");
    } catch (e) {
      console.error("Storage error:", e);
      showToast("error", "Error writing to localStorage.");
    }
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

  const handleReset = () => {
    setNodes(defaultInitialNodes);
    setEdges(defaultInitialEdges);
    setRuleName("High Turbine Temperature");
    showToast("info", "Reset canvas to standard Moving Average → Condition → SMS rule.");
  };

  const currentValidation = validateGraph(nodes, edges);

  return (
    <div className="flow-canvas-container" ref={reactFlowWrapper}>
      {toast && <div className={`save-toast-banner ${toast.type}`}>{toast.message}</div>}

      <div className="canvas-header-bar">
        <div className="canvas-info">
          <span className={`canvas-status-dot ${currentValidation.valid ? "valid" : "invalid"}`}></span>
          <span className="canvas-status-text">
            {currentValidation.valid ? "Rule Valid" : "Rule Needs Attention"}
          </span>
          <span className="canvas-node-count">
            ({nodes.length} nodes, {edges.length} edges)
          </span>
        </div>

        <div className="canvas-actions">
          <button className="btn-secondary" onClick={handleDuplicateSelected} title="Duplicate Selected Node">
            📋 Duplicate
          </button>
          <button className="btn-secondary" onClick={handleDeleteSelected} title="Delete Selected Node">
            🗑️ Delete
          </button>
          <button
            className="btn-secondary"
            onClick={() => onOpenJsonModal({ nodes, edges, name: ruleName })}
            title="Inspect Rule JSON payload"
          >
            🔍 View Graph JSON
          </button>
          <button className="btn-secondary" onClick={handleReset}>
            Reset Sample
          </button>
          <button className="btn-save" onClick={handleSaveRule}>
            💾 Save Rule
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
  );
}

export default function FlowBuilder() {
  const [ruleName, setRuleName] = useState(() => {
    try {
      const saved = localStorage.getItem("nexusflow_rule_data");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.name) return parsed.name;
      }
    } catch (e) {}
    return "High Turbine Temperature";
  });

  const [jsonModalData, setJsonModalData] = useState(null);

  return (
    <div className="flow-builder-page">
      <div className="flow-builder-header">
        <div className="flow-builder-title">
          <h2>NexusFlow Rule Builder</h2>
          <p>Visually construct automated telemetry threshold triggers & actions</p>
        </div>

        <div className="rule-name-input-group">
          <label htmlFor="rule-name-input">Rule Name:</label>
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

      <div className="flow-builder-workspace">
        <NodePanel />
        <div className="flow-canvas-wrapper">
          <ReactFlowProvider>
            <FlowCanvas ruleName={ruleName} setRuleName={setRuleName} onOpenJsonModal={(data) => setJsonModalData(data)} />
          </ReactFlowProvider>
        </div>
      </div>

      {/* JSON Viewer Modal */}
      {jsonModalData && (
        <div className="modal-backdrop" onClick={() => setJsonModalData(null)}>
          <div className="modal-content json-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Rule Compiler JSON (RxJS Backend Format)</h3>
              <button className="modal-close-btn" onClick={() => setJsonModalData(null)}>
                ✕
              </button>
            </div>
            <div className="modal-body">
              <p className="modal-desc">
                This clean JSON structure represents <strong>"{jsonModalData.name || "High Turbine Temperature"}"</strong> for backend rule compilation:
              </p>
              <pre className="json-code-block">
                {JSON.stringify(
                  {
                    name: jsonModalData.name || "High Turbine Temperature",
                    nodes: jsonModalData.nodes.map((n) => {
                      if (n.type === "sensorNode") {
                        return { id: n.id, type: "sensor", data: { sensor: n.data.sensor || "temperature", sensorId: n.data.sensorId || "T-001" } };
                      } else if (n.type === "processingNode" || n.type === "movingAverageNode") {
                        return { id: n.id, type: "movingAverage", data: { window: n.data.window ?? 5 } };
                      } else if (n.type === "conditionNode") {
                        return { id: n.id, type: "condition", data: { operator: n.data.operator || ">", value: n.data.value ?? 80 } };
                      } else if (n.type === "alertNode") {
                        const act = (n.data.actionType || "SMS").toLowerCase();
                        return {
                          id: n.id,
                          type: act,
                          data: {
                            severity: (n.data.severity || "High").toLowerCase(),
                            ...(act === "sms" ? { phone: n.data.phone || "+919876543210" } : {}),
                            ...(act === "email" ? { email: n.data.email || "admin@nexusflow.io" } : {})
                          }
                        };
                      }
                      return { id: n.id, type: n.type, data: n.data };
                    }),
                    edges: jsonModalData.edges.map((e) => ({
                      source: e.source,
                      target: e.target
                    }))
                  },
                  null,
                  2
                )}
              </pre>
            </div>
            <div className="modal-footer">
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
