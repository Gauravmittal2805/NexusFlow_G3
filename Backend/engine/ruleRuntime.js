/**
 * ruleRuntime.js
 *
 * Runtime Rule Registry — the single source of truth for which rule pipelines
 * are currently executing in memory.
 *
 * The database (MongoDB) stores saved rules.
 * This registry stores RUNNING rules.
 *
 * Registry structure (Step 1)
 * ───────────────────────────
 *
 *   activeRules  Map<ruleId, RuntimeEntry>
 *   ├── rule-001  → { rule, pipeline, subscription, status: 'RUNNING' }
 *   ├── rule-002  → { rule, pipeline, subscription, status: 'RUNNING' }
 *   └── rule-003  → { rule, pipeline, subscription, status: 'STOPPED' }
 *
 * RuntimeEntry shape:
 *   {
 *     rule:         Object,              // original rule document
 *     pipeline:     CompiledPipeline,    // output of compileRule()
 *     subscription: Subscription|null,  // RxJS subscription (null when STOPPED)
 *     status:       'RUNNING'|'STOPPED',
 *     startedAt:    Date|null,
 *     stoppedAt:    Date|null,
 *     triggerCount: number              // how many times this rule has fired
 *   }
 *
 * Public API
 * ──────────
 *   loadRule(rule)          Step 2  – validate, compile, store (does NOT subscribe)
 *   startRule(ruleId)       Step 3  – subscribe to telemetry$, mark RUNNING
 *   stopRule(ruleId)        Step 4  – unsubscribe, mark STOPPED
 *   reloadRule(rule)        Step 8  – stopRule + loadRule + startRule in one call
 *   activateAll()           Step 7  – load + start all active rules from DB
 *   deactivateAll()                 – stop every RUNNING rule (shutdown)
 *   getStatus()             Step 11 – snapshot of all rule states
 *   getRuleStatus(ruleId)   Step 11 – status of a single rule
 *
 * Step 5 — Duplicate prevention:
 *   startRule() checks the registry before subscribing. If a rule is already
 *   RUNNING it is a no-op, preventing double-subscriptions and duplicate alerts.
 *
 * Step 9 — Trigger payload:
 *   Every match produces a structured trigger event:
 *   {
 *     ruleId, ruleName, sensorId, timestamp,
 *     value, field, operator, threshold,
 *     action, severity
 *   }
 *   This is forwarded to alertService and emitted via Socket.IO.
 */

'use strict';

const { telemetry$ }              = require('../compiler/telemetryStream');
const { compileRule, CompilationError } = require('../compiler/ruleCompiler');
const { processRuleTrigger }      = require('../services/alertService');
const ruleService                 = require('../services/ruleService');

// ── Status constants (Step 11) ────────────────────────────────────────────────

const STATUS = Object.freeze({
  RUNNING: 'RUNNING',
  STOPPED: 'STOPPED',
});

// ── Registry (Step 1) ─────────────────────────────────────────────────────────

/**
 * The in-memory registry of all known rule entries.
 *
 * Key   → ruleId (string)
 * Value → RuntimeEntry
 *
 * @type {Map<string, RuntimeEntry>}
 */
const activeRules = new Map();

// ── Helpers ───────────────────────────────────────────────────────────────────

function resolveId(rule) {
  return rule._id ? String(rule._id) : rule.id || 'unknown';
}

/**
 * Builds the structured trigger payload (Step 9).
 *
 * {
 *   ruleId, ruleName, sensorId, timestamp,
 *   value, field, operator, threshold,
 *   action, severity
 * }
 */
function buildTriggerPayload(rule, result) {
  const { ruleId, ruleName, sensorId, context, outputs } = result;

  const condOut = outputs.find(
    (o) => o.type === 'condition' || o.type === 'conditionNode'
  );
  const alertOut = outputs.find(
    (o) => o.type === 'alert' || o.type === 'alertNode'
  );

  return {
    ruleId,
    ruleName,
    sensorId,
    timestamp:  new Date().toISOString(),
    // Condition details — what was evaluated
    field:      condOut?.output?.field      ?? context.matchedField ?? null,
    operator:   condOut?.output?.operator   ?? null,
    threshold:  condOut?.output?.threshold  ?? null,
    value:      condOut?.output?.actual     ?? null,
    // Alert node details — what action to take
    action:     alertOut?.output?.action    ?? context.alertAction   ?? 'NOTIFICATION',
    severity:   alertOut?.output?.severity  ?? context.alertSeverity ?? 'HIGH',
  };
}

