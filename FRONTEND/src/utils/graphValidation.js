/**
 * graphValidation.js
 *
 * Graph & Node Configuration Validation Utilities for NexusFlow Rule Builder.
 * Ensures the visual rule graph is structurally sound, fully connected,
 * free of cycles, and all nodes have complete configurations before saving.
 */

export const VALID_NODE_TYPES = new Set([
  "sensor",
  "sensornode",
  "condition",
  "conditionnode",
  "action",
  "alert",
  "alertnode",
  "notification",
  "math",
  "mathnode",
  "movingaverage",
  "movingaveragenode",
  "processingnode"
]);

/**
 * Validates individual node configuration fields.
 * Ensures no incomplete or blank fields are saved.
 *
 * @param {Array} nodes - React Flow nodes array
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateNodeConfig(nodes = []) {
  const errors = [];

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const rawType = (node.type || "").toLowerCase();
    const data = node.data || {};
    const nodeLabel = data.label || node.id || `Node ${i + 1}`;

    if (rawType === "sensor" || rawType === "sensornode") {
      const sensorId = data.sensorId || data.sensor_id;
      const field = data.field || data.sensor;

      if (!sensorId || String(sensorId).trim() === "") {
        errors.push(`Sensor node "${nodeLabel}": Sensor ID is required.`);
      }
      if (!field || String(field).trim() === "") {
        errors.push(`Sensor node "${nodeLabel}": Field is required.`);
      }
    } else if (rawType === "condition" || rawType === "conditionnode") {
      const operator = data.operator;
      const value = data.value;

      if (!operator || String(operator).trim() === "") {
        errors.push(`Condition node "${nodeLabel}": Operator is required.`);
      }
      if (value === undefined || value === null || value === "" || isNaN(Number(value))) {
        errors.push(`Condition node "${nodeLabel}": Threshold value is required.`);
      }
    } else if (
      rawType === "action" ||
      rawType === "alert" ||
      rawType === "alertnode" ||
      rawType === "notification"
    ) {
      const action = data.action || data.actionType;
      const severity = data.severity;

      if (!action || String(action).trim() === "") {
        errors.push(`Action node "${nodeLabel}": Action type is required.`);
      }
      if (!severity || String(severity).trim() === "") {
        errors.push(`Action node "${nodeLabel}": Severity is required.`);
      }
    } else if (
      rawType === "math" ||
      rawType === "mathnode" ||
      rawType === "movingaverage" ||
      rawType === "movingaveragenode" ||
      rawType === "processingnode"
    ) {
      const operation = data.operation;
      if (!operation || String(operation).trim() === "") {
        errors.push(`Math node "${nodeLabel}": Operation is required.`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Validates graph topology, connectivity, and structural completeness.
 *
 * Checks:
 * 1. At least one node
 * 2. Sensor node exists
 * 3. Condition node exists
 * 4. Action node exists
 * 5. Unique node IDs
 * 6. Edges reference existing nodes
 * 7. Valid node types
 * 8. All nodes are connected (no isolated nodes or zero edges with multiple nodes)
 * 9. Directed Acyclic Graph (no cycles)
 * 10. Path exists from Sensor to Action
 *
 * @param {Array} nodes - React Flow nodes
 * @param {Array} edges - React Flow edges
 * @returns {{ valid: boolean, message: string, errors: string[] }}
 */
