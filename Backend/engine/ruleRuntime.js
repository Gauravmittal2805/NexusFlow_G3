/**
 * ruleRuntime.js — Day 4: Runtime Rule Engine & Lifecycle Manager
 *
 * Single source of truth for active rule pipelines executing in memory.
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
const { telemetry$ } = require('../compiler/telemetryStream');
const { compileRule, CompilationError } = require('../compiler/ruleCompiler');
const ruleService = require('../services/ruleService');
const ruleTriggerService = require('../services/ruleTriggerService');

// ── Step 8: Status Constants ──────────────────────────────────────────────────

const STATUS = Object.freeze({
  RUNNING:  'RUNNING',
  STOPPED:  'STOPPED',
  ERROR:    'ERROR',
  ACTIVE:   'ACTIVE',
  INACTIVE: 'INACTIVE',
});

// ── Registry ──────────────────────────────────────────────────────────────────

/** @type {Map<string, RuntimeEntry>} */
// ── Step 1 & 8: Active Rules Registry ─────────────────────────────────────────

/**
 * The in-memory registry of all known rule runtime entries.
 * Key   → ruleId (string)
 * Value → RuntimeEntry
 * @type {Map<string, RuntimeEntry>}
 */
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
 * Handles a rule trigger event by delegating to Rule Trigger Service (Step 3 & 4).
 *
 * @param {Object} rule - Rule document
 * @param {Object} result - Pipeline result from compileRule()
 * @returns {Promise<Object>}
 */
function handleTrigger(rule, result) {
  const ruleId = resolveId(rule);
  const entry = activeRules.get(ruleId);

  // Delegate event construction, deduplication, cooldown, Socket.IO & Alert persistence
  const outcome = ruleTriggerService.processTrigger(rule, result, result.telemetry);

  // Increment trigger counter in registry ONLY if trigger was allowed (not suppressed by cooldown/dedup)
  if (entry && outcome && outcome.triggered) {
    entry.triggerCount = (entry.triggerCount || 0) + 1;
    entry.lastTriggeredAt = new Date();
  }

  return outcome;
}

// ── Step 2: loadRule() ────────────────────────────────────────────────────────

/**
 * Validate and compile a rule, then store it in the registry as STOPPED.
 * Does NOT subscribe to telemetry$. Call startRule(ruleId) after loading.
 *
 * @param {Object} rule - Rule document ({ _id / id, name, isActive, nodes, edges })
 * @returns {{ ok: boolean, ruleId: string, reason?: string }}
 */
function loadRule(rule) {
  if (!rule) {
    return { ok: false, ruleId: 'unknown', reason: 'Rule object is missing' };
  }

  const ruleId = resolveId(rule);
  const ruleName = rule.name || 'Unnamed Rule';

  // If already in registry, unsubscribe old subscription first
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

    // Step 10: Logging compilation failure
    console.error(`[RuleRuntime] ❌ Compilation failed for rule "${ruleName}" (${ruleId}): ${reason}`);

    // Step 8: Store with status ERROR
    activeRules.set(ruleId, {
      rule,
      pipeline: null,
      subscription: null,
      status: STATUS.ERROR,
      startedAt: null,
      stoppedAt: new Date(),
      triggerCount: 0,
      loadError: reason,
      lastError: reason,
    });

    return { ok: false, ruleId, reason };
  }

  activeRules.set(ruleId, {
    rule,
    pipeline,
    subscription: null,
    status: STATUS.STOPPED,
    startedAt: null,
    stoppedAt: null,
    triggerCount: 0,
    loadError: null,
    lastError: null,
  });

  console.log(`[RuleRuntime] 📦 Loaded rule "${ruleName}" (${ruleId})`);
  return { ok: true, ruleId };
}

// ── Internal Unsubscribe Helper ───────────────────────────────────────────────

