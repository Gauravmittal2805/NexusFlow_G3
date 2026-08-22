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

    if (nodeType === "sensorNode" || data.sensor) {
      base.type = "sensor";
      base.data = {
        sensor: data.sensor || "temperature",
        sensorId: data.sensorId || "T-001"
      };
    } else if (nodeType === "movingAverageNode" || nodeType === "processingNode" || data.operation) {
      base.type = data.operation === "average" ? "average" : "movingAverage";
      base.data = {
        window: Number(data.window ?? 5),
        operation: data.operation || "movingAverage"
      };
    } else if (nodeType === "conditionNode" || data.operator !== undefined) {
      base.type = "condition";
      base.data = {
        operator: data.operator || ">",
        value: Number(data.value ?? 80)
      };
    } else if (nodeType === "alertNode" || data.actionType) {
      const act = (data.actionType || "SMS").toLowerCase();
      base.type = act === "email" ? "email" : act === "system" ? "system" : "sms";
      base.data = {
        severity: (data.severity || "High").toLowerCase(),
        ...(act === "sms" ? { phone: data.phone || "+919876543210" } : {}),
        ...(act === "email" ? { email: data.email || "admin@nexusflow.io" } : {})
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
      type = "sensorNode";
      const metric = node.data?.sensor || "temperature";
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
        sensor: metric,
        sensorId: node.data?.sensorId || "T-001",
        ...data
      };
    } else if (rawType === "movingaverage" || rawType === "movingaveragenode" || rawType === "processingnode" || rawType === "average") {
      type = "movingAverageNode";
      const op = node.data?.operation || (rawType === "average" ? "average" : "movingAverage");
      data = {
        label: op === "average" ? "Average Window" : "Moving Average",
        icon: op === "average" ? "📊" : "📈",
        operation: op,
        window: Number(node.data?.window ?? 5),
        ...data
      };
    } else if (rawType === "condition" || rawType === "conditionnode") {
      type = "conditionNode";
      const op = node.data?.operator || ">";
      const opLabels = {
        ">": "Greater Than",
        "<": "Less Than",
        "=": "Equals",
        ">=": "Greater or Equal",
        "<=": "Less or Equal"
      };
      data = {
        label: opLabels[op] || "Greater Than",
        icon: op,
        operator: op,
        value: Number(node.data?.value ?? 80),
        ...data
      };
    } else if (rawType === "sms" || rawType === "email" || rawType === "system" || rawType === "alertnode" || rawType === "alert") {
      type = "alertNode";
      const act = rawType === "email" ? "Email" : rawType === "system" ? "System" : "SMS";
      const actIcons = { SMS: "📱", Email: "✉️", System: "🚨" };
      data = {
        label: `${act} Alert`,
        icon: actIcons[act] || "📱",
        actionType: act,
        phone: node.data?.phone || "+919876543210",
        email: node.data?.email || "admin@nexusflow.io",
        severity: node.data?.severity ? (node.data.severity.charAt(0).toUpperCase() + node.data.severity.slice(1)) : "High",
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