export function validateGraphStructure(nodes = [], edges = []) {
  const errors = [];

  // Check 1: At least one node
  if (!nodes || nodes.length === 0) {
    return {
      valid: false,
      message: "Rule cannot be empty. Drag nodes from the library onto the canvas.",
      errors: ["Rule cannot be empty."]
    };
  }

  // Check 2, 3, 4: Canonical Category Checks (Sensor, Condition, Action)
  const sensorNodes = nodes.filter((n) => {
    const t = (n.type || "").toLowerCase();
    return t === "sensor" || t === "sensornode";
  });

  const conditionNodes = nodes.filter((n) => {
    const t = (n.type || "").toLowerCase();
    return t === "condition" || t === "conditionnode";
  });

  const actionNodes = nodes.filter((n) => {
    const t = (n.type || "").toLowerCase();
    return (
      t === "action" ||
      t === "alert" ||
      t === "alertnode" ||
      t === "notification"
    );
  });

  if (sensorNodes.length === 0) {
    errors.push("Graph must contain at least one Sensor node.");
  }
  if (conditionNodes.length === 0) {
    errors.push("Graph must contain at least one Condition node.");
  }
  if (actionNodes.length === 0) {
    errors.push("Graph must contain at least one Action node.");
  }

  // Check 5: Unique Node IDs & Check 7: Valid node types
  const seenIds = new Set();
  for (const node of nodes) {
    if (!node.id || String(node.id).trim() === "") {
      errors.push("Every node must have a non-empty ID.");
    } else if (seenIds.has(node.id)) {
      errors.push(`Duplicate node ID '${node.id}' detected.`);
    } else {
      seenIds.add(node.id);
    }

    const t = (node.type || "").toLowerCase();
    if (!VALID_NODE_TYPES.has(t)) {
      errors.push(`Node '${node.id}' has invalid type '${node.type}'.`);
    }
  }

  // Check 6: Edges reference existing nodes
  const cleanEdges = edges || [];
  for (const edge of cleanEdges) {
    if (!edge.source || !seenIds.has(edge.source)) {
      errors.push(`Edge references unknown source node '${edge.source}'.`);
    }
    if (!edge.target || !seenIds.has(edge.target)) {
      errors.push(`Edge references unknown target node '${edge.target}'.`);
    }
  }

  // Check 8: All nodes are connected
  // Example: Sensor, Condition, Action with no edges -> "Please connect all nodes before saving the rule."
  if (nodes.length > 1 && cleanEdges.length === 0) {
    errors.push("Please connect all nodes before saving the rule.");
  } else if (nodes.length > 1) {
    const outgoing = {};
    const incoming = {};

    nodes.forEach((n) => {
      outgoing[n.id] = [];
      incoming[n.id] = [];
    });

    cleanEdges.forEach((e) => {
      if (outgoing[e.source]) outgoing[e.source].push(e.target);
      if (incoming[e.target]) incoming[e.target].push(e.source);
    });

    const unconnectedNodes = nodes.filter((n) => {
      const hasOut = outgoing[n.id] && outgoing[n.id].length > 0;
      const hasIn = incoming[n.id] && incoming[n.id].length > 0;
      return !hasOut && !hasIn;
    });

    if (unconnectedNodes.length > 0) {
      errors.push("Please connect all nodes before saving the rule.");
    }
  }

  // If there are structural errors up to here, return early
  if (errors.length > 0) {
    return {
      valid: false,
      message: errors[0],
      errors
    };
  }

  // Adjacency graph for cycle detection & path reachability
  const outgoing = {};
  const incoming = {};
  const nodeMap = {};

  nodes.forEach((n) => {
    outgoing[n.id] = [];
    incoming[n.id] = [];
    nodeMap[n.id] = n;
  });

  cleanEdges.forEach((e) => {
    if (outgoing[e.source]) outgoing[e.source].push(e.target);
    if (incoming[e.target]) incoming[e.target].push(e.source);
  });

  // Check 9: Cycle Detection (DFS 3-color)
  const visitedState = {}; // 0 = unvisited, 1 = visiting, 2 = visited
  nodes.forEach((n) => {
    visitedState[n.id] = 0;
  });

  let hasCycle = false;
  let cycleNodes = [];

  function detectCycleDFS(nodeId, path = []) {
    visitedState[nodeId] = 1;
    path.push(nodeId);

    const neighbors = outgoing[nodeId] || [];
    for (const nextId of neighbors) {
      if (visitedState[nextId] === 1) {
        hasCycle = true;
        cycleNodes = [...path, nextId];
        return true;
      }
      if (visitedState[nextId] === 0) {
        if (detectCycleDFS(nextId, [...path])) return true;
      }
    }

    visitedState[nodeId] = 2;
    return false;
  }

  for (const node of nodes) {
    if (visitedState[node.id] === 0) {
      if (detectCycleDFS(node.id)) break;
    }
  }

  if (hasCycle) {
    const cycleLabels = cycleNodes
      .map((id) => nodeMap[id]?.data?.label || id)
      .join(" → ");
    errors.push(`Circular flow detected (${cycleLabels}). Pipeline must be a directed acyclic graph.`);
  }

  // Check 10: Reachability from Sensor to Action
  const actionIds = new Set(actionNodes.map((n) => n.id));
  let pathReachesAction = false;

  sensorNodes.forEach((src) => {
    const visited = new Set();
    const queue = [src.id];

    while (queue.length > 0) {
      const curr = queue.shift();
      if (actionIds.has(curr)) {
        pathReachesAction = true;
        break;
      }
      visited.add(curr);
      const nexts = outgoing[curr] || [];
      for (const nxt of nexts) {
        if (!visited.has(nxt)) queue.push(nxt);
      }
    }
  });

  // Specific connection validation
  const sensorConnected = sensorNodes.some((s) => (outgoing[s.id] || []).length > 0);
  const conditionHasIn = conditionNodes.some((c) => (incoming[c.id] || []).length > 0);
  const conditionHasOut = conditionNodes.some((c) => (outgoing[c.id] || []).length > 0);
  const actionHasIn = actionNodes.some((a) => (incoming[a.id] || []).length > 0);

  if (!sensorConnected || !conditionHasIn) {
    errors.push("Please connect the Sensor node to the Condition node.");
  } else if (!conditionHasOut || !actionHasIn || !pathReachesAction) {
    errors.push("Please connect the Condition node to the Alert node.");
  }

  if (errors.length > 0) {
    return {
      valid: false,
      message: errors[0],
      errors
    };
  }

  return {
    valid: true,
    message: "Rule pipeline is valid and ready to run!",
    errors: []
  };
}

