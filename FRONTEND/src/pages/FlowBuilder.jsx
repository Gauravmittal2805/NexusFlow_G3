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
import RuleStatus from "../components/RuleStatus";
import RuleExecutionStatus from "../components/RuleExecutionStatus";

import { nodeTypes } from "../components/ruleNodes";
import {
  validateGraph,
  validateConnectionWithReason,
  getValidationChecklist
} from "../utils/graphValidation";
import { serializeRule, deserializeRule } from "../utils/ruleSerializer";
import {
  createRule,
  updateRule,
  getRuleById,
  getRuleStatus,
  getRules,
  refreshRule,
  updateRuleStatus
} from "../services/ruleService";
import { subscribeToRuleTrigger, connectSocket } from "../services/socket";
import { useSearchParams } from "react-router-dom";

/**
 * Sanitize compiler and validation errors to human-friendly messages,
 * avoiding raw TypeError or JS stack traces.
 */
function sanitizeCompilationError(error) {
  if (!error) return "Rule could not be executed.";
  let msg = typeof error === "string" ? error : error.message || error.error || JSON.stringify(error);
  msg = msg.replace(/^Error:\s*/i, "");
  msg = msg.replace(/^TypeError:\s*/i, "");
  msg = msg.replace(/^CompilationError:\s*/i, "");
  msg = msg.replace(/^ValidationError:\s*/i, "");
  msg = msg.replace(/^Complete the rule before saving:\s*/i, "");

  if (
    msg.toLowerCase().includes("cannot read properties") ||
    msg.toLowerCase().includes("missing a value") ||
    msg.toLowerCase().includes("threshold value is required") ||
    msg.toLowerCase().includes("condition node is missing")
  ) {
    return "Condition node is missing a value.";
  }
  if (msg.toLowerCase().includes("sensor id is required") || msg.toLowerCase().includes("missing sensor")) {
    return "Sensor node is missing a sensor ID.";
  }
  if (msg.toLowerCase().includes("action type is required") || msg.toLowerCase().includes("missing action")) {
    return "Action node is missing an action type.";
  }
  return msg;
}

