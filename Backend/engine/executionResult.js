/**
 * executionResult.js
 *
 * Canonical RuleExecutionResult — the standard object produced every time
 * an RxJS rule pipeline evaluates TRUE.
 *
 * This is the clean boundary (Step 1) between the rule engine and the
 * alert layer.  Neither the compiler nor alertService builds this object;
 * the runtime builds it here and passes it downstream.
 *
 * Shape (Step 1 spec):
 * ────────────────────
 *   {
 *     ruleId:        string,
 *     ruleName:      string,
 *     sensorId:      string,
 *     field:         string,          // telemetry field that was evaluated
 *     operator:      string,          // '>' | '<' | '>=' | '<=' | '==' | '!='
 *     threshold:     number,          // value configured in condition node
 *     value:         number,          // actual telemetry reading that triggered
 *     action:        string,          // 'SMS' | 'EMAIL' | 'NOTIFICATION'
 *     severity:      string,          // 'HIGH' | 'MEDIUM' | 'LOW' | 'CRITICAL'
 *     message:       string,          // human-readable description (Step 4)
 *     timestamp:     string,          // ISO-8601
 *     conditionState:'TRIGGERED'|'NORMAL',  // state machine (Step 7)
 *   }
 *
 * Severity mapping (Step 3):
 *   Severity comes from the alert node's data.severity field.
 *   Never hardcoded — always read from the compiled rule graph.
 *   Supported values: HIGH, MEDIUM, LOW, CRITICAL.
 *   Default: HIGH.
 *
 * Message generation (Step 4):
 *   Built from actual rule + telemetry data:
 *     "High Temperature Alert: TURBINE-001 temperature reached 85°C."
 *   Never a generic "Rule triggered." message.
 *
 * Operator text mapping:
 *   >   → "exceeded"
 *   >=  → "met or exceeded"
 *   <   → "dropped below"
 *   <=  → "met or dropped below"
 *   ==  → "equalled"
 *   !=  → "changed from"
 */

'use strict';

// ── Severity normalisation (Step 3) ──────────────────────────────────────────

const VALID_SEVERITIES = new Set(['HIGH', 'MEDIUM', 'LOW', 'CRITICAL']);
const DEFAULT_SEVERITY = 'HIGH';
const DEFAULT_ACTION   = 'NOTIFICATION';

/**
 * Normalise a severity string.
 * If the value is not one of the supported severities, fall back to HIGH.
 *
 * @param {string|undefined} raw
 * @returns {'HIGH'|'MEDIUM'|'LOW'|'CRITICAL'}
 */
function normaliseSeverity(raw) {
  if (!raw) return DEFAULT_SEVERITY;
  const upper = String(raw).toUpperCase().trim();
  return VALID_SEVERITIES.has(upper) ? upper : DEFAULT_SEVERITY;
}

// ── Message generation (Step 4) ───────────────────────────────────────────────

/**
 * Maps a condition operator to a human-readable verb.
 *
 * @param {string} operator
 * @returns {string}
 */
function operatorToText(operator) {
  return {
    '>':  'exceeded',
    '>=': 'met or exceeded',
    '<':  'dropped below',
    '<=': 'met or dropped below',
    '==': 'equalled',
    '!=': 'changed from',
  }[operator] || 'triggered threshold of';
}

/**
 * Generates a meaningful, human-readable alert message.
 *
 * Examples:
 *   "High Temperature Alert: TURBINE-001 temperature exceeded 80. Current value: 85."
 *   "Low RPM Alert: TURBINE-001 rpm dropped below 1000. Current value: 850."
 *   "Pressure Check: TURBINE-002 pressure met or exceeded 120. Current value: 125."
 *
 * @param {string} ruleName
 * @param {string} sensorId
 * @param {string} field
 * @param {string} operator
 * @param {number|string} threshold
 * @param {number|string|null} actualValue
 * @returns {string}
 */
