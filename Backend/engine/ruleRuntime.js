/**
 * ruleRuntime.js
 *
 * Runtime Rule Registry — the single source of truth for which rule pipelines
 * are currently executing in memory.
 *
 * The database (MongoDB) stores saved rules.
 * This registry stores RUNNING rules.
 *
 * Registry structure
 * ──────────────────
 *   activeRules  Map<ruleId, RuntimeEntry>
 *   ├── rule-001  → { rule, pipeline, subscription, status: 'RUNNING',  conditionState: 'NORMAL' }
 *   ├── rule-002  → { rule, pipeline, subscription, status: 'RUNNING',  conditionState: 'TRIGGERED' }
 *   └── rule-003  → { rule, pipeline, subscription, status: 'STOPPED',  conditionState: 'NORMAL' }
 *
 * RuntimeEntry shape:
 *   {
 *     rule:           Object,              // original rule document
 *     pipeline:       CompiledPipeline,    // output of compileRule()
 *     subscription:   Subscription|null,  // RxJS subscription (null when STOPPED)
 *     status:         'RUNNING'|'STOPPED',
 *     conditionState: 'NORMAL'|'TRIGGERED', // Step 7 state machine
 *     startedAt:      Date|null,
 *     stoppedAt:      Date|null,
 *     triggerCount:   number,
 *     loadError:      string|null
 *   }
 *
 * Public API
 * ──────────
 *   loadRule(rule)          – validate, compile, store (does NOT subscribe)
 *   startRule(ruleId)       – subscribe to telemetry$, mark RUNNING
 *   stopRule(ruleId)        – unsubscribe, mark STOPPED
 *   reloadRule(rule)        – stopRule + loadRule + startRule (Step 11 — edit flow)
 *   activateAll()           – load + start all active rules from DB
 *   deactivateAll()         – stop every RUNNING rule (shutdown)
 *   getStatus()             – snapshot of all rule states (Step 11)
 *   getRuleStatus(ruleId)   – single-rule status
 *
 * Error isolation (Step 10):
 *   Compilation errors are caught per-rule. A failed rule is stored with
 *   status STOPPED and loadError set. All other rules continue running.
 *
 * State machine (Step 7):
 *   NORMAL  ──► telemetry arrives, condition TRUE  ──► TRIGGERED → alert
 *   TRIGGERED ► telemetry arrives, condition FALSE ──► NORMAL    → recovery
 *   TRIGGERED ► telemetry arrives, condition TRUE  ──► suppressed by cooldown
 */

'use strict';

const { telemetry$ }                  = require('../compiler/telemetryStream');
const { compileRule, CompilationError } = require('../compiler/ruleCompiler');
const { buildExecutionResult,
        buildRecoveryResult,
        CONDITION_STATE }             = require('./executionResult');
const { processExecutionResult }      = require('../services/alertService');
const ruleService                     = require('../services/ruleService');

// ── Status constants ──────────────────────────────────────────────────────────

const STATUS = Object.freeze({
  RUNNING: 'RUNNING',
  STOPPED: 'STOPPED',
});

// ── Registry ──────────────────────────────────────────────────────────────────

/** @type {Map<string, RuntimeEntry>} */
const activeRules = new Map();

// ── Helpers ───────────────────────────────────────────────────────────────────

function resolveId(rule) {
  return rule._id ? String(rule._id) : rule.id || 'unknown';
}

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

// ── Match handler — Step 1,2,3,4,5,6,7 ───────────────────────────────────────

/**
 * Called by the RxJS pipeline every time a rule evaluates TRUE.
 *
 * Flow:
 *   PipelineResult (from compiled.run onMatch)
 *         ↓
 *   buildExecutionResult()   ← canonical RuleExecutionResult (Step 1)
 *         ↓
 *   processExecutionResult() ← cooldown + DB + Socket.IO (Steps 2,5,6)
 *
 * @param {Object} rule           - rule document
 * @param {Object} pipelineResult - PipelineResult from ruleCompiler.run()
 */
