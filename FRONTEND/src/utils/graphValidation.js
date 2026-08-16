/**
 * Graph Validation Utilities for NexusFlow Rule Builder
 * Verifies rule pipeline structure and enforces edge connection rules.
 */

/**
 * Validates whether a given rule graph is complete and ready for compilation.
 * @param {Array} nodes List of React Flow nodes
 * @param {Array} edges List of React Flow edges
 * @returns {Object} { valid: boolean, message: string }
 */
export function validateGraph(nodes, edges) {
  if (!nodes || nodes.length === 0) {
    return { valid: false, message: "Rule is empty. Drag nodes into the canvas to get started." };
  }

  // 1. Must contain at least 1 Data Source
  const hasSensor = nodes.some((n) => n.type === "sensorNode");
  if (!hasSensor) {
    return { valid: false, message: "Rule invalid: Missing a Data Source (e.g. Temperature Sensor)." };
  }

  // 2. Must contain at least 1 Action node
  const hasAction = nodes.some((n) => n.type === "alertNode");
  if (!hasAction) {
    return { valid: false, message: "Rule invalid: Missing an Action node (e.g. SMS Alert)." };
  }

  // 3. Must contain processing/condition nodes between source and action
  const hasConditionOrProcessing = nodes.some(
    (n) => n.type === "conditionNode" || n.type === "processingNode" || n.type === "movingAverageNode"
  );
  if (!hasConditionOrProcessing) {
    return {
      valid: false,
      message: "Rule invalid: Direct Sensor → Action is disallowed. Please add a Condition or Processing node."
    };
  }

  // 4. Trace path from Data Source to Action node
  const adjacency = {};
  edges.forEach((e) => {
    if (!adjacency[e.source]) adjacency[e.source] = [];
    adjacency[e.source].push(e.target);
  });

  const sensors = nodes.filter((n) => n.type === "sensorNode").map((n) => n.id);
  const actions = new Set(nodes.filter((n) => n.type === "alertNode").map((n) => n.id));

  let reachesAction = false;
  sensors.forEach((startId) => {
    const visited = new Set();
    const queue = [startId];
    while (queue.length > 0) {
      const current = queue.shift();
      if (actions.has(current)) {
        reachesAction = true;
        break;
      }
      visited.add(current);
      const neighbors = adjacency[current] || [];
      neighbors.forEach((nbr) => {
        if (!visited.has(nbr)) queue.push(nbr);
      });
    }
  });

  if (!reachesAction) {
    return {
      valid: false,
      message: "Rule invalid: Data Source is not connected to an Action node."
    };
  }

  return { valid: true, message: "Rule is valid! Processing pipeline verified." };
}

/**
 * Edge Connection Validation (Step 7)
 * Prevents invalid connections (e.g. Action to Sensor, Action to Processing).
 * @param {Object} connection { source, target, sourceHandle, targetHandle }
 * @param {Array} nodes List of React Flow nodes
 * @returns {boolean} True if connection is allowed
 */
export function isValidConnection(connection, nodes) {
  const sourceNode = nodes.find((n) => n.id === connection.source);
  const targetNode = nodes.find((n) => n.id === connection.target);

  if (!sourceNode || !targetNode) return false;

  // Rule A: Action nodes cannot be a source (Actions are terminal endpoints)
  if (sourceNode.type === "alertNode") return false;

  // Rule B: Sensor nodes cannot be a target (Sensors are initial data producers)
  if (targetNode.type === "sensorNode") return false;

  // Rule C: Direct Sensor -> Action is rejected
  if (sourceNode.type === "sensorNode" && targetNode.type === "alertNode") return false;

  return true;
}
