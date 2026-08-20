const EventEmitter = require('events');
const ruleService = require('./ruleService');
const { evaluateRule } = require('./ruleEvaluator');

// Internal Event Emitter for Rule Engine events (Step 9)
class RuleEventEmitter extends EventEmitter {}
const ruleEventEmitter = new RuleEventEmitter();

/**
 * Process incoming telemetry stream and evaluate against active rules (Steps 6-10).
 *
 * Flow:
 * Telemetry -> Active Rules -> Sensor Matching -> Rule Evaluator -> Condition Evaluator -> TRUE / FALSE
 * If TRUE -> Emit 'rule:triggered' event
 * If FALSE -> Ignore
 *
 * @param {Object} telemetryData - incoming telemetry reading e.g. { sensorId: "TURBINE-001", temperature: 82.4 }
 */
const processTelemetry = async (telemetryData) => {
  if (!telemetryData || !telemetryData.sensorId) return;

  const { sensorId, timestamp } = telemetryData;

  // Step 10 Log: Telemetry received
  console.log(`[RuleEngine] Telemetry received for sensor: ${sensorId}`);

  // Fetch active rules only
  const activeRules = await ruleService.getActiveRules();
  if (!activeRules || !Array.isArray(activeRules) || activeRules.length === 0) {
    return;
  }

  // Iterate over active rules to evaluate against telemetry (Steps 6-10)
  for (const rule of activeRules) {
    const evalResult = evaluateRule(rule, telemetryData);

    if (evalResult.matched) {
      const eventTimestamp = timestamp
        ? typeof timestamp === 'string'
          ? timestamp
          : timestamp.toISOString()
        : new Date().toISOString();

      // Step 9: Generate Rule Trigger Event 'rule:triggered'
      const triggerPayload = {
        ruleId: evalResult.ruleId,
        sensorId: evalResult.sensorId,
        timestamp: eventTimestamp,
      };

      console.log(`[RuleEngine] Rule triggered: ${rule.name || evalResult.ruleId} for sensor ${sensorId}`);

      // Emit 'rule:triggered' event (Step 9)
      ruleEventEmitter.emit('rule:triggered', triggerPayload);

      // Backwards-compatible emission for 'rule:matched'
      ruleEventEmitter.emit('rule:matched', {
        ...triggerPayload,
        evaluationInput: {
          ruleId: evalResult.ruleId,
          sensorId,
          telemetry: telemetryData,
          condition: rule.nodes?.find((n) => n.type === 'condition' || n.type === 'conditionNode')?.data,
        },
      });
    } else {
      // Step 8: Non-matching condition, ignore
      console.log(`[RuleEngine] Condition evaluated FALSE for rule ${rule.name || rule._id} — ignored.`);
    }
  }
};

module.exports = {
  processTelemetry,
  ruleEventEmitter,
};