function _unsubscribe(ruleId) {
  const entry = activeRules.get(ruleId);
  if (!entry) return;

  if (entry.subscription && !entry.subscription.closed) {
    try {
      entry.subscription.unsubscribe();
    } catch (err) {
      console.error(`[RuleRuntime] Error unsubscribing rule "${ruleId}":`, err.message);
    }
  }
  entry.subscription = null;
  entry.status = STATUS.STOPPED;
  entry.stoppedAt = new Date();
}

// ── Step 3: startRule() ───────────────────────────────────────────────────────

/**
 * Subscribe a loaded rule pipeline to the live telemetry$ stream.
 *
 * @param {string} ruleId - Unique rule identifier
 * @returns {boolean} true if started, false if skipped
 */
function startRule(ruleId) {
  const idStr = String(ruleId);
  const entry = activeRules.get(idStr);

  if (!entry) {
    console.warn(`[RuleRuntime] startRule: rule "${idStr}" not in registry. Call loadRule() first.`);
    return false;
  }

  const rule = entry.rule;
  const ruleName = rule.name || idStr;

  // Inactive rules must not execute
  if (!rule.isActive) {
    console.log(`[RuleRuntime] ⏭ Skipping inactive rule: "${ruleName}" (${idStr})`);
    entry.status = STATUS.STOPPED;
    return false;
  }

  // Duplicate prevention
  if (entry.status === STATUS.RUNNING && entry.subscription && !entry.subscription.closed) {
    console.log(`[RuleRuntime] ⚠️ Rule "${ruleName}" is already RUNNING — skipping duplicate start`);
    return false;
  }

  // Check compiled pipeline
  if (!entry.pipeline) {
    console.error(`[RuleRuntime] Cannot start "${ruleName}" — no compiled pipeline`);
    entry.status = STATUS.ERROR;
    return false;
  }

  let subscription;
  try {
    // Step 9: Isolated execution with error handler
    subscription = entry.pipeline.run(
      telemetry$,
      (result) => {
        try {
          handleTrigger(rule, result);
        } catch (err) {
          console.error(`[RuleRuntime] handleTrigger error for "${ruleName}":`, err.message);
        }
      },
      (err) => {
        // Step 9: Isolated error handler
        console.error(`[RuleRuntime] ❌ Rule execution failed for rule "${ruleName}" (${idStr}):`, err.message || err);
        entry.status = STATUS.ERROR;
        entry.lastError = err.message || String(err);
      }
    );
  } catch (err) {
    console.error(`[RuleRuntime] ❌ Failed to subscribe rule "${ruleName}" (${idStr}):`, err.message);
    entry.status = STATUS.ERROR;
    entry.lastError = err.message;
    return false;
  }

  entry.subscription = subscription;
  entry.status = STATUS.RUNNING;
  entry.startedAt = new Date();
  entry.stoppedAt = null;
  entry.lastError = null;

  // Step 10: Logging started rule
  console.log(
    `[RuleRuntime] ▶ Started rule: "${ruleName}" (${idStr}) | ` +
    `pipeline: [${entry.pipeline.executionOrder.join(' → ')}]`
  );

  return true;
}

// ── Step 4: stopRule() ────────────────────────────────────────────────────────

/**
 * Unsubscribe a running rule pipeline and mark it STOPPED.
 * Safe no-op on already STOPPED rules.
 *
 * @param {string} ruleId
 */
function stopRule(ruleId) {
  const idStr = String(ruleId);
  const entry = activeRules.get(idStr);

  if (!entry) {
    console.warn(`[RuleRuntime] stopRule: rule "${idStr}" not found in registry`);
    return;
  }

  if (entry.status === STATUS.STOPPED && (!entry.subscription || entry.subscription.closed)) {
    return;
  }

  _unsubscribe(idStr);

  // Step 10: Logging stopped rule
  console.log(`[RuleRuntime] ⏹ Stopped rule: "${entry.rule.name || idStr}" (${idStr})`);
}

// ── Step 8: reloadRule() ──────────────────────────────────────────────────────