/**
 * Returns a checklist status for Rule completeness:
 * ✓ Sensor exists
 * ✓ Condition exists
 * ✓ Action exists
 * ✓ Nodes connected
 * ✓ Node configuration complete
 */
export function getValidationChecklist(nodes = [], edges = []) {
  const sensorNodes = (nodes || []).filter((n) => {
    const t = (n.type || "").toLowerCase();
    return t === "sensor" || t === "sensornode";
  });

  const conditionNodes = (nodes || []).filter((n) => {
    const t = (n.type || "").toLowerCase();
    return t === "condition" || t === "conditionnode";
  });

  const actionNodes = (nodes || []).filter((n) => {
    const t = (n.type || "").toLowerCase();
    return (
      t === "action" ||
      t === "alert" ||
      t === "alertnode" ||
      t === "notification"
    );
  });

  const hasSensor = sensorNodes.length > 0;
  const hasCondition = conditionNodes.length > 0;
  const hasAction = actionNodes.length > 0;

  let nodesConnected = false;
  if (nodes.length >= 2 && edges.length >= 1) {
    const outgoing = {};
    const incoming = {};
    nodes.forEach((n) => {
      outgoing[n.id] = [];
      incoming[n.id] = [];
    });
    edges.forEach((e) => {
      if (outgoing[e.source]) outgoing[e.source].push(e.target);
      if (incoming[e.target]) incoming[e.target].push(e.source);
    });
    const unconnected = nodes.filter((n) => {
      const hasOut = outgoing[n.id] && outgoing[n.id].length > 0;
      const hasIn = incoming[n.id] && incoming[n.id].length > 0;
      return !hasOut && !hasIn;
    });
    nodesConnected = unconnected.length === 0;
  } else if (nodes.length === 1) {
    nodesConnected = false;
  }

  const configCheck = validateNodeConfig(nodes);
  const configComplete = configCheck.valid;

  const isComplete = hasSensor && hasCondition && hasAction && nodesConnected && configComplete;

  return {
    isComplete,
    hasSensor,
    hasCondition,
    hasAction,
    nodesConnected,
    configComplete,
    configErrors: configCheck.errors,
  };
}

