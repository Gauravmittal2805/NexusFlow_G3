'use strict';

/**
 * ruleRuntime.js
 *
 * Runtime Rule Registry — the single source of truth for which rule pipelines
 * are currently executing in memory.
 *
 * Registry structure
 * ──────────────────
 *   activeRules  Map<ruleId, RuntimeEntry>
 *   ├── rule-001  → { rule, pipeline, subscription, status: 'RUNNING',  conditionState: 'NORMAL' }
 *   ├── rule-002  → { rule, pipeline, subscription, status: 'RUNNING',  conditionState: 'TRIGGERED' }
 *   └── rule-003  → { rule, pipeline, subscription, status: 'STOPPED',  conditionState: 'NORMAL' }
 *
 * Public API
 * ──────────
 *   loadRule(rule)        – compile + store as STOPPED
 *   startRule(ruleId)     – subscribe to telemetry$, mark RUNNING
 *   stopRule(ruleId)      – unsubscribe, mark STOPPED
 *   reloadRule(rule)      – stop → recompile → start (edit flow)
 *   activateAll()         – load + start all active rules from DB
 *   deactivateAll()       – stop every running rule (shutdown)
 *   getStatus()           – snapshot of all rule states
 *   getRuleStatus(ruleId) – single-rule status
 */

const { telemetry$ }                    = require('../compiler/telemetryStream');
const { compileRule, CompilationError } = require('../compiler/ruleCompiler');
const {
  buildExecutionResult,
  buildRecoveryResult,
  CONDITION_STATE,
}                                       = require('./executionResult');
const { processExecutionResult }        = require('../services/alertService');
const ruleService                       = require('../services/ruleService');

// ── Status constants ──────────────────────────────────────────────────────────

const STATUS = Object.freeze({
  RUNNING: 'RUNNING',
  STOPPED: 'STOPPED',
});

// ── Registry ──────────────────────────────────────────────────────────────────

/** @type {Map<string, Object>} */
const activeRules = new Map();

// ── Internal helpers ──────────────────────────────────────────────────────────

function resolveId(rule) {
  return rule._id ? String(rule._id) : rule.id || 'unknown';
}

function _unsubscribe(ruleId) {
  const entry = activeRules.get(ruleId);
  if (!entry) return;
  if (entry.subscription && !entry.subscription.closed) {
    entry.subscription.unsubscribe();
  }
  if (entry._recoverySub && !entry._recoverySub.closed) {
    entry._recoverySub.unsubscribe();
  }
  entry.subscription  = null;
  entry._recoverySub  = null;
  entry.status        = STATUS.STOPPED;
  entry.stoppedAt     = new Date();
}

// ── Match handler ─────────────────────────────────────────────────────────────

async function _handleMatch(rule, pipelineResult) {
  const ruleId = pipelineResult.ruleId;
  const entry  = activeRules.get(ruleId);

  const execResult = buildExecutionResult(pipelineResult, rule);

  if (entry) {
    entry.conditionState = CONDITION_STATE.TRIGGERED;
    entry.triggerCount++;
  }

  console.log(
    `[RuleRuntime] ✅ MATCH  "${execResult.ruleName}" | ` +
    `Sensor: ${execResult.sensorId} | ` +
    `${execResult.field} ${execResult.operator} ${execResult.threshold} = ${execResult.value} | ` +
    `${execResult.severity}`
  );

  try {
    await processExecutionResult(execResult);
  } catch (err) {
    console.error(`[RuleRuntime] Alert error for "${execResult.ruleName}":`, err.message);
  }
}

async function _handleRecovery(ruleId, ruleName, sensorId, field) {
  const entry = activeRules.get(ruleId);
  if (!entry || entry.conditionState !== CONDITION_STATE.TRIGGERED) return;

  entry.conditionState = CONDITION_STATE.NORMAL;

  try {
    await processExecutionResult(buildRecoveryResult(ruleId, ruleName, sensorId, field));
  } catch (_) { /* best-effort */ }
}

// ── loadRule() ────────────────────────────────────────────────────────────────

function loadRule(rule) {
  const ruleId   = resolveId(rule);
  const ruleName = rule.name || 'Unnamed Rule';

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

    console.error(`[RuleRuntime] ❌ Load failed  "${ruleName}" (${ruleId}): ${reason}`);

    activeRules.set(ruleId, {
      rule,
      pipeline:       null,
      subscription:   null,
      _recoverySub:   null,
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
    _recoverySub:   null,
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

  const subscription = entry.pipeline.run(telemetry$, (pipelineResult) => {
    _handleMatch(rule, pipelineResult).catch((err) =>
      console.error(`[RuleRuntime] _handleMatch error for "${rule.name}":`, err.message)
    );
  });

  // Recovery side-channel — detects condition flipping back to FALSE
  const recoveryCheckSub = telemetry$.subscribe((telemetryData) => {
    const e = activeRules.get(ruleId);
    if (!e || e.status !== STATUS.RUNNING) return;
    if (e.conditionState !== CONDITION_STATE.TRIGGERED) return;

    const checkResult = e.pipeline.runOnce({ ...telemetryData });
    if (!checkResult.matched && (telemetryData.sensorId === e.rule.nodes?.find(
      n => n.type === 'sensor' || n.type === 'sensorNode'
    )?.data?.sensorId || telemetryData.sensorId)) {
      const condOut = checkResult.outputs.find(
        o => o.type === 'condition' || o.type === 'conditionNode'
      );
      const field = condOut?.output?.field
        ?? e.rule.nodes?.find(n => n.type === 'condition' || n.type === 'conditionNode')?.data?.field
        ?? null;
      _handleRecovery(ruleId, rule.name, telemetryData.sensorId || 'unknown', field)
        .catch(() => {});
    }
  });

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

  _unsubscribe(ruleId);
  console.log(`[RuleRuntime] ⏹  STOPPED  "${entry.rule.name}" (${ruleId})`);
}

// ── reloadRule() ──────────────────────────────────────────────────────────────

function reloadRule(updatedRule) {
  const ruleId = resolveId(updatedRule);
  console.log(`[RuleRuntime] 🔄 Reloading "${updatedRule.name}" (${ruleId})`);

  stopRule(ruleId);

  const loaded = loadRule(updatedRule);
  if (!loaded.ok) return false;

  return startRule(ruleId);
}

// ── activateAll() ─────────────────────────────────────────────────────────────

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

// ── getStatus() ───────────────────────────────────────────────────────────────

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

function buildTriggerPayload(rule, pipelineResult) {
  return buildExecutionResult(pipelineResult, rule);
}

module.exports = {
  activeRules,
  STATUS,
  CONDITION_STATE,
  loadRule,
  startRule,
  stopRule,
  reloadRule,
  activateAll,
  deactivateAll,
  getStatus,
  getRuleStatus,
  buildTriggerPayload,
  // exposed for testing
  _handleMatch,
  _handleRecovery,
};