async function _handleMatch(rule, pipelineResult) {
  const entry = activeRules.get(pipelineResult.ruleId);

  // Build the canonical execution result (Step 1)
  const execResult = buildExecutionResult(pipelineResult, rule);

  // State transition: NORMAL → TRIGGERED
  const prevState = entry?.conditionState ?? CONDITION_STATE.NORMAL;
  if (entry) {
    entry.conditionState = CONDITION_STATE.TRIGGERED;
    entry.triggerCount++;
  }

  console.log(
    `[RuleRuntime] ✅ MATCH  "${execResult.ruleName}" | ` +
    `Sensor: ${execResult.sensorId} | ` +
    `${execResult.field} ${execResult.operator} ${execResult.threshold} ` +
    `= ${execResult.value} | ${execResult.severity} | prev: ${prevState}`
  );

  // Delegate to alertService (Steps 2, 5, 6, 7)
  try {
    await processExecutionResult(execResult);
  } catch (err) {
    console.error(
      `[RuleRuntime] Alert creation failed for "${execResult.ruleName}":`,
      err.message
    );
  }
}

/**
 * Called when a telemetry reading is evaluated as FALSE for a rule that was
 * previously TRIGGERED — implements Step 7 state recovery.
 *
 * @param {string} ruleId
 * @param {string} ruleName
 * @param {string} sensorId
 * @param {string|null} field
 */
async function _handleRecovery(ruleId, ruleName, sensorId, field) {
  const entry = activeRules.get(ruleId);
  if (!entry || entry.conditionState !== CONDITION_STATE.TRIGGERED) return;

  entry.conditionState = CONDITION_STATE.NORMAL;

  const recoveryResult = buildRecoveryResult(ruleId, ruleName, sensorId, field);

  try {
    await processExecutionResult(recoveryResult);
  } catch (_) {
    // Recovery is best-effort — don't crash on error
  }
}

// ── loadRule() ────────────────────────────────────────────────────────────────

/**
 * Compile a rule and store it in the registry as STOPPED.
 * Does NOT subscribe to telemetry$.
 *
 * Error isolation (Step 10): compilation errors are caught here. A failed
 * rule is stored with pipeline=null and loadError set. All other rules
 * continue unaffected.
 *
 * @param {Object} rule
 * @returns {{ ok: boolean, ruleId: string, reason?: string }}
 */
function loadRule(rule) {
  const ruleId   = resolveId(rule);
  const ruleName = rule.name || 'Unnamed Rule';

  // Tear down any existing subscription before recompiling
  if (activeRules.has(ruleId)) {
    _unsubscribe(ruleId);
  }

  let pipeline;
  try {
    pipeline = compileRule(rule);
  } catch (err) {
    // Step 10 — catch compile error, log it, keep other rules running
    const reason = err instanceof CompilationError
      ? `Compilation failed: ${err.errors.join('; ')}`
      : `Unexpected error: ${err.message}`;

    console.error(`[RuleRuntime] ❌ Load failed  "${ruleName}" (${ruleId}): ${reason}`);

    activeRules.set(ruleId, {
      rule,
      pipeline:       null,
      subscription:   null,
      status:         STATUS.STOPPED,
      conditionState: CONDITION_STATE.NORMAL,
      startedAt:      null,
      stoppedAt:      new Date(),
      triggerCount:   0,
      loadError:      reason,
    });

    return { ok: false, ruleId, reason };
  }

  activeRules.set(ruleId, {
    rule,
    pipeline,
    subscription:   null,
    status:         STATUS.STOPPED,
    conditionState: CONDITION_STATE.NORMAL,
    startedAt:      null,
    stoppedAt:      null,
    triggerCount:   0,
    loadError:      null,
  });

  console.log(`[RuleRuntime] 📦 Loaded  "${ruleName}" (${ruleId})`);
  return { ok: true, ruleId };
}

// ── startRule() ───────────────────────────────────────────────────────────────

/**
 * Subscribe a loaded rule to the live telemetry$ stream.
 *
 * Guards:
 *   - Rule must exist in registry (call loadRule first)
 *   - isActive must be true
 *   - Must not already be RUNNING (duplicate prevention)
 *   - Pipeline must have compiled successfully
 *
 * The pipeline's onMatch fires _handleMatch (TRUE condition).
 * The recovery path is tracked via entry.conditionState so that
 * when condition flips FALSE, _handleRecovery is invoked on the
 * NEXT non-matching emission (handled by a separate subscription tap).
 *
 * @param {string} ruleId
 * @returns {boolean}
 */
