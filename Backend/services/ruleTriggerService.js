/**
 * ruleTriggerService.js — Day 4: Rule Trigger & Runtime Event Infrastructure
 *
 * Responsibilities:
 * ─────────────────
 * 1. Define and produce consistent Rule Trigger Events (Step 1 & Step 5):
 *    {
 *      "ruleId": "rule123",
 *      "ruleName": "High Temperature Alert",
 *      "sensorId": "TURBINE-001",
 *      "field": "temperature",
 *      "value": 85,
 *      "severity": "HIGH",
 *      "action": "NOTIFICATION",
 *      "message": "...",
 *      "timestamp": "2026-08-27T10:30:00Z"
 *    }
 * 2. Connect Rule Runtime with Event Publication (Step 2 & 3).
 * 3. Emit real-time "rule:triggered" events via Socket.IO for Member 4's Dashboard (Step 4).
 * 4. Deduplicate triggers to prevent duplicate database writes and event flooding (Step 6).
 * 5. Provide a configurable Cooldown / Throttling mechanism (Step 7).
 * 6. Structured logging for all trigger events (Step 10).
 * 7. Coordinate with Member 2 (Compiler) and Member 4 (Dashboard) (Steps 11, 12, 13).
 */

'use strict';

const { getIo } = require('../websocket/telemetrySocket');
const { processRuleTrigger } = require('./alertService');

// ── Step 7: Configurable Cooldown State ───────────────────────────────────────

/** Default cooldown duration in milliseconds (30 seconds) */
let globalCooldownMs = 30 * 1000;

/**
 * Tracks last trigger timestamp per (ruleId:sensorId) pair
 * @type {Map<string, number>}
 */
const cooldownMap = new Map();

/**
 * Per-rule custom cooldown overrides: ruleId -> cooldownMs
 * @type {Map<string, number>}
 */
const ruleCooldownOverrides = new Map();

/**
 * Tracks exact reading hashes to prevent identical timestamp deduplication (Step 6)
 * @type {Set<string>}
 */
const recentTriggerSignatures = new Set();
const MAX_SIGNATURES = 1000;

// ── Cooldown & Deduplication API (Step 6 & 7) ──────────────────────────────────

/**
 * Set the default global cooldown in milliseconds.
 * @param {number} ms - Cooldown in milliseconds
 */
function setGlobalCooldown(ms) {
  if (typeof ms === 'number' && ms >= 0) {
    globalCooldownMs = ms;
    console.log(`[RuleTriggerService] ⏱️ Global cooldown set to ${ms}ms (${ms / 1000}s)`);
  }
}

/**
 * Set a custom cooldown duration for a specific rule.
 * @param {string} ruleId
 * @param {number} ms
 */
function setRuleCooldown(ruleId, ms) {
  if (!ruleId) return;
  const idStr = String(ruleId);
  if (typeof ms === 'number' && ms >= 0) {
    ruleCooldownOverrides.set(idStr, ms);
    console.log(`[RuleTriggerService] ⏱️ Rule "${idStr}" custom cooldown set to ${ms}ms`);
  }
}

/**
 * Get active cooldown duration for a specific rule.
 * @param {string} ruleId
 * @returns {number}
 */
function getActiveCooldown(ruleId) {
  if (ruleId && ruleCooldownOverrides.has(String(ruleId))) {
    return ruleCooldownOverrides.get(String(ruleId));
  }
  return globalCooldownMs;
}

/**
 * Check if a (ruleId, sensorId) pair is currently in cooldown.
 *
 * @param {string} ruleId
 * @param {string} sensorId
 * @returns {boolean} true if trigger should be suppressed, false if allowed
 */
function isInCooldown(ruleId, sensorId) {
  const key = `${ruleId || 'unknown'}:${sensorId || 'unknown'}`;
  const lastTriggerTime = cooldownMap.get(key);
  if (!lastTriggerTime) return false;

  const cooldownDuration = getActiveCooldown(ruleId);
  const elapsed = Date.now() - lastTriggerTime;
  return elapsed < cooldownDuration;
}

/**
 * Get remaining cooldown time in milliseconds for a (ruleId, sensorId) pair.
 * @param {string} ruleId
 * @param {string} sensorId
 * @returns {number} remaining ms, or 0 if not in cooldown
 */
