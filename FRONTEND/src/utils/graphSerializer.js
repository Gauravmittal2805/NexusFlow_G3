/**
 * graphSerializer.js
 *
 * Re-exports serialization functions from ruleSerializer.js for backwards compatibility.
 */

import { serializeRule, deserializeRule } from "./ruleSerializer";

export { serializeRule, deserializeRule };

// Backwards compatibility aliases
export const serializeGraph = (ruleName, nodes, edges, ruleId = null) => {
  return serializeRule(nodes, edges, { name: ruleName, id: ruleId });
};

export const deserializeGraph = (ruleData, callbacks = {}) => {
  return deserializeRule(ruleData, callbacks);
};

export default {
  serializeRule,
  deserializeRule,
  serializeGraph,
  deserializeGraph,
};