function generateMessage(ruleName, sensorId, field, operator, threshold, actualValue) {
  // Never produce a generic message — always include specific values
  const fieldDisplay   = field
    ? field.charAt(0).toUpperCase() + field.slice(1)
    : 'Value';

  const verbText       = operatorToText(operator);
  const thresholdPart  = threshold !== null && threshold !== undefined
    ? ` ${threshold}`
    : '';
  const currentPart    = actualValue !== null && actualValue !== undefined
    ? ` Current value: ${actualValue}.`
    : '';

  // Format: "RuleName: SensorId field verb threshold. Current value: X."
  return `${ruleName}: ${sensorId} ${fieldDisplay.toLowerCase()}${thresholdPart
    ? ` ${verbText}${thresholdPart}.`
    : `.`}${currentPart}`;
}

// ── State constants (Step 7) ──────────────────────────────────────────────────

const CONDITION_STATE = Object.freeze({
  TRIGGERED: 'TRIGGERED',  // condition is currently TRUE
  NORMAL:    'NORMAL',     // condition is currently FALSE / recovered
});

// ── Main builder (Step 1) ─────────────────────────────────────────────────────

/**
 * Builds a canonical RuleExecutionResult from a compiled pipeline match.
 *
 * Called by ruleRuntime.handleTrigger() when a pipeline emits a match.
 * The result is then passed directly to alertService.processExecutionResult()
 * without further transformation.
 *
 * @param {Object} pipelineResult   - PipelineResult from compiled.run() onMatch callback
 *   { ruleId, ruleName, sensorId, context, outputs, matched, stoppedAt, reason }
 * @param {Object} rule             - Original rule document (for fallback data)
 * @returns {RuleExecutionResult}
 */
function buildExecutionResult(pipelineResult, rule) {
  const { ruleId, ruleName, sensorId, context, outputs } = pipelineResult;

  // ── Extract condition output ──────────────────────────────────────────────
  const condOut = outputs.find(
    (o) => o.type === 'condition' || o.type === 'conditionNode'
  );

  const field     = condOut?.output?.field     ?? context.matchedField ?? null;
  const operator  = condOut?.output?.operator  ?? null;
  const threshold = condOut?.output?.threshold ?? null;
  const value     = condOut?.output?.actual    ?? null;

  // ── Extract alert node output (Step 3 — severity from rule graph) ─────────
  const alertOut  = outputs.find(
    (o) => o.type === 'alert' || o.type === 'alertNode'
  );

  const action    = alertOut?.output?.action   ?? context.alertAction   ?? DEFAULT_ACTION;
  const rawSev    = alertOut?.output?.severity ?? context.alertSeverity ?? DEFAULT_SEVERITY;
  const severity  = normaliseSeverity(rawSev);

  // ── Generate meaningful message (Step 4) ─────────────────────────────────
  const message = generateMessage(
    ruleName,
    sensorId,
    field    || 'value',
    operator || '>',
    threshold,
    value
  );

  return {
    ruleId,
    ruleName,
    sensorId,
    field,
    operator,
    threshold,
    value,
    action,
    severity,
    message,
    timestamp:      new Date().toISOString(),
    conditionState: CONDITION_STATE.TRIGGERED,
  };
}

/**
 * Builds a NORMAL (recovery) execution result when a rule condition becomes
 * false after previously being true (Step 7).
 *
 * @param {string} ruleId
 * @param {string} ruleName
 * @param {string} sensorId
 * @param {string|null} field
 * @returns {RuleExecutionResult}
 */
function buildRecoveryResult(ruleId, ruleName, sensorId, field) {
  return {
    ruleId,
    ruleName,
    sensorId,
    field:          field || null,
    operator:       null,
    threshold:      null,
    value:          null,
    action:         null,
    severity:       null,
    message:        `${ruleName}: ${sensorId} condition returned to NORMAL.`,
    timestamp:      new Date().toISOString(),
    conditionState: CONDITION_STATE.NORMAL,
  };
}

// ─────────────────────────────────────────────────────────────────────────────

module.exports = {
  buildExecutionResult,
  buildRecoveryResult,
  generateMessage,
  normaliseSeverity,
  operatorToText,
  CONDITION_STATE,
  VALID_SEVERITIES,
};