function getCooldownRemaining(ruleId, sensorId) {
  const key = `${ruleId || 'unknown'}:${sensorId || 'unknown'}`;
  const lastTriggerTime = cooldownMap.get(key);
  if (!lastTriggerTime) return 0;

  const cooldownDuration = getActiveCooldown(ruleId);
  const remaining = cooldownDuration - (Date.now() - lastTriggerTime);
  return remaining > 0 ? remaining : 0;
}

/**
 * Record that a rule has just triggered for cooldown tracking.
 * @param {string} ruleId
 * @param {string} sensorId
 * @param {number} [timestamp]
 */
function recordCooldown(ruleId, sensorId, timestamp = Date.now()) {
  const key = `${ruleId || 'unknown'}:${sensorId || 'unknown'}`;
  cooldownMap.set(key, timestamp);
}

/**
 * Reset cooldown for a specific rule & sensor (or all rules).
 * Useful for tests and dynamic rule edits.
 * @param {string} [ruleId]
 * @param {string} [sensorId]
 */
function clearCooldown(ruleId, sensorId) {
  if (ruleId && sensorId) {
    cooldownMap.delete(`${ruleId}:${sensorId}`);
  } else if (ruleId) {
    for (const key of cooldownMap.keys()) {
      if (key.startsWith(`${ruleId}:`)) {
        cooldownMap.delete(key);
      }
    }
  } else {
    cooldownMap.clear();
    ruleCooldownOverrides.clear();
    recentTriggerSignatures.clear();
  }
}

// ── Step 1 & Step 5: Event Payload Builder ─────────────────────────────────────

/**
 * Builds the canonical Rule Trigger Event structure (Step 1 & Step 5 contract).
 *
 * @param {Object} rule - Rule document ({ _id / id, name, nodes, edges })
 * @param {Object} result - Pipeline result from ruleCompiler ({ matched, outputs, context, sensorId, ... })
 * @param {Object} [telemetry] - Raw telemetry object
 * @returns {Object} Canonical RuleTriggerEvent
 */
function buildTriggerEvent(rule, result, telemetry = {}) {
  const tel = (telemetry && Object.keys(telemetry).length > 0) ? telemetry : (result.telemetry || {});
  const ruleId = rule._id ? String(rule._id) : rule.id || result.ruleId || 'unknown';
  const ruleName = rule.name || result.ruleName || 'Unnamed Rule';
  const sensorId = result.sensorId || tel.sensorId || rule.nodes?.find(n => n.type === 'sensor' || n.type === 'sensorNode')?.data?.sensorId || 'unknown';

  const outputs = Array.isArray(result.outputs) ? result.outputs : [];
  const conditionOutput = outputs.find(o => o.type === 'condition' || o.type === 'conditionNode');
  const alertOutput = outputs.find(o => o.type === 'alert' || o.type === 'alertNode');
  const context = result.context || {};

  // Extract condition field, operator, value
  const field = conditionOutput?.output?.field || context.matchedField || 'temperature';
  const operator = conditionOutput?.output?.operator || null;
  const threshold = conditionOutput?.output?.threshold ?? null;
  const value = conditionOutput?.output?.actual ?? tel[field] ?? null;

  // Extract alert actions & severity
  const severity = (alertOutput?.output?.severity || context.alertSeverity || 'HIGH').toUpperCase();
  const action = (alertOutput?.output?.action || context.alertAction || 'NOTIFICATION').toUpperCase();

  // Format human-readable message (Step 5)
  let message = '';
  if (field && value !== null && operator && threshold !== null) {
    message = `${field.charAt(0).toUpperCase() + field.slice(1)} of ${sensorId} (${value}) ${operator} threshold of ${threshold}.`;
  } else if (field && value !== null) {
    message = `${field.charAt(0).toUpperCase() + field.slice(1)} reading of ${value} on ${sensorId} triggered alert condition.`;
  } else {
    message = `Rule "${ruleName}" condition met on sensor ${sensorId}.`;
  }

  const timestamp = tel.timestamp
    ? (typeof tel.timestamp === 'string' ? tel.timestamp : new Date(tel.timestamp).toISOString())
    : new Date().toISOString();

  return {
    ruleId,
    ruleName,
    sensorId,
    field,
    value,
    operator,
    threshold,
    severity,
    action,
    message,
    timestamp,
  };
}

// ── Step 4: Socket.IO Event Publisher ─────────────────────────────────────────

