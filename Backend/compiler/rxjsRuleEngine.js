/**
 * rxjsRuleEngine.js
 *
 * In-memory RxJS rule runtime.  Replaces the per-telemetry MongoDB query
 * loop in ruleEngineService with dynamically compiled RxJS pipelines that
 * stay subscribed to the live telemetry$ Subject.
 *
 * Architecture (Steps 12–15)
 * ──────────────────────────
 *
 *   telemetry$  (Subject — one emission per sensor tick)
 *       │
 *       ├──► compiledRules.get('rule_001').subscription
 *       │         sensor filter → condition filter → alert tap
 *       │                                    ↓ match
 *       │                          alertService.processRuleTrigger()
 *       │
 *       ├──► compiledRules.get('rule_002').subscription
 *       └──► compiledRules.get('rule_003').subscription
 *
 * compiledRules Map (Step 12)
 * ───────────────────────────
 *   key   → rule._id string
 *   value → { pipeline: CompiledPipeline, subscription: Subscription }
 *
 * Public API
 * ──────────
 *   startRule(rule)        – compile + subscribe one active rule
 *   stopRule(ruleId)       – unsubscribe + remove from map
 *   activateAll()          – fetch all active rules from DB and start each
 *   deactivateAll()        – stop every running subscription (shutdown)
 *   restartRule(rule)      – stop old subscription then start fresh (rule update)
 *   getStatus()            – returns diagnostic info for all running pipelines
 *
 * Rule lifecycle (Steps 13 & 14)
 * ──────────────────────────────
 *   isActive === true   →  startRule()   →  subscription alive
 *   isActive === false  →  stopRule()    →  subscription removed
 *   Rule updated        →  restartRule() →  old sub gone, new sub wired
 */

'use strict';

const { telemetry$ }        = require('./telemetryStream');
const { compileRule, CompilationError } = require('./ruleCompiler');
const ruleService           = require('../services/ruleService');
const { processRuleTrigger } = require('../services/alertService');

// ── In-memory compiled rule store (Step 12) ───────────────────────────────────

/**
 * Holds every currently running rule pipeline.
 *
 * compiledRules Map:
 *   ruleId (string) → { pipeline: CompiledPipeline, subscription: Subscription }
 *
 * @type {Map<string, { pipeline: Object, subscription: import('rxjs').Subscription }>}
 */
const compiledRules = new Map();

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Called every time a rule's RxJS pipeline fires (condition TRUE).
 * Delegates to alertService which handles cooldown, DB persistence,
 * and Socket.IO broadcast.
 *
 * Step 15 — connects rule trigger → alert creation → alert:new broadcast.
 *
 * @param {Object} rule     - Full rule document (Mongoose lean object)
 * @param {Object} result   - PipelineResult from compiled.run() onMatch callback
 *                            { matched, ruleId, ruleName, sensorId, context, outputs }
 */
async function handleMatch(rule, result) {
  const { ruleId, ruleName, sensorId, context, outputs } = result;

  // Reconstruct the telemetry object from pipeline outputs so alertService
  // can read the actual field values for its message generator.
  // The sensor output carries sensorId; condition output carries the actual value.
  const conditionOutput = outputs.find((o) => o.type === 'condition' || o.type === 'conditionNode');
  const matchedField = conditionOutput?.output?.field || 'temperature';
  const actualValue = conditionOutput?.output?.actual ?? null;

  const telemetryForAlert = {
    sensorId,
    ...(conditionOutput?.output
      ? { [matchedField]: actualValue }
      : {}),
  };

  console.log(
    `[RxJSRuleEngine] ✅ Rule triggered: "${ruleName}" | ` +
    `Sensor: ${sensorId} | ` +
    `Field: ${matchedField} | ` +
    `Value: ${actualValue} | ` +
    `Action: ${context.alertAction || 'NOTIFICATION'} | ` +
    `Severity: ${context.alertSeverity || 'HIGH'}`
  );

  const nowIso = new Date().toISOString();

  // Step 7 & 8: Emit enriched rule:triggered via Socket.IO
  try {
    const { getIo } = require('../websocket/telemetrySocket');
    const io = getIo();
    io.emit('rule:triggered', {
      ruleId,
      ruleName,
      sensorId,
      field: matchedField,
      value: actualValue,
      status: 'ACTIVE',
      timestamp: nowIso,
    });
  } catch (_) {
    // Socket.IO may not be available in test environments
  }

  // Step 8: Update lastTriggered on Rule in MongoDB
  if (ruleId && /^[0-9a-fA-F]{24}$/.test(ruleId)) {
    try {
      const Rule = require('../models/Rule');
      await Rule.findByIdAndUpdate(ruleId, {
        lastTriggered: new Date(),
        lastTriggeredSensor: sensorId,
        lastTriggeredValue: actualValue,
      });
    } catch (dbErr) {
      // Non-fatal if DB update fails
    }
  }

  // Create alert in MongoDB + broadcast alert:new (Step 15)
  try {
    await processRuleTrigger(rule, telemetryForAlert);
  } catch (err) {
    console.error(`[RxJSRuleEngine] Alert creation failed for rule "${ruleName}":`, err.message);
  }
}

// ── Core API ──────────────────────────────────────────────────────────────────

