/**
 * nodeHandlers.js
 *
 * Defines what each node type does when it is executed inside a compiled
 * rule pipeline.  A handler is a plain function with the signature:
 *
 *   handler(node, telemetry, context) → { pass: boolean, output?: any }
 *
 * Parameters:
 *   node      - The full node object from the rule graph
 *                 { id, type, data: { ... } }
 *   telemetry - The incoming telemetry reading (Step 13 — canonical shape):
 *                 { sensorId, timestamp, temperature, pressure, humidity, rpm }
 *   context   - Mutable object shared across the whole pipeline execution.
 *               Handlers may read from and write to it to pass state forward.
 *               Fields written by each handler:
 *                 context.sensorId        – sensor handler
 *                 context.matchedField    – sensor handler
 *                 context.conditionMet    – condition handler
 *                 context.lastConditionData – condition handler
 *                 context.mathResult      – math handler
 *                 context.alertAction     – alert handler
 *                 context.alertSeverity   – alert handler
 *
 * Return value:
 *   { pass: true }              – node evaluated OK; pipeline continues
 *   { pass: false, reason }     – node blocked execution; pipeline halts
 *   { pass: true, output }      – node produced a value forwarded in context
 *
 * RxJS operator mapping (Step 8)
 * ───────────────────────────────
 *   Node type   │ RxJS operator │ Role in stream
 *   ────────────┼───────────────┼───────────────────────────────────────────
 *   sensor      │ from() / of() │ Source — emits each telemetry reading
 *   condition   │ filter()      │ Gate — keeps readings that pass the threshold
 *   math        │ map()         │ Transform — applies arithmetic to a field
 *   alert       │ (subscribe)   │ Sink — triggered when stream completes
 *   filter      │ filter()      │ Stream-windowing / data-filtering (future)
 *
 * Supported node types (Step 12 — confirmed with Member 3)
 * ─────────────────────────────────────────────────────────
 *   sensor    / sensorNode    → select telemetry field
 *   condition / conditionNode → filter stream
 *   math      / mathNode      → transform stream (map)
 *   alert     / alertNode     → trigger output (subscribe)
 *   filter                    → stream-windowing (stub)
 */

const { evaluateCondition, SUPPORTED_OPERATORS } = require('../services/conditionEvaluator');

// ─────────────────────────────────────────────────────────────────────────────
// Sensor Handler  →  RxJS: from() / of()
// Conceptual role: SOURCE — selects the telemetry field to observe
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sensor handler.
 *
 * Determines whether the incoming telemetry belongs to the sensor described by
 * this node.  Matching rules (consistent with ruleEvaluator.js):
 *   - If node.data.sensorId is absent → wildcard, matches any sensor.
 *   - Otherwise: exact match OR prefix/suffix match (startsWith).
 *
 * In the RxJS pipeline this is the Observable source:
 *   from(telemetry$).pipe(...)
 *
 * Writes to context:
 *   context.sensorId     – the telemetry sensorId that was matched
 *   context.matchedField – field name passed downstream to condition/math nodes
 *                          Resolution order: data.field → data.sensor → data.metric → 'temperature'
 *
 * @param {Object} node
 * @param {Object} telemetry
 * @param {Object} context
 * @returns {{ pass: boolean, output?: Object, reason?: string }}
 */
function sensorHandler(node, telemetry, context) {
  const data = node.data || {};
  const nodeSensorId     = data.sensorId || data.sensor || null;
  const incomingSensorId = telemetry.sensorId || '';

  // Wildcard — sensor node has no sensorId, matches any incoming reading
  if (!nodeSensorId) {
    context.sensorId     = incomingSensorId;
    context.matchedField = data.field || data.sensor || data.metric || 'temperature';
    return { pass: true, output: { sensorId: incomingSensorId } };
  }

  const nodeIdStr = String(nodeSensorId);
  const matches =
    nodeIdStr === incomingSensorId ||
    incomingSensorId.startsWith(nodeIdStr) ||
    nodeIdStr.startsWith(incomingSensorId);

  if (!matches) {
    return {
      pass: false,
      reason: `Sensor mismatch: node expects '${nodeIdStr}', telemetry has '${incomingSensorId}'.`,
    };
  }

  context.sensorId     = incomingSensorId;
  context.matchedField = data.field || data.sensor || data.metric || 'temperature';

  return { pass: true, output: { sensorId: incomingSensorId } };
}

// ─────────────────────────────────────────────────────────────────────────────
// Condition Handler  →  RxJS: filter()
// Conceptual role: GATE — keeps only telemetry readings that satisfy the rule
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Condition handler.
 *
 * Evaluates a single threshold condition against the incoming telemetry.
 * Delegates to conditionEvaluator which handles field extraction, numeric
 * coercion, and all six operators: >, <, >=, <=, ==, !=.
 *
 * In the RxJS pipeline this becomes a filter() operator:
 *   filter(telemetry => conditionHandler(node, telemetry, ctx).pass)
 *
 * Field resolution — if node.data.field is absent, falls back to
 * context.matchedField populated by the upstream sensor handler.
 *
 * Writes to context:
 *   context.conditionMet      – boolean result
 *   context.lastConditionData – { field, operator, value } for alert message generation
 *
 * @param {Object} node
 * @param {Object} telemetry
 * @param {Object} context
 * @returns {{ pass: boolean, output?: Object, reason?: string }}
 */