/**
 * Full pre-save validation combining graph structure and node configuration checks.
 *
 * @param {Array} nodes - React Flow nodes
 * @param {Array} edges - React Flow edges
 * @returns {{ valid: boolean, message: string, headerMessage: string, errors: string[] }}
 */
export function validateGraph(nodes = [], edges = []) {
  // 1. Structural Validation (at least one node, types, connectivity, DAG, Sensor -> Action)
  const structureResult = validateGraphStructure(nodes, edges);
  if (!structureResult.valid) {
    return {
      valid: false,
      headerMessage: "⚠ Complete the rule before saving.",
      message: `⚠ Complete the rule before saving: ${structureResult.message}`,
      errors: structureResult.errors
    };
  }

  // 2. Node Configuration Validation (non-blank sensorId, field, operator, value, action, etc.)
  const configResult = validateNodeConfig(nodes);
  if (!configResult.valid) {
    return {
      valid: false,
      headerMessage: "⚠ Complete the rule before saving.",
      message: `⚠ Complete the rule before saving: ${configResult.errors[0]}`,
      errors: configResult.errors
    };
  }

  return {
    valid: true,
    headerMessage: "✓ Rule is complete",
    message: "Rule pipeline is valid and ready to save!",
    errors: []
  };
}

/**
 * Edge Connection Validation for live interaction on canvas.
 * Enforces directional connection rules and returns detailed reason on invalid connection.
 *
 * Rules:
 * 1. Action nodes cannot have outgoing edges
 * 2. Sensor nodes cannot have incoming edges
 * 3. Self-connections (Node A -> Node A) are disallowed
 * 4. Direct Sensor -> Action is disallowed (requires processing / condition)
 *
 * @param {Object} connection - { source, target }
 * @param {Array} nodes - React Flow nodes
 * @returns {{ isValid: boolean, reason?: string }}
 */
export function validateConnectionWithReason(connection, nodes = []) {
  if (!connection || !nodes) return { isValid: false, reason: "Invalid connection parameters." };

  if (connection.source === connection.target) {
    return { isValid: false, reason: "A node cannot connect to itself." };
  }

  const sourceNode = nodes.find((n) => n.id === connection.source);
  const targetNode = nodes.find((n) => n.id === connection.target);

  if (!sourceNode || !targetNode) {
    return { isValid: false, reason: "Source or Target node not found." };
  }

  const sourceType = (sourceNode.type || "").toLowerCase();
  const targetType = (targetNode.type || "").toLowerCase();

  const isSourceAction =
    sourceType === "action" ||
    sourceType === "alert" ||
    sourceType === "alertnode" ||
    sourceType === "notification";

  const isTargetSensor = sourceType === "sensor" || targetType === "sensor" || targetType === "sensornode";
  const isSourceSensor = sourceType === "sensor" || sourceType === "sensornode";
  const isTargetAction =
    targetType === "action" ||
    targetType === "alert" ||
    targetType === "alertnode" ||
    targetType === "notification";

  // Rule 1: Action nodes cannot be data sources
  if (isSourceAction) {
    return {
      isValid: false,
      reason: "Invalid connection: Action nodes cannot have outgoing connections."
    };
  }

  // Rule 2: Sensor nodes cannot be targets
  if (targetType === "sensor" || targetType === "sensornode") {
    return {
      isValid: false,
      reason: "Invalid connection: Sensor nodes cannot receive incoming connections."
    };
  }

  // Rule 3: Direct Sensor -> Action is disallowed
  if (isSourceSensor && isTargetAction) {
    return {
      isValid: false,
      reason: "Invalid connection: Direct Sensor → Action is disallowed. Please connect through a Condition node."
    };
  }

  return { isValid: true };
}

/**
 * Boolean wrapper for ReactFlow isValidConnection prop.
 */
export function isValidConnection(connection, nodes) {
  const result = validateConnectionWithReason(connection, nodes);
  return result.isValid;
}

export default {
  validateGraph,
  validateGraphStructure,
  validateNodeConfig,
  validateConnectionWithReason,
  isValidConnection
};