/**
 * Handles a rule match: logs it, emits Socket.IO, calls alertService (Step 9 & 15).
 */
async function handleTrigger(rule, result) {
  const payload = buildTriggerPayload(rule, result);

  console.log(
    `[RuleRuntime] ✅ TRIGGERED  "${payload.ruleName}" | ` +
    `Sensor: ${payload.sensorId} | ` +
    `${payload.field} ${payload.operator} ${payload.threshold} ` +
    `(actual: ${payload.value}) | ` +
    `${payload.action} / ${payload.severity}`
  );

  // Increment trigger counter in registry
  const entry = activeRules.get(payload.ruleId);
  if (entry) entry.triggerCount++;

  // Emit rule:triggered via Socket.IO
  try {
    const { getIo } = require('../websocket/telemetrySocket');
    getIo().emit('rule:triggered', {
      ruleId:    payload.ruleId,
      ruleName:  payload.ruleName,
      sensorId:  payload.sensorId,
      timestamp: payload.timestamp,
    });
  } catch (_) {
    // Not available in test environments
  }

  // Reconstruct telemetry object for alertService message generator
  const telemetryForAlert = {
    sensorId:           payload.sensorId,
    timestamp:          payload.timestamp,
    ...(payload.field   ? { [payload.field]: payload.value } : {}),
  };

  // Persist alert + broadcast alert:new (Step 15)
  try {
    await processRuleTrigger(rule, telemetryForAlert);
  } catch (err) {
    console.error(
      `[RuleRuntime] Alert creation failed for "${payload.ruleName}":`,
      err.message
    );
  }
}

// ── Step 2 — loadRule() ───────────────────────────────────────────────────────

/**
 * Validate and compile a rule, then store it in the registry as STOPPED.
 *
 * Does NOT subscribe to telemetry$.  Call startRule(ruleId) after loading
 * to begin execution.
 *
 * Inactive rules (isActive === false) are stored with status STOPPED and are
 * never subscribed (Step 7).
 *
 * @param {Object} rule - Rule document (plain object or Mongoose lean)
 * @returns {{ ok: boolean, ruleId: string, reason?: string }}
 */
function loadRule(rule) {
  const ruleId   = resolveId(rule);
  const ruleName = rule.name || 'Unnamed Rule';

  // If already in registry, unsubscribe first to avoid orphan subscriptions
  if (activeRules.has(ruleId)) {
    _unsubscribe(ruleId);
  }

  let pipeline;
  try {
    pipeline = compileRule(rule);
  } catch (err) {
    const reason = err instanceof CompilationError
      ? `Compilation failed: ${err.errors.join('; ')}`
      : `Unexpected error: ${err.message}`;

    console.error(`[RuleRuntime] ❌ Load failed for "${ruleName}" (${ruleId}): ${reason}`);

    // Store as STOPPED so getStatus() shows it
    activeRules.set(ruleId, {
      rule,
      pipeline:      null,
      subscription:  null,
      status:        STATUS.STOPPED,
      startedAt:     null,
      stoppedAt:     new Date(),
      triggerCount:  0,
      loadError:     reason,
    });

    return { ok: false, ruleId, reason };
  }

  activeRules.set(ruleId, {
    rule,
    pipeline,
    subscription:  null,
    status:        STATUS.STOPPED,
    startedAt:     null,
    stoppedAt:     null,
    triggerCount:  0,
    loadError:     null,
  });

  console.log(`[RuleRuntime] 📦 Loaded  "${ruleName}" (${ruleId})`);
  return { ok: true, ruleId };
}

// ── Internal unsubscribe helper ───────────────────────────────────────────────

function _unsubscribe(ruleId) {
  const entry = activeRules.get(ruleId);
  if (!entry) return;
  if (entry.subscription && !entry.subscription.closed) {
    entry.subscription.unsubscribe();
  }
  entry.subscription = null;
  entry.status       = STATUS.STOPPED;
  entry.stoppedAt    = new Date();
}

