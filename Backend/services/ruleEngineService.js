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

  // ── Step 1 & 2: Feed the RxJS stream ──────────────────────────────────────
  // Push into telemetry$ so every compiled RxJS rule pipeline evaluates this
  // reading in memory — no extra DB query needed per rule.
  pushToStream(telemetryData);

  // Fetch active rules only (legacy synchronous evaluator — runs in parallel)
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

      // Step 9: Generate Rule Trigger Event 'rule:triggered' (Step 2 payload contract)
      const alertNode = rule.nodes?.find((n) => n.type === 'alert' || n.type === 'alertNode');
      const conditionNode = rule.nodes?.find((n) => n.type === 'condition' || n.type === 'conditionNode');
      const conditionField = conditionNode?.data?.field || 'temperature';
      const triggerPayload = {
        ruleId: evalResult.ruleId,
        ruleName: rule.name || 'Unnamed Rule',
        sensorId: evalResult.sensorId,
        severity: alertNode?.data?.severity || 'HIGH',
        action: alertNode?.data?.action || 'NOTIFICATION',
        field: conditionField,
        value: telemetryData[conditionField] !== undefined ? telemetryData[conditionField] : telemetryData.temperature,
        timestamp: eventTimestamp,
      };

      console.log(`[RuleEngine] Rule triggered: ${rule.name || evalResult.ruleId} for sensor ${sensorId}`);

      // Emit 'rule:triggered' event (Step 9)
      ruleEventEmitter.emit('rule:triggered', triggerPayload);

      // Broadcast via Socket.IO to connected web clients (Step 2)
      try {
        const { getIo } = require('../websocket/telemetrySocket');
        const io = getIo();
        io.emit('rule:triggered', triggerPayload);
      } catch (ioErr) {
        // Socket.IO may not be initialized in test environments
      }

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

      // Step 4 & Step 10: Create Alert in MongoDB + Broadcast via Socket.IO (with cooldown check)
      try {
        await processRuleTrigger(rule, telemetryData);
      } catch (alertErr) {
        console.error(`[RuleEngine] Alert creation failed for rule "${rule.name}":`, alertErr.message);
      }

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