function startRule(ruleId) {
  const entry = activeRules.get(ruleId);

  if (!entry) {
    console.warn(`[RuleRuntime] startRule: "${ruleId}" not in registry — call loadRule() first`);
    return false;
  }

  if (!entry.rule.isActive) {
    console.log(`[RuleRuntime] ⏭  Skipping inactive rule "${entry.rule.name}" (${ruleId})`);
    return false;
  }

  if (entry.status === STATUS.RUNNING && entry.subscription && !entry.subscription.closed) {
    console.log(`[RuleRuntime] ⚠️  Already RUNNING "${entry.rule.name}" — duplicate start skipped`);
    return false;
  }

  if (!entry.pipeline) {
    console.error(`[RuleRuntime] Cannot start "${entry.rule.name}" — no pipeline (check loadError)`);
    return false;
  }

  const rule = entry.rule;

  // Wire onMatch — fires every time condition is TRUE
  const subscription = entry.pipeline.run(telemetry$, (pipelineResult) => {
    _handleMatch(rule, pipelineResult).catch((err) =>
      console.error(`[RuleRuntime] _handleMatch error for "${rule.name}":`, err.message)
    );
  });

  // Wire recovery detection — peek at every emission (matched or not)
  // by also subscribing to the raw telemetry$ for this rule.
  // We use a lightweight side-channel: track conditionState and emit
  // recovery when we see the entry flip from TRIGGERED back to non-matching.
  // This is done inside _handleMatch / processExecutionResult via the
  // conditionStateMap in alertService. The runtime reflects it back:
  const { Subject } = require('rxjs');
  const recoveryCheckSub = telemetry$.subscribe((telemetryData) => {
    const e = activeRules.get(ruleId);
    if (!e || e.status !== STATUS.RUNNING) return;
    if (e.conditionState !== CONDITION_STATE.TRIGGERED) return;

    // Run the pipeline synchronously to check if condition is still true
    const checkResult = e.pipeline.runOnce({ ...telemetryData });
    if (!checkResult.matched && checkResult.sensorId === (telemetryData.sensorId || 'unknown')) {
      // Condition flipped FALSE — trigger recovery
      const condOut  = checkResult.outputs.find(
        (o) => o.type === 'condition' || o.type === 'conditionNode'
      );
      const field = condOut?.output?.field ?? e.rule.nodes?.find(
        (n) => n.type === 'condition' || n.type === 'conditionNode'
      )?.data?.field ?? null;

      _handleRecovery(ruleId, rule.name, telemetryData.sensorId || 'unknown', field)
        .catch(() => {});
    }
  });

  // Combine both into one logical subscription group
  // We store subscription as the primary (the onMatch one)
  // and track the recovery sub on the entry
  entry.subscription    = subscription;
  entry._recoverySub    = recoveryCheckSub;
  entry.status          = STATUS.RUNNING;
  entry.conditionState  = CONDITION_STATE.NORMAL;
  entry.startedAt       = new Date();
  entry.stoppedAt       = null;

  console.log(
    `[RuleRuntime] ▶  RUNNING  "${rule.name}" (${ruleId}) | ` +
    `pipeline: [${entry.pipeline.executionOrder.join(' → ')}]`
  );

  return true;
}

// ── stopRule() ────────────────────────────────────────────────────────────────

/**
 * Unsubscribe a running rule and mark it STOPPED.
 * Safe to call on already-STOPPED rules (no-op).
 *
 * @param {string} ruleId
 */
function stopRule(ruleId) {
  const entry = activeRules.get(ruleId);

  if (!entry) {
    console.warn(`[RuleRuntime] stopRule: "${ruleId}" not found in registry`);
    return;
  }

  if (entry.status === STATUS.STOPPED) {
    console.log(`[RuleRuntime] stopRule: "${entry.rule.name}" already STOPPED`);
    return;
  }

  // Unsubscribe recovery side-channel first
  if (entry._recoverySub && !entry._recoverySub.closed) {
    entry._recoverySub.unsubscribe();
  }
  entry._recoverySub = null;

  _unsubscribe(ruleId);

  console.log(`[RuleRuntime] ⏹  STOPPED  "${entry.rule.name}" (${ruleId})`);
}

