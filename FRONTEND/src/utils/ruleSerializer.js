/**
 * ruleSerializer.js
 *
 * Dedicated Rule Graph Serializer & Deserializer for NexusFlow Rule Builder.
 * Converts between React Flow visual node/edge models and backend Rule API / Compiler JSON format.
 *
 * Responsibilities:
 * - serializeRule(nodes, edges, meta): Produces clean JSON with exact node & edge structures.
 * - deserializeRule(ruleData, callbacks): Reconstructs full React Flow nodes & edges with visual styling and bindings.
 */

import { MarkerType } from "@xyflow/react";

/**
 * Serializes React Flow nodes and edges into the exact Rule API format.
 *
 * @param {Array} nodes - React Flow node objects
 * @param {Array} edges - React Flow edge objects
 * @param {Object} [meta={}] - Optional metadata (name, description, id, isActive)
 * @returns {Object} Clean Rule JSON payload ready for POST /api/rules
 */
export function serializeRule(nodes = [], edges = [], meta = {}) {
  const cleanNodes = (nodes || []).map((node) => {
    const rawType = (node.type || "sensor").toLowerCase();
    const data = node.data || {};
    const id = String(node.id);

    // Normalize type and data shape strictly according to standard spec
    if (rawType === "sensor" || rawType === "sensornode") {
      return {
        id,
        type: "sensor",
        data: {
          sensorId: data.sensorId || data.sensor_id || "TURBINE-001",
          field: (data.field || data.sensor || "temperature").toLowerCase(),
        },
        position: node.position ? { x: node.position.x, y: node.position.y } : { x: 260, y: 50 },
      };
    }

    if (rawType === "condition" || rawType === "conditionnode") {
      const numericVal =
        data.value !== undefined && data.value !== null && data.value !== ""
          ? Number(data.value)
          : 80;

      return {
        id,
        type: "condition",
        data: {
          operator: data.operator || ">",
          value: isNaN(numericVal) ? 80 : numericVal,
        },
        position: node.position ? { x: node.position.x, y: node.position.y } : { x: 260, y: 200 },
      };
    }

    if (
      rawType === "action" ||
      rawType === "alert" ||
      rawType === "alertnode" ||
      rawType === "notification"
    ) {
      const act = (data.action || data.actionType || "ALERT").toUpperCase();
      const sev = (data.severity || "HIGH").toUpperCase();

      return {
        id,
        type: "action",
        data: {
          action: act,
          severity: sev,
        },
        position: node.position ? { x: node.position.x, y: node.position.y } : { x: 260, y: 350 },
      };
    }

    if (
      rawType === "math" ||
      rawType === "mathnode" ||
      rawType === "movingaverage" ||
      rawType === "movingaveragenode" ||
      rawType === "processingnode"
    ) {
      const op = data.operation || "movingAverage";
      const mathData = { operation: op };
      if (data.window !== undefined) mathData.window = Number(data.window) || 5;
      if (data.operand !== undefined) mathData.operand = Number(data.operand);
      if (data.field) mathData.field = data.field;
      if (data.outputField) mathData.outputField = data.outputField;

      return {
        id,
        type: "math",
        data: mathData,
        position: node.position ? { x: node.position.x, y: node.position.y } : { x: 260, y: 150 },
      };
    }

    // Default fallback for any other valid node types
    return {
      id,
      type: node.type,
      data: { ...data },
      position: node.position || { x: 0, y: 0 },
    };
  });

  // Clean edges: React Flow edge properties stripped to source and target
  const cleanEdges = (edges || []).map((edge) => ({
    source: String(edge.source),
    target: String(edge.target),
  }));

  const payload = {
    name: meta.name?.trim() || "High Temperature Alert",
    description: meta.description !== undefined ? meta.description.trim() : "",
    nodes: cleanNodes,
    edges: cleanEdges,
  };

  if (meta.id) payload.id = meta.id;
  if (meta._id) payload._id = meta._id;
  if (meta.isActive !== undefined) payload.isActive = Boolean(meta.isActive);

  return payload;
}

/**
 * Deserializes Rule JSON into full React Flow nodes & edges with visual styles and callbacks.
 *
 * @param {Object} ruleData - Rule JSON object from API or storage
 * @param {Object} [callbacks={}] - Event handlers (onChange, onDuplicate, onDelete)
 * @returns {{ id: string, name: string, description: string, nodes: Array, edges: Array, isActive: boolean }}
 */