// ── Step 3 — startRule() ──────────────────────────────────────────────────────

/**
 * Subscribe a loaded rule to the live telemetry$ stream.
 *
 * Flow (Step 3):
 *   startRule(ruleId)
 *         ↓
 *   compileRule() [already done by loadRule]
 *         ↓
 *   pipeline.run(telemetry$, onMatch)
 *         ↓
 *   store subscription → mark RUNNING
 *
 * Guards:
 *   - Rule must be loaded (present in activeRules)
 *   - Rule must be active (isActive === true) — Step 7
 *   - Rule must not already be RUNNING — Step 5 (duplicate prevention)
 *   - pipeline must have compiled successfully
 *
 * @param {string} ruleId
 * @returns {boolean} true if started, false if skipped
 */
function startRule(ruleId) {
  const entry = activeRules.get(ruleId);

  if (!entry) {
    console.warn(`[RuleRuntime] startRule: rule "${ruleId}" not in registry. Call loadRule() first.`);
    return false;
  }

  // Step 7: Inactive rules must not execute
  if (!entry.rule.isActive) {
    console.log(`[RuleRuntime] ⏭  Skipping inactive rule "${entry.rule.name}" (${ruleId})`);
    return false;
  }

  // Step 5: Prevent duplicate subscriptions
  if (entry.status === STATUS.RUNNING && entry.subscription && !entry.subscription.closed) {
    console.log(`[RuleRuntime] ⚠️  Rule "${entry.rule.name}" already RUNNING — skipping duplicate start`);
    return false;
  }

  // Compilation may have failed during loadRule
  if (!entry.pipeline) {
    console.error(`[RuleRuntime] Cannot start "${entry.rule.name}" — no compiled pipeline (check loadError)`);
    return false;
  }

  const rule = entry.rule;

  const subscription = entry.pipeline.run(telemetry$, (result) => {
    handleTrigger(rule, result).catch((err) =>
      console.error(`[RuleRuntime] handleTrigger error for "${rule.name}":`, err.message)
    );
  });

  entry.subscription = subscription;
  entry.status       = STATUS.RUNNING;
  entry.startedAt    = new Date();
  entry.stoppedAt    = null;

  console.log(
    `[RuleRuntime] ▶  RUNNING  "${rule.name}" (${ruleId}) | ` +
    `pipeline: [${entry.pipeline.executionOrder.join(' → ')}]`
  );

  return true;
}

// ── Step 4 — stopRule() ───────────────────────────────────────────────────────

/**
 * Unsubscribe a running rule pipeline and mark it STOPPED.
 *
 * Safe to call on rules that are already STOPPED (no-op).
 * The rule remains in the registry — call loadRule() to remove it.
 *
 * @param {string} ruleId
 */
function stopRule(ruleId) {
  const entry = activeRules.get(ruleId);

  if (!entry) {
    console.warn(`[RuleRuntime] stopRule: rule "${ruleId}" not found in registry`);
    return;
  }

  if (entry.status === STATUS.STOPPED) {
    console.log(`[RuleRuntime] stopRule: rule "${entry.rule.name}" already STOPPED`);
    return;
  }

  _unsubscribe(ruleId);

  console.log(`[RuleRuntime] ⏹  STOPPED  "${entry.rule.name}" (${ruleId})`);
}

// ── Step 8 — reloadRule() ─────────────────────────────────────────────────────

/**
 * Replace a running pipeline with a freshly compiled one.
 *
 * Used when a rule is edited — ensures the runtime uses the latest graph
 * and never executes a stale compiled pipeline.
 *
 * Flow (Step 8):
 *   stopRule(ruleId)    ← tears down old subscription
 *         ↓
 *   loadRule(newRule)   ← recompiles from updated graph
 *         ↓
 *   startRule(ruleId)   ← subscribes new pipeline
 *
 * @param {Object} updatedRule - Updated rule document (same _id, new nodes/edges)
 * @returns {boolean} true if successfully reloaded and started
 */