function conditionHandler(node, telemetry, context) {
  const data = node.data || {};

  const enrichedData = {
    field:    data.field    || context.matchedField || 'temperature',
    operator: data.operator,
    value:    data.value,
  };

  if (!enrichedData.operator || enrichedData.value === undefined || enrichedData.value === null) {
    context.conditionMet = false;
    return {
      pass: false,
      reason: `Condition node '${node.id}' is missing required data (operator and/or value).`,
    };
  }

  if (!SUPPORTED_OPERATORS.includes(String(enrichedData.operator).trim())) {
    context.conditionMet = false;
    return {
      pass: false,
      reason:
        `Condition node '${node.id}' has unsupported operator '${enrichedData.operator}'. ` +
        `Supported: ${SUPPORTED_OPERATORS.join(', ')}.`,
    };
  }

  const enrichedNode  = { ...node, data: enrichedData };
  const isSatisfied   = evaluateCondition(enrichedNode, telemetry);

  context.conditionMet      = isSatisfied;
  context.lastConditionData = enrichedData;

  if (!isSatisfied) {
    return {
      pass: false,
      reason: `Condition not met: telemetry.${enrichedData.field} ${enrichedData.operator} ${enrichedData.value} evaluated false.`,
    };
  }

  return {
    pass: true,
    output: {
      field:     enrichedData.field,
      operator:  enrichedData.operator,
      threshold: enrichedData.value,
      actual:    telemetry[enrichedData.field],
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Math Handler  →  RxJS: map()
// Conceptual role: TRANSFORM — applies arithmetic to a telemetry field value
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Math handler.
 *
 * Applies an arithmetic operation to a telemetry field and writes the
 * transformed value back onto the telemetry object so downstream nodes
 * (e.g. a condition node) see the computed value.
 *
 * In the RxJS pipeline this becomes a map() operator:
 *   map(telemetry => mathHandler(node, telemetry, ctx).output.telemetry)
 *
 * node.data shape:
 *   {
 *     field:     string,   // telemetry field to transform  (default: context.matchedField)
 *     operation: string,   // 'add' | 'subtract' | 'multiply' | 'divide' | 'abs' | 'round' | 'ceil' | 'floor'
 *     operand:   number,   // second operand (not needed for unary ops like abs/round/ceil/floor)
 *     outputField: string  // optional — write result to a different field (default: same as field)
 *   }
 *
 * Supported operations:
 *   add       → field + operand
 *   subtract  → field - operand
 *   multiply  → field * operand
 *   divide    → field / operand  (operand must not be 0)
 *   abs       → Math.abs(field)
 *   round     → Math.round(field)
 *   ceil      → Math.ceil(field)
 *   floor     → Math.floor(field)
 *
 * Writes to context:
 *   context.mathResult – { field, operation, operand, before, after }
 *
 * Writes to telemetry (mutates the object in-place so downstream nodes see the result):
 *   telemetry[outputField] = computedValue
 *
 * @param {Object} node
 * @param {Object} telemetry
 * @param {Object} context
 * @returns {{ pass: boolean, output?: Object, reason?: string }}
 */
function mathHandler(node, telemetry, context) {
  const data = node.data || {};

  const field       = data.field       || context.matchedField || 'temperature';
  const operation   = data.operation   || 'add';
  const operand     = data.operand;
  const outputField = data.outputField || field;

  // Field must exist in the incoming telemetry
  const rawValue = telemetry[field];
  if (rawValue === undefined || rawValue === null) {
    return {
      pass: false,
      reason: `Math node '${node.id}': telemetry does not contain field '${field}'.`,
    };
  }

  const numValue = Number(rawValue);
  if (isNaN(numValue)) {
    return {
      pass: false,
      reason: `Math node '${node.id}': field '${field}' value '${rawValue}' is not numeric.`,
    };
  }

  // Supported unary operations do not require an operand
  const UNARY_OPS = new Set(['abs', 'round', 'ceil', 'floor']);
  const BINARY_OPS = new Set(['add', 'subtract', 'multiply', 'divide']);

  if (!UNARY_OPS.has(operation) && !BINARY_OPS.has(operation)) {
    return {
      pass: false,
      reason:
        `Math node '${node.id}': unsupported operation '${operation}'. ` +
        `Supported: ${[...BINARY_OPS, ...UNARY_OPS].join(', ')}.`,
    };
  }

  if (BINARY_OPS.has(operation) && (operand === undefined || operand === null)) {
    return {
      pass: false,
      reason: `Math node '${node.id}': operation '${operation}' requires an 'operand' value.`,
    };
  }

  const numOperand = Number(operand);

  if (operation === 'divide' && numOperand === 0) {
    return {
      pass: false,
      reason: `Math node '${node.id}': division by zero.`,
    };
  }

  let result;
  switch (operation) {
    case 'add':      result = numValue + numOperand;    break;
    case 'subtract': result = numValue - numOperand;    break;
    case 'multiply': result = numValue * numOperand;    break;
    case 'divide':   result = numValue / numOperand;    break;
    case 'abs':      result = Math.abs(numValue);       break;
    case 'round':    result = Math.round(numValue);     break;
    case 'ceil':     result = Math.ceil(numValue);      break;
    case 'floor':    result = Math.floor(numValue);     break;
    default:         result = numValue;
  }

  // Write back onto the telemetry object so downstream nodes see the transformed value
  telemetry[outputField] = result;

  context.mathResult = {
    field,
    operation,
    operand: BINARY_OPS.has(operation) ? numOperand : null,
    before:  numValue,
    after:   result,
    outputField,
  };

  return {
    pass: true,
    output: {
      field,
      operation,
      before: numValue,
      after:  result,
      outputField,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Alert Handler  →  RxJS: subscribe() / tap()
// Conceptual role: SINK — triggered when all upstream gates pass
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Alert handler.
 *
 * Extracts action type and severity from the alert node so the pipeline
 * caller knows what kind of alert to create.  Does NOT perform I/O —
 * persistence and Socket.IO broadcasting remain in alertService.js.
 *
 * In the RxJS pipeline this sits inside subscribe() (or a tap() for side-effects):
 *   observable$.subscribe(result => alertService.processRuleTrigger(...))
 *
 * node.data shape (Step 12 — confirmed with Member 3):
 *   { action: "SMS" | "EMAIL" | "NOTIFICATION", severity: "HIGH" | "MEDIUM" | "CRITICAL" }
 *
 * Defaults (mirror alertService.js):
 *   action   → "NOTIFICATION"
 *   severity → "HIGH"
 *
 * Writes to context:
 *   context.alertAction   – resolved action string
 *   context.alertSeverity – resolved severity string
 *
 * @param {Object} node
 * @param {Object} telemetry
 * @param {Object} context
 * @returns {{ pass: boolean, output: Object }}
 */
function alertHandler(node, telemetry, context) {
  const data = node.data || {};

  const action   = data.action   || 'NOTIFICATION';
  const severity = data.severity || 'HIGH';

  context.alertAction   = action;
  context.alertSeverity = severity;

  return {
    pass: true,
    output: { action, severity },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Filter Handler  →  RxJS: filter()
// Conceptual role: STREAM-WINDOWING / DATA-FILTERING (stub — passes through)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Filter handler (stub).
 *
 * Placeholder for future stream-windowing or data-filtering logic.
 * Currently passes all telemetry through without modification.
 *
 * In the RxJS pipeline this will become a filter() operator:
 *   filter(telemetry => windowConditionMet(telemetry))
 *
 * @param {Object} node
 * @param {Object} telemetry
 * @param {Object} context
 * @returns {{ pass: boolean, output: Object }}
 */
function filterHandler(node, telemetry, context) {
  // TODO: implement windowing / aggregation logic when the filter node spec is finalised
  return { pass: true, output: { filtered: false } };
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler Registry
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Maps every recognised node type string to its handler function.
 * Both canonical names and "Node"-suffix variants resolve to the same handler.
 *
 * Registry → RxJS operator mapping:
 *   sensor    / sensorNode    → from() / of()   (source Observable)
 *   condition / conditionNode → filter()         (gate operator)
 *   math      / mathNode      → map()            (transform operator)
 *   alert     / alertNode     → subscribe()      (sink / side-effect)
 *   filter                    → filter()         (windowing, stub)
 */
const NODE_HANDLERS = {
  sensor:        sensorHandler,
  sensorNode:    sensorHandler,
  condition:     conditionHandler,
  conditionNode: conditionHandler,
  math:          mathHandler,
  mathNode:      mathHandler,
  alert:         alertHandler,
  alertNode:     alertHandler,
  action:        alertHandler,   // alias
  actionNode:    alertHandler,   // alias
  email:         alertHandler,   // alias — React Flow builder uses this type
  emailNode:     alertHandler,   // alias
  filter:        filterHandler,
};

/**
 * Returns the handler function for a given node type.
 *
 * @param {string} type - Node type string (e.g. 'sensor', 'conditionNode', 'math')
 * @returns {Function|null} The handler, or null if the type is unrecognised.
 */
function getHandler(type) {
  return NODE_HANDLERS[type] || null;
}

module.exports = {
  NODE_HANDLERS,
  getHandler,
  // Exported individually for unit testing
  sensorHandler,
  conditionHandler,
  mathHandler,
  alertHandler,
  filterHandler,
};
