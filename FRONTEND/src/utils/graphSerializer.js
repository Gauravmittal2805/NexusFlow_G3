/**
 * Graph Serializer & Deserializer for NexusFlow Rule Builder
 * Bridges React Flow UI representations with the clean Compiler JSON schema.
 */
import { MarkerType } from "@xyflow/react";

/**
 * Serializes React Flow nodes & edges into clean, standard NexusFlow Rule JSON
 * @param {string} ruleName Name of the rule
 * @param {Array} nodes React Flow nodes
 * @param {Array} edges React Flow edges
 * @param {string} ruleId Optional rule identifier
 * @returns {Object} Clean rule JSON payload ready for compiler and storage
 */
export function serializeGraph(ruleName, nodes, edges, ruleId = null) {
  const cleanNodes = (nodes || []).map((node) => {
    const base = {
      id: String(node.id),
      position: node.position || { x: 0, y: 0 }
    };

    const nodeType = node.type || "sensorNode";
    const data = node.data || {};

    if (nodeType === "sensor" || nodeType === "sensorNode" || data.sensor || data.field) {
      base.type = "sensor";
      base.data = {
        sensorId: data.sensorId || data.sensor_id || "TURBINE-001",
        field: data.field || data.sensor || "temperature"
      };
    } else if (nodeType === "condition" || nodeType === "conditionNode" || data.operator !== undefined) {
      base.type = "condition";
      base.data = {
        operator: data.operator || ">",
        value: Number(data.value ?? 80)
      };
    } else if (nodeType === "math" || nodeType === "mathNode" || nodeType === "movingAverageNode" || nodeType === "processingNode" || data.operation) {
      base.type = "math";
      base.data = {
        operation: data.operation || "movingAverage",
        window: Number(data.window ?? 5)
      };
    } else if (nodeType === "action" || nodeType === "alertNode" || data.action || data.actionType) {
      const act = (data.action || data.actionType || "ALERT").toUpperCase();
      const sev = (data.severity || "HIGH").toUpperCase();
      base.type = "action";
      base.data = {
        action: act,
        severity: sev
      };
    } else {
      base.type = nodeType;
      base.data = { ...data };
    }

    return base;
  });

  const cleanEdges = (edges || []).map((edge, idx) => ({
    id: edge.id || `edge-${edge.source}-${edge.target}-${idx}`,
    source: String(edge.source),
    target: String(edge.target)
  }));

  return {
    id: ruleId || `rule-${Date.now()}`,
    name: ruleName?.trim() || "Untitled Rule",
    nodes: cleanNodes,
    edges: cleanEdges,
    updatedAt: new Date().toISOString()
  };
}

/**
 * Deserializes clean rule JSON back into full React Flow nodes & edges
 * @param {Object} ruleData Serialized rule data
 * @param {Object} callbacks Event handlers to bind to node.data (onChange, onDuplicate, etc.)
 * @returns {Object} { ruleName, nodes, edges }
 */
export function deserializeGraph(ruleData, callbacks = {}) {
  if (!ruleData) {
    return { ruleName: "High Turbine Temperature", nodes: [], edges: [] };
  }

  const ruleName = ruleData.name || "High Turbine Temperature";

  const nodes = (ruleData.nodes || []).map((node, index) => {
    let type = "sensorNode";
    let data = { ...node.data, ...callbacks };

    const rawType = (node.type || "").toLowerCase();

    if (rawType === "sensor" || rawType === "sensornode") {
      type = "sensor";
      const metric = node.data?.field || node.data?.sensor || "temperature";
      const metricLabels = {
        temperature: { label: "Temperature", icon: "🌡️", unit: "°C" },
        humidity: { label: "Humidity", icon: "💧", unit: "%" },
        pressure: { label: "Pressure", icon: "⏲️", unit: "PSI" },
        rpm: { label: "RPM", icon: "🔄", unit: "RPM" }
      };
      const info = metricLabels[metric] || metricLabels.temperature;
      data = {
        label: `${info.label} Sensor`,
        icon: info.icon,
        unit: info.unit,
        field: metric,
        sensor: metric,
        sensorId: node.data?.sensorId || node.data?.sensor_id || "TURBINE-001",
        ...data
      };
    } else if (rawType === "math" || rawType === "mathnode" || rawType === "movingaverage" || rawType === "movingaveragenode" || rawType === "processingnode" || rawType === "average") {
      type = "math";
      const op = node.data?.operation || (rawType === "average" ? "average" : "movingAverage");
      data = {
        label: op === "average" ? "Average Window" : "Moving Average",
        icon: op === "average" ? "📊" : "📈",
        operation: op,
        window: Number(node.data?.window ?? 5),
        ...data
      };
    } else if (rawType === "condition" || rawType === "conditionnode") {
      type = "condition";
      const op = node.data?.operator || ">";
      const opLabels = {
        ">": "Greater Than",
        "<": "Less Than",
        "=": "Equals",
        "==": "Equals",
        "!=": "Not Equals",
        ">=": "Greater or Equal",
        "<=": "Less or Equal"
      };
      data = {
        label: opLabels[op] || "Condition",
        icon: op,
        operator: op,
        field: node.data?.field || node.data?.sensor || "temperature",
        value: Number(node.data?.value ?? 80),
        ...data
      };
    } else if (rawType === "action" || rawType === "alert" || rawType === "notification" || rawType === "sms" || rawType === "email" || rawType === "system" || rawType === "alertnode") {
      type = "action";
      const act = (node.data?.action || node.data?.actionType || (rawType === "email" ? "EMAIL" : rawType === "system" ? "SYSTEM" : rawType === "notification" ? "NOTIFICATION" : "ALERT")).toUpperCase();
      const actIcons = { ALERT: "🚨", NOTIFICATION: "🔔", SMS: "📱", EMAIL: "✉️", SYSTEM: "📋" };
      data = {
        label: `${act} Action`,
        icon: actIcons[act] || "🚨",
        action: act,
        actionType: act,
        phone: node.data?.phone || "+919876543210",
        email: node.data?.email || "admin@nexusflow.io",
        severity: node.data?.severity || "High",
        ...data
      };
    }

    const defaultPosition = { x: 260, y: 50 + index * 150 };
    return {
      id: String(node.id),
      type,
      position: node.position || defaultPosition,
      data
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
      color: "#6366f1"
    }
  }));

  return {
    id: ruleData.id || `rule-${Date.now()}`,
    ruleName,
    nodes,
    edges
  };
}