/**
 * Emits the canonical "rule:triggered" event over Socket.IO.
 *
 * @param {Object} triggerEvent - Canonical RuleTriggerEvent
 * @returns {boolean} true if emitted, false if socket was unavailable
 */
function emitRuleTriggered(triggerEvent) {
  try {
    const io = getIo();
    io.emit('rule:triggered', triggerEvent);
    return true;
  } catch (err) {
    // Socket.IO may not be initialized in isolated unit tests
    return false;
  }
}

// ── Step 2 & 3: Main Rule Trigger Processing Pipeline ─────────────────────────

/**
 * Processes a rule match:
 * 1. Constructs standard RuleTriggerEvent payload (Step 1 & 5).
 * 2. Checks deduplication & cooldown (Step 6 & 7).
 * 3. Emits real-time "rule:triggered" event to Socket.IO clients (Step 4).
 * 4. Persists Alert record in MongoDB and emits "alert:new" (Step 3).
 * 5. Logs structured trigger info (Step 10).
 *
 * @param {Object} rule - Rule document
 * @param {Object} result - Pipeline result from compileRule().run()
 * @param {Object} [telemetry] - Telemetry reading
 * @returns {{ triggered: boolean, reason?: string, event: Object }}
 */
function processTrigger(rule, result, telemetry = {}) {
  const triggerEvent = buildTriggerEvent(rule, result, telemetry);
  const { ruleId, ruleName, sensorId, field, value, severity, action, timestamp } = triggerEvent;

  // ── Step 6: Deduplication Check (Exact signature check) ──
  const signature = `${ruleId}:${sensorId}:${timestamp}:${value}`;
  if (recentTriggerSignatures.has(signature)) {
    console.log(`[RuleTriggerService] 🛡️ Duplicate signature suppressed for rule "${ruleName}" | Sensor: ${sensorId}`);
    return {
      triggered: false,
      reason: 'DUPLICATE',
      event: triggerEvent,
    };
  }

  // ── Step 7: Cooldown / Throttling Check ──
  if (isInCooldown(ruleId, sensorId)) {
    const remaining = Math.round(getCooldownRemaining(ruleId, sensorId) / 1000);
    console.log(
      `[RuleTriggerService] ⏱️ Cooldown active (${remaining}s remaining) — suppressing repeat trigger for "${ruleName}" | Sensor: ${sensorId}`
    );
    return {
      triggered: false,
      reason: 'COOLDOWN',
      event: triggerEvent,
    };
  }

  // Record trigger for cooldown and deduplication
  recordCooldown(ruleId, sensorId);
  recentTriggerSignatures.add(signature);
  if (recentTriggerSignatures.size > MAX_SIGNATURES) {
    // Clear oldest items to avoid unbounded memory growth
    const firstKey = recentTriggerSignatures.values().next().value;
    recentTriggerSignatures.delete(firstKey);
  }

  // Step 10: Structured Runtime Logging
  console.log(
    `[RuleTriggerService] ⚡ Rule triggered: "${ruleName}" (${ruleId}) | ` +
    `Sensor: ${sensorId} | ${field}=${value} | Severity: ${severity} | Action: ${action}`
  );

  // Step 4: Emit real-time rule:triggered event to Socket.IO
  emitRuleTriggered(triggerEvent);

  // Step 3: Persist Alert document in MongoDB asynchronously
  try {
    const telemetryForAlert = {
      sensorId,
      timestamp,
      ...(field && value !== null ? { [field]: value } : {}),
    };
    processRuleTrigger(rule, telemetryForAlert).catch((err) => {
      console.warn(`[RuleTriggerService] Alert persistence note: ${err.message}`);
    });
  } catch (err) {
    console.warn(`[RuleTriggerService] Alert dispatch note: ${err.message}`);
  }

  return {
    triggered: true,
    event: triggerEvent,
  };
}

module.exports = {
  // Step 1 & 5: Event Interface
  buildTriggerEvent,

  // Step 2, 3 & 4: Trigger Processing & Socket Emission
  processTrigger,
  emitRuleTriggered,

  // Step 6 & 7: Cooldown & Deduplication API
  setGlobalCooldown,
  setRuleCooldown,
  getActiveCooldown,
  isInCooldown,
  getCooldownRemaining,
  recordCooldown,
  clearCooldown,
  clearAllCooldowns: clearCooldown,

  // Direct State Access for diagnostics/tests
  cooldownMap,
  ruleCooldownOverrides,
  recentTriggerSignatures,
};
