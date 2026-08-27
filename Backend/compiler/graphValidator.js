
const VALID_NODE_TYPES = new Set([
  'sensor',
  'sensorNode',
  'condition',
  'conditionNode',
  'math',       // transform node — applies arithmetic to a telemetry field via RxJS map()
  'mathNode',
  'alert',
  'alertNode',
  'action',
  'actionNode',
  'filter',     // stream-windowing / data-filtering (stub; no backend handler yet)
]);

/**
 * Canonical node categories used for structural completeness checks.
 * Maps each category to the set of type strings that satisfy it.
 */
const NODE_CATEGORY = {
  sensor:    (type) => type === 'sensor'    || type === 'sensorNode',
  condition: (type) => type === 'condition' || type === 'conditionNode',
  math:      (type) => type === 'math'      || type === 'mathNode',
  alert:     (type) => type === 'alert'     || type === 'alertNode' || type === 'action' || type === 'actionNode',
};

/**
 * Validates a rule graph object.
 *
 * @param {{ nodes: Array, edges: Array }} graph - The rule graph to validate.
 * @returns {{ valid: boolean, errors: string[] }} Result with an errors array.
 *          `valid` is true only when `errors` is empty.
 */
function validateGraph(graph) {
  const errors = [];

  // ── Top-level structure ───────────────────────────────────────────────────
  if (!graph || typeof graph !== 'object') {
    return { valid: false, errors: ['Rule graph must be a non-null object.'] };
  }

  const { nodes, edges } = graph;

  if (!Array.isArray(nodes)) {
    errors.push('`nodes` must be an array.');
  }

  if (!Array.isArray(edges)) {
    errors.push('`edges` must be an array.');
  }

  // Stop early — remaining checks need both arrays to be valid
  if (errors.length > 0) return { valid: false, errors };

  if (nodes.length === 0) {
    errors.push('`nodes` array must not be empty.');
  }

  // ── Per-node validation ───────────────────────────────────────────────────
  const seenIds = new Set();

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const prefix = `Node[${i}]`;

    if (!node || typeof node !== 'object') {
      errors.push(`${prefix}: must be an object.`);
      continue; // skip further checks for this entry
    }

    // id
    if (!node.id || typeof node.id !== 'string' || node.id.trim() === '') {
      errors.push(`${prefix}: missing or empty 'id'.`);
    } else if (seenIds.has(node.id)) {
      errors.push(`${prefix}: duplicate node id '${node.id}'.`);
    } else {
      seenIds.add(node.id);
    }

    // type
    if (!node.type || typeof node.type !== 'string' || node.type.trim() === '') {
      errors.push(`${prefix} (id='${node.id || '?'}'): missing or empty 'type'.`);
    } else if (!VALID_NODE_TYPES.has(node.type)) {
      errors.push(
        `${prefix} (id='${node.id}'): unknown type '${node.type}'. ` +
        `Valid types: ${[...VALID_NODE_TYPES].join(', ')}.`
      );
    }
  }

  // ── Per-edge validation ───────────────────────────────────────────────────
  for (let i = 0; i < edges.length; i++) {
    const edge = edges[i];
    const prefix = `Edge[${i}]`;

    if (!edge || typeof edge !== 'object') {
      errors.push(`${prefix}: must be an object.`);
      continue;
    }

    if (!edge.source || typeof edge.source !== 'string' || edge.source.trim() === '') {
      errors.push(`${prefix}: missing or empty 'source'.`);
    } else if (!seenIds.has(edge.source)) {
      errors.push(`${prefix}: 'source' references unknown node id '${edge.source}'.`);
    }

    if (!edge.target || typeof edge.target !== 'string' || edge.target.trim() === '') {
      errors.push(`${prefix}: missing or empty 'target'.`);
    } else if (!seenIds.has(edge.target)) {
      errors.push(`${prefix}: 'target' references unknown node id '${edge.target}'.`);
    }
  }

  // ── Structural completeness ───────────────────────────────────────────────
  // Only run these checks once the per-node checks have passed (so seenIds is reliable).
  // Required: at least one sensor, one condition, one alert.
  // Optional: math node (not every rule needs a transform step).
  if (errors.length === 0) {
    const hasSensor    = nodes.some((n) => NODE_CATEGORY.sensor(n.type));
    const hasCondition = nodes.some((n) => NODE_CATEGORY.condition(n.type));
    const hasAlert     = nodes.some((n) => NODE_CATEGORY.alert(n.type));

    if (!hasSensor) {
      errors.push('Graph must contain at least one sensor node (type: sensor | sensorNode).');
    }
    if (!hasCondition) {
      errors.push('Graph must contain at least one condition node (type: condition | conditionNode).');
    }
    if (!hasAlert) {
      errors.push('Graph must contain at least one alert node (type: alert | alertNode).');
    }
  }

  return { valid: errors.length === 0, errors };
}

module.exports = {
  validateGraph,
  VALID_NODE_TYPES,
  NODE_CATEGORY,
};