function reloadRule(updatedRule) {
  const ruleId = resolveId(updatedRule);

  console.log(`[RuleRuntime] 🔄 Reloading "${updatedRule.name}" (${ruleId})`);

  stopRule(ruleId);

  const loaded = loadRule(updatedRule);
  if (!loaded.ok) return false;

  return startRule(ruleId);
}

// ── Step 7 — activateAll() ────────────────────────────────────────────────────

/**
 * Fetch all active rules from MongoDB, load and start each one.
 * Called once at server startup after the DB connection is ready.
 *
 * Only rules with isActive === true are loaded and started.
 *
 * @returns {Promise<{ loaded: number, started: number, failed: number }>}
 */
async function activateAll() {
  console.log('[RuleRuntime] 🚀 Activating all active rules...');

  let loaded  = 0;
  let started = 0;
  let failed  = 0;

  try {
    const rules = await ruleService.getActiveRules();

    if (!rules || rules.length === 0) {
      console.log('[RuleRuntime] No active rules found in database.');
      return { loaded: 0, started: 0, failed: 0 };
    }

    for (const rule of rules) {
      const loadResult = loadRule(rule);
      if (!loadResult.ok) { failed++; continue; }
      loaded++;

      const ok = startRule(loadResult.ruleId);
      ok ? started++ : failed++;
    }

    console.log(
      `[RuleRuntime] Activation complete — ` +
      `${loaded} loaded, ${started} started, ${failed} failed`
    );
  } catch (err) {
    console.error('[RuleRuntime] activateAll() error:', err.message);
  }

  return { loaded, started, failed };
}

/**
 * Stop every running subscription.
 * Called during graceful server shutdown.
 */
function deactivateAll() {
  let count = 0;
  for (const [ruleId, entry] of activeRules) {
    if (entry.status === STATUS.RUNNING) {
      _unsubscribe(ruleId);
      count++;
    }
  }
  console.log(`[RuleRuntime] 🛑 Deactivated ${count} running rule(s).`);
}

// ── Step 11 — getStatus() / getRuleStatus() ───────────────────────────────────

/**
 * Returns a full snapshot of all rules in the registry.
 *
 * Example output:
 *   [
 *     { ruleId: 'rule-001', ruleName: 'High Temp', status: 'RUNNING',  triggerCount: 14 },
 *     { ruleId: 'rule-002', ruleName: 'Low RPM',   status: 'STOPPED',  triggerCount:  0 },
 *   ]
 *
 * @returns {Array<RuntimeStatusEntry>}
 */
function getStatus() {
  const snapshot = [];

  for (const [ruleId, entry] of activeRules) {
    snapshot.push({
      ruleId,
      ruleName:      entry.rule.name || 'Unnamed Rule',
      isActive:      entry.rule.isActive,
      status:        entry.status,
      executionOrder: entry.pipeline?.executionOrder ?? [],
      startedAt:     entry.startedAt,
      stoppedAt:     entry.stoppedAt,
      triggerCount:  entry.triggerCount,
      loadError:     entry.loadError ?? null,
      subscriptionClosed: entry.subscription?.closed ?? null,
    });
  }

  return snapshot;
}

/**
 * Returns the status of a single rule.
 *
 * @param {string} ruleId
 * @returns {RuntimeStatusEntry|null}
 */
function getRuleStatus(ruleId) {
  const entry = activeRules.get(ruleId);
  if (!entry) return null;

  return {
    ruleId,
    ruleName:      entry.rule.name || 'Unnamed Rule',
    isActive:      entry.rule.isActive,
    status:        entry.status,
    executionOrder: entry.pipeline?.executionOrder ?? [],
    startedAt:     entry.startedAt,
    stoppedAt:     entry.stoppedAt,
    triggerCount:  entry.triggerCount,
    loadError:     entry.loadError ?? null,
    subscriptionClosed: entry.subscription?.closed ?? null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────

module.exports = {
  // Registry
  activeRules,
  STATUS,

  // Core lifecycle
  loadRule,
  startRule,
  stopRule,
  reloadRule,

  // Bulk operations
  activateAll,
  deactivateAll,

  // Status (Step 11)
  getStatus,
  getRuleStatus,

  // Exposed for testing
  buildTriggerPayload,
  handleTrigger,
};