/**
 * Compile and subscribe one rule to the live telemetry$ stream.
 *
 * Only runs if isActive === true (Step 13).
 * If the rule is already running it is restarted (stopRule + startRule).
 *
 * Flow:
 *   rule (JSON)
 *       ↓
 *   compileRule()  → CompiledPipeline
 *       ↓
 *   pipeline.run(telemetry$, onMatch)  → Subscription
 *       ↓
 *   compiledRules.set(ruleId, { pipeline, subscription })
 *
 * @param {Object} rule - Rule document (plain object or Mongoose lean)
 * @returns {boolean}   true if started, false if skipped (inactive / compile error)
 */
function startRule(rule) {
  const ruleId   = rule._id ? String(rule._id) : rule.id || 'unknown';
  const ruleName = rule.name || 'Unnamed Rule';

  // Step 13: Only compile active rules
  if (!rule.isActive) {
    console.log(`[RxJSRuleEngine] Skipping inactive rule: "${ruleName}" (${ruleId})`);
    return false;
  }

  // If already running, tear down first so we don't double-subscribe
  if (compiledRules.has(ruleId)) {
    stopRule(ruleId);
  }

  let pipeline;
  try {
    pipeline = compileRule(rule);
  } catch (err) {
    if (err instanceof CompilationError) {
      console.error(
        `[RxJSRuleEngine] Compilation failed for rule "${ruleName}": ${err.message}`,
        err.errors
      );
    } else {
      console.error(`[RxJSRuleEngine] Unexpected error compiling "${ruleName}":`, err.message);
    }
    return false;
  }

  // Wire the compiled pipeline to the shared telemetry Subject
  // onMatch is async so we wrap it to avoid unhandled rejections in the stream
  const subscription = pipeline.run(telemetry$, (result) => {
    handleMatch(rule, result).catch((err) =>
      console.error(`[RxJSRuleEngine] handleMatch error for "${ruleName}":`, err.message)
    );
  });

  compiledRules.set(ruleId, { pipeline, subscription });

  console.log(
    `[RxJSRuleEngine] ▶  Rule started: "${ruleName}" (${ruleId}) | ` +
    `order: [${pipeline.executionOrder.join(' → ')}]`
  );

  return true;
}

/**
 * Unsubscribe and remove a running rule pipeline (Step 14).
 *
 * Calling this on a rule that is not running is a safe no-op.
 *
 * @param {string} ruleId
 */
function stopRule(ruleId) {
  const entry = compiledRules.get(ruleId);
  if (!entry) return;

  entry.subscription.unsubscribe();
  compiledRules.delete(ruleId);

  console.log(`[RxJSRuleEngine] ⏹  Rule stopped: ${ruleId}`);
}

/**
 * Stop an existing subscription and start a fresh one for the same rule.
 * Called when a rule is updated (nodes/edges changed) or re-enabled.
 *
 * @param {Object} rule - Updated rule document
 * @returns {boolean}   true if restarted successfully
 */
function restartRule(rule) {
  const ruleId = rule._id ? String(rule._id) : rule.id || 'unknown';
  if (compiledRules.has(ruleId)) {
    stopRule(ruleId);
  }
  return startRule(rule);
}

/**
 * Fetch all active rules from MongoDB and start each one.
 * Called once at server startup after the DB connection is ready (Step 13).
 *
 * @returns {Promise<{ started: number, failed: number }>}
 */
async function activateAll() {
  console.log('[RxJSRuleEngine] Activating all active rules...');

  let started = 0;
  let failed  = 0;

  try {
    const activeRules = await ruleService.getActiveRules();

    if (!activeRules || activeRules.length === 0) {
      console.log('[RxJSRuleEngine] No active rules found in database.');
      return { started: 0, failed: 0 };
    }

    for (const rule of activeRules) {
      const ok = startRule(rule);
      ok ? started++ : failed++;
    }

    console.log(
      `[RxJSRuleEngine] Activation complete — ` +
      `${started} started, ${failed} skipped/failed`
    );
  } catch (err) {
    console.error('[RxJSRuleEngine] activateAll() error:', err.message);
  }

  return { started, failed };
}

/**
 * Unsubscribe every running pipeline.
 * Called during graceful server shutdown.
 */
function deactivateAll() {
  const count = compiledRules.size;
  for (const [ruleId] of compiledRules) {
    stopRule(ruleId);
  }
  console.log(`[RxJSRuleEngine] Deactivated ${count} rule pipeline(s).`);
}

/**
 * Returns a snapshot of all currently running pipelines for diagnostics.
 *
 * @returns {Array<{ ruleId: string, ruleName: string, executionOrder: string[], closed: boolean }>}
 */
function getStatus() {
  const status = [];
  for (const [ruleId, { pipeline, subscription }] of compiledRules) {
    status.push({
      ruleId,
      ruleName:       pipeline.ruleName,
      executionOrder: pipeline.executionOrder,
      closed:         subscription.closed,
    });
  }
  return status;
}

module.exports = {
  // Core lifecycle
  startRule,
  stopRule,
  restartRule,
  activateAll,
  deactivateAll,
  // Diagnostics
  getStatus,
  // Exposed for testing
  compiledRules,
};