// ── reloadRule() — Step 11 ────────────────────────────────────────────────────

/**
 * Stop old pipeline, recompile from updated graph, start fresh.
 * Used when a rule is edited (Member 3 changes condition/nodes).
 *
 * @param {Object} updatedRule
 * @returns {boolean}
 */
function reloadRule(updatedRule) {
  const ruleId = resolveId(updatedRule);
  console.log(`[RuleRuntime] 🔄 Reloading "${updatedRule.name}" (${ruleId})`);

  stopRule(ruleId);

  const loaded = loadRule(updatedRule);
  if (!loaded.ok) return false;

  return startRule(ruleId);
}

// ── activateAll() ─────────────────────────────────────────────────────────────

/**
 * Load and start all active rules from MongoDB.
 * Called once at server startup.
 *
 * Step 10: Each rule is compiled independently. A failure in one rule
 * does not prevent others from starting.
 *
 * @returns {Promise<{ loaded: number, started: number, failed: number }>}
 */
async function activateAll() {
  console.log('[RuleRuntime] 🚀 Activating all active rules...');
  let loaded = 0, started = 0, failed = 0;

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
      startRule(loadResult.ruleId) ? started++ : failed++;
    }

    console.log(
      `[RuleRuntime] Activation complete — ${loaded} loaded, ${started} started, ${failed} failed`
    );
  } catch (err) {
    console.error('[RuleRuntime] activateAll() error:', err.message);
  }

  return { loaded, started, failed };
}

/**
 * Stop all running subscriptions. Called during graceful shutdown.
 */
function deactivateAll() {
  let count = 0;
  for (const [ruleId, entry] of activeRules) {
    if (entry.status === STATUS.RUNNING) {
      stopRule(ruleId);
      count++;
    }
  }
  console.log(`[RuleRuntime] 🛑 Deactivated ${count} running rule(s).`);
}

// ── getStatus() — Step 11 ─────────────────────────────────────────────────────

/**
 * Returns a full snapshot of all rules in the registry.
 * Includes RUNNING/STOPPED status, conditionState, triggerCount, and
 * loadError for failed rules.
 *
 * @returns {Array<RuntimeStatusEntry>}
 */
function getStatus() {
  const snapshot = [];
  for (const [ruleId, entry] of activeRules) {
    snapshot.push({
      ruleId,
      ruleName:           entry.rule.name || 'Unnamed Rule',
      isActive:           entry.rule.isActive,
      status:             entry.status,
      conditionState:     entry.conditionState,
      executionOrder:     entry.pipeline?.executionOrder ?? [],
      startedAt:          entry.startedAt,
      stoppedAt:          entry.stoppedAt,
      triggerCount:       entry.triggerCount,
      loadError:          entry.loadError ?? null,
      subscriptionClosed: entry.subscription?.closed ?? null,
    });
  }
  return snapshot;
}

/**
 * Returns the status of a single rule, or null if not found.
 *
 * @param {string} ruleId
 * @returns {RuntimeStatusEntry|null}
 */
function getRuleStatus(ruleId) {
  const entry = activeRules.get(ruleId);
  if (!entry) return null;
  return {
    ruleId,
    ruleName:           entry.rule.name || 'Unnamed Rule',
    isActive:           entry.rule.isActive,
    status:             entry.status,
    conditionState:     entry.conditionState,
    executionOrder:     entry.pipeline?.executionOrder ?? [],
    startedAt:          entry.startedAt,
    stoppedAt:          entry.stoppedAt,
    triggerCount:       entry.triggerCount,
    loadError:          entry.loadError ?? null,
    subscriptionClosed: entry.subscription?.closed ?? null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────

module.exports = {
  activeRules,
  STATUS,
  CONDITION_STATE,

  // Core lifecycle
  loadRule,
  startRule,
  stopRule,
  reloadRule,

  // Bulk
  activateAll,
  deactivateAll,

  // Status
  getStatus,
  getRuleStatus,

  // Exposed for testing
  _handleMatch,
  _handleRecovery,
};
