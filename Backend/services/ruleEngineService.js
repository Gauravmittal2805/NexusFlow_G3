const EventEmitter = require('events');
const ruleService = require('./ruleService');
const { evaluateRule } = require('./ruleEvaluator');
const { processRuleTrigger } = require('./alertService');

// ── RxJS telemetry feed (Step 1 & 2) ─────────────────────────────────────────
// Push every incoming reading into the shared Subject so all compiled rule
// pipelines in rxjsRuleEngine receive it without an extra DB query.
const { push: pushToStream } = require('../compiler/telemetryStream');

// Internal Event Emitter for Rule Engine events (Step 9)
class RuleEventEmitter extends EventEmitter {}
const ruleEventEmitter = new RuleEventEmitter();

/**
 * Process incoming telemetry stream and evaluate against active rules (Steps 6-10).
 *
 * Flow:
 * Telemetry -> Active Rules -> Sensor Matching -> Rule Evaluator -> Condition Evaluator -> TRUE / FALSE
 * If TRUE -> Emit 'rule:triggered' event + Create Alert (with cooldown)
 * If FALSE -> Ignore
 *
 * @param {Object} telemetryData - incoming telemetry reading e.g. { sensorId: "TURBINE-001", temperature: 82.4 }
 */
const processTelemetry = async (telemetryData) => {
  if (!telemetryData || !telemetryData.sensorId) return;

  const { sensorId, timestamp } = telemetryData;

  // Step 10 Log: Telemetry received
  console.log(`[RuleEngine] Telemetry received for sensor: ${sensorId}`);

  // Feed the RxJS engine — all rule evaluation happens there now.
  // The legacy synchronous evaluator loop below is disabled to prevent
  // duplicate alert creation alongside the ruleRuntime RxJS pipelines.
  pushToStream(telemetryData);

  // Legacy sync evaluator DISABLED — ruleRuntime handles evaluation.
  // Keeping this file intact so existing imports don't break.
};

module.exports = {
  processTelemetry,
  ruleEventEmitter,
};
