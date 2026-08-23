/**
 * Graph Validation Utilities for NexusFlow Rule Builder
 * Verifies rule pipeline structure and enforces connection integrity rules.
 */

/**
 * Validates whether a given rule graph is complete and ready for compilation & saving.
 * 
 * Step 5 Validation Checks:
 * 1. At least one node (Rule cannot be empty)
 * 2. At least one Data Source (e.g., Temperature, Pressure)
 * 3. At least one Action node (e.g., SMS Alert, Email Alert)
 * 4. Nodes should be connected (Unconnected node detected)
 * 5. No circular flow: A -> B -> C -> A (Directed Acyclic Graph enforced)
 * 6. Valid path from Data Source to Action node
 * 
 * @param {Array} nodes List of React Flow nodes
 * @param {Array} edges List of React Flow edges
 * @returns {Object} { valid: boolean, message: string, errors: string[] }
 */
export function validateGraph(nodes, edges) {
  const errors = [];

  // Check 1: At least one node
  if (!nodes || nodes.length === 0) {
    return {
      valid: false,
      message: "Rule cannot be empty. Drag nodes from the library onto the canvas.",
      errors: ["Rule cannot be empty."]
    };
  }

  // Check 2: At least one Data Source
  const sensorNodes = nodes.filter(
    (n) => n.type === "sensorNode" || (n.data && n.data.sensor)
  );
  if (sensorNodes.length === 0) {
    errors.push("Add a data source (e.g. Temperature, Pressure).");
  }

  // Check 3: At least one Action node
  const actionNodes = nodes.filter(
    (n) => n.type === "alertNode" || (n.data && n.data.actionType)
  );
  if (actionNodes.length === 0) {
    errors.push("Add an action node (e.g. SMS Alert, Email Alert).");
  }

  // If missing sources or actions, report immediately
  if (errors.length > 0) {
    return {
      valid: false,
      message: errors[0],
      errors
    };
  }

  // Build adjacency graph
  const outgoing = {};
  const incoming = {};
  const nodeMap = {};

  nodes.forEach((n) => {
    outgoing[n.id] = [];
    incoming[n.id] = [];
    nodeMap[n.id] = n;
  });

  (edges || []).forEach((e) => {
    if (outgoing[e.source]) outgoing[e.source].push(e.target);
    if (incoming[e.target]) incoming[e.target].push(e.source);
  });

  // Check 4: Unconnected node check
  // In a valid rule with >1 node, every node must have at least one incoming or outgoing edge.
  if (nodes.length > 1) {
    const unconnectedNodes = nodes.filter((n) => {
      const hasOut = outgoing[n.id] && outgoing[n.id].length > 0;
      const hasIn = incoming[n.id] && incoming[n.id].length > 0;
      return !hasOut && !hasIn;
    });

    if (unconnectedNodes.length > 0) {
      const names = unconnectedNodes.map((n) => n.data?.label || n.id).join(", ");
      errors.push(`Unconnected node detected: ${names}. All nodes must be connected.`);
    }
  }

  // Check 5: Cycle detection (A -> B -> C -> A) using DFS 3-color algorithm
  const visitedState = {}; // 0 = unvisited, 1 = visiting (in stack), 2 = visited
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

  // Check 6: Reachability from at least one Data Source to an Action
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

  if (!pathReachesAction) {
    errors.push("Data Source is not connected to an Action node. Connect them to form a complete pipeline.");
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
 * Edge Connection Validation (Step 4)
 * Enforces structured connection rules and returns detailed reason on invalid connection.
 * 
 * Rules:
 * 1. Action nodes cannot be data sources (cannot have outgoing edges)
 * 2. Sensor nodes cannot be targets (cannot have incoming edges)
 * 3. Self-connections (Node A -> Node A) are disallowed
 * 4. Direct Sensor -> Action is disallowed (requires processing / condition)
 * 
 * @param {Object} connection { source, target, sourceHandle, targetHandle }
 * @param {Array} nodes List of React Flow nodes
 * @returns {Object} { isValid: boolean, reason?: string }
 */
export function validateConnectionWithReason(connection, nodes) {
  if (!connection || !nodes) return { isValid: false, reason: "Invalid connection parameters." };

  if (connection.source === connection.target) {
    return { isValid: false, reason: "A node cannot connect to itself." };
  }

  const sourceNode = nodes.find((n) => n.id === connection.source);
  const targetNode = nodes.find((n) => n.id === connection.target);

  if (!sourceNode || !targetNode) {
    return { isValid: false, reason: "Source or Target node not found." };
  }

  const isSourceAction = sourceNode.type === "alertNode" || Boolean(sourceNode.data?.actionType);
  const isTargetSensor = targetNode.type === "sensorNode" || Boolean(targetNode.data?.sensor);
  const isSourceSensor = sourceNode.type === "sensorNode" || Boolean(sourceNode.data?.sensor);
  const isTargetAction = targetNode.type === "alertNode" || Boolean(targetNode.data?.actionType);

  // Rule 1: Action nodes cannot be data sources
  if (isSourceAction) {
    return {
      isValid: false,
      reason: "Invalid connection: Action nodes cannot be data sources (no outgoing flow)."
    };
  }

  // Rule 2: Sensor nodes cannot be targets
  if (isTargetSensor) {
    return {
      isValid: false,
      reason: "Invalid connection: Data Source nodes cannot receive input connections."
    };
  }

  // Rule 3: Direct Sensor -> Action is disallowed
  if (isSourceSensor && isTargetAction) {
    return {
      isValid: false,
      reason: "Invalid connection: Direct Sensor → Action is disallowed. Please add a Condition or Processing node."
    };
  }

  return { isValid: true };
}

/**
 * Boolean wrapper for ReactFlow isValidConnection prop
 */
export function isValidConnection(connection, nodes) {
  const result = validateConnectionWithReason(connection, nodes);
  return result.isValid;
}