/**
 * Reloads an updated rule graph: stops old subscription, recompiles, and starts.
 *
 * @param {Object} updatedRule - Updated rule document
 * @returns {boolean} true if successfully reloaded and started
 */
function reloadRule(updatedRule) {
  const ruleId = resolveId(updatedRule);
  const ruleName = updatedRule.name || ruleId;

  console.log(`[RuleRuntime] 🔄 Reloading rule: "${ruleName}" (${ruleId})`);

  stopRule(ruleId);

  const loaded = loadRule(updatedRule);
  if (!loaded.ok) return false;

  return startRule(ruleId);
}

// ── Bulk Operations (activateAll / deactivateAll) ─────────────────────────────

/**
 * Fetch all active rules from MongoDB, load and start each one.
 * Called once at server startup.
 *
 * @returns {Promise<{ loaded: number, started: number, failed: number }>}
 */
async function activateAll() {
  console.log('[RuleRuntime] 🚀 Activating all active rules...');

  let loaded = 0;
  let started = 0;
  let failed = 0;

  try {
    const rules = await ruleService.getActiveRules();

    if (!rules || rules.length === 0) {
      console.log('[RuleRuntime] No active rules found in database.');
      return { loaded: 0, started: 0, failed: 0 };
    }

    for (const rule of rules) {
      const loadResult = loadRule(rule);
      if (!loadResult.ok) {
        failed++;
        continue;
      }
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
 * Stop every running subscription during server shutdown.
 */
function deactivateAll() {
  let count = 0;
  for (const [ruleId, entry] of activeRules) {
    if (entry.status === STATUS.RUNNING || entry.subscription) {
      _unsubscribe(ruleId);
      count++;
    }
  }
  console.log(`[RuleRuntime] 🛑 Deactivated ${count} running rule(s).`);
}

// ── Step 8 & 11: Status Queries ───────────────────────────────────────────────

/**
 * Returns diagnostic snapshot of all registered rules.
 *
 * @returns {Array<Object>}
 */
function getStatus() {
  const snapshot = [];
  for (const [ruleId, entry] of activeRules) {
    snapshot.push({
      ruleId,
      ruleName: entry.rule.name || 'Unnamed Rule',
      isActive: Boolean(entry.rule.isActive),
      status: entry.status,
      executionOrder: entry.pipeline?.executionOrder ?? [],
      startedAt: entry.startedAt,
      stoppedAt: entry.stoppedAt,
      triggerCount: entry.triggerCount || 0,
      loadError: entry.loadError ?? null,
      lastError: entry.lastError ?? null,
      subscriptionClosed: entry.subscription ? entry.subscription.closed : null,
    });
  }
  return snapshot;
}

/**
 * Returns status entry for a single rule.
 *
 * @param {string} ruleId
 * @returns {Object|null}
 */
function getRuleStatus(ruleId) {
  const entry = activeRules.get(String(ruleId));
  if (!entry) return null;
  return {
    ruleId: String(ruleId),
    ruleName: entry.rule.name || 'Unnamed Rule',
    isActive: Boolean(entry.rule.isActive),
    status: entry.status,
    executionOrder: entry.pipeline?.executionOrder ?? [],
    startedAt: entry.startedAt,
    stoppedAt: entry.stoppedAt,
    triggerCount: entry.triggerCount || 0,
    loadError: entry.loadError ?? null,
    lastError: entry.lastError ?? null,
    subscriptionClosed: entry.subscription ? entry.subscription.closed : null,
  };
}

module.exports = {
  // Registry & Status
  activeRules,
  STATUS,
  CONDITION_STATE,

  // Core Lifecycle API
  loadRule,
  startRule,
  stopRule,
  reloadRule,

  // Bulk Operations
  activateAll,
  deactivateAll,

  // Status API
  getStatus,
  getRuleStatus,

  // Trigger Bridge
  handleTrigger,
};