export function deserializeRule(ruleData, callbacks = {}) {
  if (!ruleData || typeof ruleData !== "object") {
    return {
      id: `rule-${Date.now()}`,
      name: "New Rule",
      description: "",
      nodes: [],
      edges: [],
      isActive: true,
    };
  }

  const ruleId = ruleData._id || ruleData.id || `rule-${Date.now()}`;
  const ruleName = ruleData.name || "Untitled Rule";
  const ruleDescription = ruleData.description || "";
  const isActive = ruleData.isActive !== undefined ? Boolean(ruleData.isActive) : true;

  const FIELD_METRICS = {
    temperature: { label: "Temperature", icon: "🌡️", unit: "°C" },
    pressure: { label: "Pressure", icon: "⏲️", unit: "PSI" },
    humidity: { label: "Humidity", icon: "💧", unit: "%" },
    rpm: { label: "RPM", icon: "🔄", unit: "RPM" },
  };

  const ACTION_ICONS = {
    ALERT: "🚨",
    NOTIFICATION: "🔔",
    SMS: "📱",
    EMAIL: "✉️",
    SYSTEM: "📋",
  };

  const nodes = (ruleData.nodes || []).map((node, index) => {
    const rawType = (node.type || "").toLowerCase();
    const nodeId = String(node.id || `node-${index + 1}`);
    const nodeData = node.data || {};
    let type = "sensor";
    let enrichedData = { ...nodeData, ...callbacks };

    if (rawType === "sensor" || rawType === "sensornode") {
      type = "sensor";
      const field = (nodeData.field || nodeData.sensor || "temperature").toLowerCase();
      const metric = FIELD_METRICS[field] || FIELD_METRICS.temperature;
      const sensorId = nodeData.sensorId || nodeData.sensor_id || "TURBINE-001";

      enrichedData = {
        sensorId,
        field,
        sensor: field,
        label: `${metric.label} Sensor`,
        icon: metric.icon,
        unit: metric.unit,
        ...enrichedData,
      };
    } else if (rawType === "condition" || rawType === "conditionnode") {
      type = "condition";
      const op = nodeData.operator || ">";
      const val = nodeData.value !== undefined ? Number(nodeData.value) : 80;

      enrichedData = {
        operator: op,
        value: isNaN(val) ? 80 : val,
        label: `Condition (${op} ${isNaN(val) ? 80 : val})`,
        icon: op,
        ...enrichedData,
      };
    } else if (
      rawType === "action" ||
      rawType === "alert" ||
      rawType === "alertnode" ||
      rawType === "notification"
    ) {
      type = "action";
      const act = (nodeData.action || nodeData.actionType || "ALERT").toUpperCase();
      const sev = (nodeData.severity || "HIGH").toUpperCase();

      enrichedData = {
        action: act,
        actionType: act,
        severity: sev,
        label: `${act} Action`,
        icon: ACTION_ICONS[act] || "🚨",
        ...enrichedData,
      };
    } else if (
      rawType === "math" ||
      rawType === "mathnode" ||
      rawType === "movingaverage" ||
      rawType === "movingaveragenode" ||
      rawType === "processingnode"
    ) {
      type = "math";
      const op = nodeData.operation || "movingAverage";
      const win = nodeData.window !== undefined ? Number(nodeData.window) : 5;

      enrichedData = {
        operation: op,
        window: win,
        label: op === "average" ? "Average Window" : "Moving Average",
        icon: "📈",
        ...enrichedData,
      };
    } else {
      type = node.type || "sensor";
    }

    const defaultPosition = { x: 260, y: 50 + index * 160 };

    return {
      id: nodeId,
      type,
      position: node.position || defaultPosition,
      data: enrichedData,
    };
  });

  const edges = (ruleData.edges || []).map((edge, index) => ({
    id: edge.id || `edge-${edge.source}-${edge.target}-${index}`,
    source: String(edge.source),
    target: String(edge.target),
    animated: true,
    style: { stroke: "#6366f1", strokeWidth: 2 },
    markerEnd: {
      type: MarkerType.ArrowClosed,
      width: 16,
      height: 16,
      color: "#6366f1",
    },
  }));

  return {
    id: ruleId,
    _id: ruleData._id || (ruleId.length === 24 ? ruleId : undefined),
    name: ruleName,
    description: ruleDescription,
    nodes,
    edges,
    isActive,
  };
}

export default {
  serializeRule,
  deserializeRule,
};
