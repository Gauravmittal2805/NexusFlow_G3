const { evaluateCondition } = require('./conditionEvaluator');

/**
 * Evaluates a complete Rule graph against an incoming Telemetry reading (Steps 6-8).
 *
 * @param {Object} rule - Rule document object containing nodes and edges
 * @param {Object} telemetry - Telemetry reading e.g. { sensorId: "TURBINE-001", temperature: 82.4 }
 * @returns {{ matched: boolean, ruleId: string, sensorId: string, details?: Object }} Evaluation result
 */
const evaluateRule = (rule, telemetry) => {
  const ruleId = rule && rule._id ? rule._id.toString() : rule?.id || rule?.ruleId || 'unknown';
  const sensorId = telemetry?.sensorId || 'unknown';

  if (!rule || !rule.nodes || !Array.isArray(rule.nodes) || rule.nodes.length === 0) {
    return {
      matched: false,
      ruleId,
      sensorId,
    };
  }

  const nodes = rule.nodes;
  const edges = rule.edges || [];

  // Step 6: Identify sensor node matching the incoming telemetry sensorId
  const matchingSensorNode = nodes.find((node) => {
    const isSensorType = node.type === 'sensor' || node.type === 'sensorNode';
    const nodeSensorId = node.data?.sensorId || node.data?.sensor;

    if (isSensorType) {
      if (!nodeSensorId) return true; // generic sensor node
      return (
        nodeSensorId === sensorId ||
        sensorId.startsWith(String(nodeSensorId)) ||
        String(nodeSensorId).startsWith(sensorId)
      );
    }

    if (nodeSensorId) {
      return (
        nodeSensorId === sensorId ||
        sensorId.startsWith(String(nodeSensorId)) ||
        String(nodeSensorId).startsWith(sensorId)
      );
    }

    return false;
  });

  // If no matching sensor node found for this telemetry, rule does not match
  if (!matchingSensorNode) {
    return {
      matched: false,
      ruleId,
      sensorId,
    };
  }

  // Step 6: Find condition node(s) connected to the sensor node (or present in graph)
  // First check direct outgoing edges from matchingSensorNode to condition nodes
  const outgoingEdgeTargets = edges
    .filter((edge) => edge.source === matchingSensorNode.id)
    .map((edge) => edge.target);

  let conditionNodes = nodes.filter(
    (node) =>
      (node.type === 'condition' || node.type === 'conditionNode') &&
      outgoingEdgeTargets.includes(node.id)
  );

  // Fallback: If edges are missing or unlinked, locate any condition node in rule nodes
  if (conditionNodes.length === 0) {
    conditionNodes = nodes.filter(
      (node) => node.type === 'condition' || node.type === 'conditionNode'
    );
  }

  // If rule has no condition nodes, default condition is false (or fallback if required)
  if (conditionNodes.length === 0) {
    return {
      matched: false,
      ruleId,
      sensorId,
    };
  }

  // Step 7 & 8: Evaluate condition node(s) via Condition Evaluator
  let overallMatch = true;

  for (const conditionNode of conditionNodes) {
    const isSatisfied = evaluateCondition(conditionNode, telemetry);
    if (!isSatisfied) {
      overallMatch = false;
      break;
    }
  }

  // Return final evaluation result object (Steps 7 & 8)
  return {
    matched: overallMatch,
    ruleId,
    sensorId,
  };
};

module.exports = {
  evaluateRule,
};