// Canonical initial default pipeline (Sensor -> Condition -> Action)
const defaultInitialRule = {
  id: "rule-default-1",
  name: "High Temperature Alert",
  description: "Temperature exceeds 80°C",
  isActive: true,
  status: "ACTIVE",
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
  isRuleActive,
  setIsRuleActive,
  ruleStatus,
  setRuleStatus,
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
  const [isToggling, setIsToggling] = useState(false);
  const [isLoadingRule, setIsLoadingRule] = useState(false);
  const [compilationFeedback, setCompilationFeedback] = useState(null);
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

  // Initialize Rule ID, Name & Status on first render and connect live socket listener
  useEffect(() => {
    if (initialData.id || initialData._id) setActiveRuleId(initialData._id || initialData.id);
    if (initialData.name) setRuleName(initialData.name);
    if (initialData.description) setRuleDescription(initialData.description);
    const activeFlag = initialData.status !== undefined
      ? initialData.status === "ACTIVE" || initialData.status === "RUNNING"
      : initialData.isActive !== false;
    setIsRuleActive(activeFlag);
    setRuleStatus(initialData.status || (activeFlag ? "RUNNING" : "INACTIVE"));

    // Step 1: Query backend for true runtime status if saved rule ID exists
    const targetId = initialData._id || initialData.id;
    if (targetId && /^[0-9a-fA-F]{24}$/.test(targetId)) {
      getRuleStatus(targetId)
        .then((res) => {
          if (res?.data?.status) {
            setRuleStatus(res.data.status);
            setIsRuleActive(Boolean(res.data.isActive));
          }
        })
        .catch((err) => {
          console.warn("Rule status query note:", err.message);
        });
    }
  }, []);

  // Step 5 & 6: Connect Real-Time Rule Trigger Event & Update Status Without Refresh
  useEffect(() => {
    connectSocket();

    const unsubscribe = subscribeToRuleTrigger((data) => {
      if (!data) return;

      const isMatching =
        !activeRuleId ||
        data.ruleId === activeRuleId ||
        (ruleName && data.ruleName && data.ruleName.trim().toLowerCase() === ruleName.trim().toLowerCase());

      if (isMatching) {
        setRuleStatus("TRIGGERED");
        setTimeout(() => {
          setRuleStatus(isRuleActive ? "RUNNING" : "INACTIVE");
        }, 2500);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [activeRuleId, ruleName, isRuleActive]);

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

  // Step 2, 3 & 8: Toggle Rule Runtime Status (Enable / Disable Control connected to backend)
  const handleToggleActiveStatus = async () => {
    const nextStatus = !isRuleActive;
    const nextStatusText = nextStatus ? "RUNNING" : "INACTIVE";

    setIsToggling(true);
    setIsRuleActive(nextStatus);
    setRuleStatus(nextStatusText);

    if (activeRuleId && /^[0-9a-fA-F]{24}$/.test(activeRuleId)) {
      try {
        await updateRuleStatus(activeRuleId, nextStatus);
        if (nextStatus) {
          showToast("success", `✓ Rule enabled — runtime pipeline active`);
          setCompilationFeedback({
            status: "success",
            message: "✓ Rule compiled and running successfully"
          });
        } else {
          showToast("info", `○ Rule disabled — runtime execution stopped`);
          setCompilationFeedback(null);
        }
      } catch (err) {
        console.warn("Failed to update status on backend:", err.message);
        showToast("error", "✕ Unable to update rule.");
      } finally {
        setIsToggling(false);
      }
    } else {
      setIsToggling(false);
      if (nextStatus) {
        showToast("info", `Status set to Active (click Save Rule to start runtime)`);
      } else {
        showToast("info", `Status set to Inactive`);
      }
    }

    // Persist to localStorage cache
    try {
      const raw = localStorage.getItem("nexusflow_rules");
      if (raw) {
        const list = JSON.parse(raw);
        const updated = list.map((r) =>
          (r._id === activeRuleId || r.id === activeRuleId)
            ? { ...r, isActive: nextStatus, status: nextStatusText }
            : r
        );
        localStorage.setItem("nexusflow_rules", JSON.stringify(updated));
      }
    } catch (e) {}
  };

  // Step 4, 5, 6: Save Rule (Validation -> Serialization -> LocalStorage + Backend API POST/PUT)
  const handleSaveRule = async () => {
    // Step 7: Rule name validation
    if (!ruleName || typeof ruleName !== "string" || ruleName.trim() === "") {
      showToast("error", "⚠ Please enter a rule name before saving.");
      return;
    }

    // Step 3 & 6: Handle Invalid Rules - Validation check with sanitized human-friendly message
    const validation = validateGraph(nodes, edges);
    if (!validation.valid) {
      const cleanError = sanitizeCompilationError(validation.message || validation.errors?.[0] || "Condition node is missing a value.");
      showToast("error", `⚠ Rule could not be executed: ${cleanError}`);
      setCompilationFeedback({
        status: "error",
        message: `⚠ Rule could not be executed: ${cleanError}`
      });
      setRuleStatus("COMPILATION_FAILED");
      return;
    }

    setIsSaving(true);

    const isExistingMongoId = Boolean(
      activeRuleId &&
      activeRuleId.length === 24 &&
      /^[0-9a-fA-F]{24}$/.test(activeRuleId)
    );

    // Serialization via ruleSerializer.js
    const cleanPayload = serializeRule(nodes, edges, {
      name: ruleName.trim(),
      description: ruleDescription ? ruleDescription.trim() : "",
      id: activeRuleId,
      _id: isExistingMongoId ? activeRuleId : undefined,
      isActive: isRuleActive,
      status: isRuleActive ? "RUNNING" : "INACTIVE"
    });

    console.log("=========================================");
    console.log("🚀 SERIALIZED RULE JSON PAYLOAD (POST /api/rules)");
    console.log("=========================================");
    console.log(JSON.stringify(cleanPayload, null, 2));

    try {
      let savedRuleId = activeRuleId;
      let backendSaved = false;
      let compileSuccess = false;

      // Connect to backend API: POST /api/rules or PUT /api/rules/:id
      try {
        let res;
        if (isExistingMongoId) {
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
          compileSuccess = res.data?.compiled !== false;
        }

        // Step 1, Step 4 & Step 8: Show save/update state
        if (isExistingMongoId) {
          showToast("success", "✓ Rule updated successfully");
        } else {
          showToast("success", "✓ Rule created successfully");
        }

        // Step 2 & 5: Add compilation/execution feedback
        if (isRuleActive) {
          if (compileSuccess) {
            setRuleStatus("RUNNING");
            setCompilationFeedback({
              status: "success",
              message: "✓ Rule compiled and running successfully"
            });
          } else {
            setRuleStatus("COMPILATION_FAILED");
            setCompilationFeedback({
              status: "error",
              message: "⚠ Rule could not be executed"
            });
          }
        } else {
          setRuleStatus("INACTIVE");
          setCompilationFeedback({
            status: "info",
            message: "○ Rule saved (Inactive)"
          });
        }
      } catch (backendError) {
        console.warn("Backend save failed:", backendError.response?.data?.message || backendError.message);

        // Step 3: Don't expose raw backend errors like TypeError
        const rawBackendMsg = backendError.response?.data?.message || backendError.message || "Rule compilation failed";
        const cleanMsg = sanitizeCompilationError(rawBackendMsg);

        showToast("error", `⚠ Rule could not be executed: ${cleanMsg}`);
        setCompilationFeedback({
          status: "error",
          message: `⚠ Rule could not be executed: ${cleanMsg}`
        });
        setRuleStatus("COMPILATION_FAILED");
      }

      // Save to localStorage under `nexusflow_rules`
      const ruleIdForStorage = savedRuleId || `rule-${Date.now()}`;
      const ruleForStorage = {
        ...cleanPayload,
        id: ruleIdForStorage,
        _id: savedRuleId && savedRuleId.length === 24 ? savedRuleId : undefined,
        isActive: isRuleActive,
        status: isRuleActive ? "RUNNING" : "INACTIVE",
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

    } catch (e) {
      console.error("Storage error:", e);
      showToast("error", "✕ Failed to save rule");
    } finally {
      setIsSaving(false);
    }
  };

  // Step 1, 7 & 10: Load a saved rule from My Rules into canvas (GET /api/rules/:id and GET /api/rules/:id/status)
  const handleLoadSavedRule = async (ruleDataOrId) => {
    setIsLoadingRule(true);
    let targetRule = ruleDataOrId;

    try {
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
        showToast("error", "✕ Unable to update rule.");
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

      const activeFlag = targetRule.status !== undefined
        ? targetRule.status === "ACTIVE" || targetRule.status === "RUNNING"
        : targetRule.isActive !== false;
      setIsRuleActive(activeFlag);
      setRuleStatus(targetRule.status || (activeFlag ? "RUNNING" : "INACTIVE"));

      // Query backend for real runtime status
      const targetRuleId = targetRule._id || targetRule.id;
      if (targetRuleId && /^[0-9a-fA-F]{24}$/.test(targetRuleId)) {
        getRuleStatus(targetRuleId)
          .then((res) => {
            if (res?.data?.status) {
              setRuleStatus(res.data.status);
              setIsRuleActive(Boolean(res.data.isActive));
              if (res.data.status === "RUNNING") {
                setCompilationFeedback({
                  status: "success",
                  message: "✓ Rule compiled and running successfully"
                });
              } else if (res.data.status === "COMPILATION_FAILED") {
                setCompilationFeedback({
                  status: "error",
                  message: "⚠ Rule could not be executed"
                });
              }
            }
          })
          .catch(() => {});
      }

      setCompilationFeedback(
        activeFlag
          ? { status: "success", message: "✓ Rule compiled and running successfully" }
          : { status: "info", message: "○ Rule loaded (Inactive)" }
      );

      localStorage.setItem("nexusflow_active_rule_id", deserialized.id);

      showToast("info", `Loaded rule: "${deserialized.name}"`);
      setTimeout(() => fitView({ padding: 0.2, duration: 400 }), 50);
    } catch (err) {
      console.error("Error loading rule:", err);
      showToast("error", "✕ Unable to update rule.");
    } finally {
      setIsLoadingRule(false);
    }
  };

  // Automatic rule loading when navigating from My Rules or Alerts (e.g. /flow?id=xyz or /flow?ruleId=xyz)
  const [searchParams] = useSearchParams();
  const urlRuleId = searchParams.get("id") || searchParams.get("ruleId");

  useEffect(() => {
    if (!urlRuleId) return;

    let isMounted = true;
    const loadRuleFromParam = async () => {
      // 1. Fetch from backend API
      try {
        const res = await getRuleById(urlRuleId);
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
    setIsRuleActive(true);
    setRuleStatus("DRAFT");
    setCompilationFeedback(null);
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
    setIsRuleActive(true);
    setRuleStatus("DRAFT");
    setCompilationFeedback(null);
    showToast("info", "Started new rule.");
  };

  // Reset to default sample pipeline
  const handleResetSample = () => {
    handleLoadSavedRule(defaultInitialRule);
  };

  const validationState = validateGraph(nodes, edges);
  const checklist = getValidationChecklist(nodes, edges);

  // Find latest selected node from nodes state so changes reflect immediately
  const activeSelectedNode = nodes.find((n) => selectedNode && n.id === selectedNode.id) || null;

  return (
    <div className="flow-builder-container" ref={reactFlowWrapper}>
      {/* Toast Alert Banner */}
      {toast && <div className={`save-toast-banner ${toast.type}`}>{toast.message}</div>}

      {/* ─── Center Canvas Header Bar ─── */}
      <div className="canvas-header-bar">
        <div className="canvas-info-group">
          {/* Step 1 & 2: Rule Runtime Status Indicator and Enable/Disable Control */}
          <div className="rule-runtime-control-bar">
            <span className="runtime-status-label">
              Status:
              <span className={`status-pill ${
                ruleStatus === "COMPILATION_FAILED"
                  ? "compilation-failed"
                  : ruleStatus === "TRIGGERED"
                  ? "triggered"
                  : ruleStatus === "RUNNING"
                  ? "running"
                  : ruleStatus === "ACTIVE"
                  ? "active"
                  : ruleStatus === "DRAFT"
                  ? "draft"
                  : "inactive"
              }`}>
                <span className="status-dot-symbol">
                  {ruleStatus === "COMPILATION_FAILED"
                    ? "⚠"
                    : ruleStatus === "TRIGGERED"
                    ? "⚡"
                    : ruleStatus === "RUNNING"
                    ? "●"
                    : ruleStatus === "ACTIVE"
                    ? "●"
                    : ruleStatus === "DRAFT"
                    ? "📝"
                    : "○"}
                </span>
                <span className="status-name-text">
                  {ruleStatus === "COMPILATION_FAILED"
                    ? "Compilation Failed"
                    : ruleStatus === "TRIGGERED"
                    ? "Triggered"
                    : ruleStatus === "RUNNING"
                    ? "Running"
                    : ruleStatus === "ACTIVE"
                    ? "Active"
                    : ruleStatus === "DRAFT"
                    ? "Draft"
                    : "Inactive"}
                </span>
              </span>
            </span>

            <button
              className={`btn-control-enable-disable ${isRuleActive ? "btn-disable-action" : "btn-enable-action"}`}
              onClick={handleToggleActiveStatus}
              disabled={isToggling}
              title={isRuleActive ? "Click to Disable rule runtime execution" : "Click to Enable rule runtime execution"}
            >
              {isToggling ? "..." : isRuleActive ? "Disable" : "Enable"}
            </button>
          </div>

          {/* Loading Rule UI State (Step 10) */}
          {isLoadingRule && (
            <div className="loading-rule-pill-bar">
              <span className="loading-spinner-symbol">⏳</span> Loading rule...
            </div>
          )}

          {/* Step 5: Compilation Feedback Display */}
          {compilationFeedback && (
            <div className={`compilation-status-badge ${compilationFeedback.status}`}>
              {compilationFeedback.message}
            </div>
          )}

          {/* Graph Validation Summary Indicator */}
          <div className="canvas-validation-indicator">
            <span className={`canvas-status-dot ${validationState.valid ? "valid" : "invalid"}`}></span>
            <span className="canvas-status-text">
              {validationState.valid ? "Rule Complete & Connected" : "⚠ Incomplete Rule"}
            </span>
            <span className="canvas-node-count">
              ({nodes.length} nodes, {edges.length} edges)
            </span>
          </div>
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
                  id: activeRuleId,
                  isActive: isRuleActive,
                  status: isRuleActive ? "ACTIVE" : "INACTIVE"
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
            {isSaving
              ? (activeRuleId && activeRuleId.length === 24 && /^[0-9a-fA-F]{24}$/.test(activeRuleId)
                  ? "💾 Updating rule..."
                  : "💾 Saving rule...")
              : (activeRuleId && activeRuleId.length === 24 && /^[0-9a-fA-F]{24}$/.test(activeRuleId)
                  ? "💾 Update Rule"
                  : "💾 Save Rule")}
          </button>
        </div>
      </div>

      {/* Step 6 Checklist Warning Banner (shown when graph is incomplete) */}
      {!validationState.valid && (
        <div className="graph-validation-checklist-banner">
          <div className="checklist-title">
            <span>⚠ Complete the rule before saving:</span>
          </div>
          <div className="checklist-items">
            <span className={`checklist-chip ${checklist.hasSensor ? "passed" : "failed"}`}>
              {checklist.hasSensor ? "✓" : "✕"} Sensor exists
            </span>
            <span className={`checklist-chip ${checklist.hasCondition ? "passed" : "failed"}`}>
              {checklist.hasCondition ? "✓" : "✕"} Condition exists
            </span>
            <span className={`checklist-chip ${checklist.hasAction ? "passed" : "failed"}`}>
              {checklist.hasAction ? "✓" : "✕"} Action exists
            </span>
            <span className={`checklist-chip ${checklist.nodesConnected ? "passed" : "failed"}`}>
              {checklist.nodesConnected ? "✓" : "✕"} Nodes connected
            </span>
            <span className={`checklist-chip ${checklist.configComplete ? "passed" : "failed"}`}>
              {checklist.configComplete ? "✓" : "✕"} Node configuration complete
            </span>
          </div>
        </div>
      )}

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

        {/* ─── Right Side Panel (Tabs: Node Config | Monitor | My Rules) ─── */}
        <div className="flow-right-sidebar">
          <div className="right-panel-tabs">
            <button
              className={`panel-tab-btn ${rightPanelTab === "config" ? "active" : ""}`}
              onClick={() => setRightPanelTab("config")}
            >
              ⚙️ Node Config
            </button>
            <button
              className={`panel-tab-btn ${rightPanelTab === "monitor" ? "active" : ""}`}
              onClick={() => setRightPanelTab("monitor")}
            >
              ⚡ Monitor
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
            ) : rightPanelTab === "monitor" ? (
              <RuleExecutionStatus
                ruleId={activeRuleId}
                ruleName={ruleName}
                isRuleActive={isRuleActive}
                ruleStatus={ruleStatus}
                compilationStatus={compilationFeedback}
                onTriggerUpdate={(trigger) => {
                  console.log("⚡ Live trigger update in FlowBuilder:", trigger);
                }}
              />
            ) : (
              <SavedRulesPanel
                activeRuleId={activeRuleId}
                onLoadRule={handleLoadSavedRule}
                onNewRule={handleCreateNewRule}
                onDeleteRule={handleDeleteSavedRule}
                onStatusChange={(ruleId, newStatus) => {
                  if (ruleId === activeRuleId) {
                    setIsRuleActive(newStatus);
                    setRuleStatus(newStatus ? "ACTIVE" : "INACTIVE");
                  }
                }}
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
  const [isRuleActive, setIsRuleActive] = useState(true);
  const [ruleStatus, setRuleStatus] = useState("ACTIVE");
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

        {/* Rule Name & Description Inputs & Status */}
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
              isRuleActive={isRuleActive}
              setIsRuleActive={setIsRuleActive}
              ruleStatus={ruleStatus}
              setRuleStatus={setRuleStatus}
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
