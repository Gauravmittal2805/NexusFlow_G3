/**
 * alertService.js
 *
 * Alert persistence, deduplication, Socket.IO broadcast.
 *
 * Two entry points:
 *
 *   processExecutionResult(executionResult)
 *     ↓  accepts a RuleExecutionResult from engine/executionResult.js
 *     ↓  Step 2 — save to MongoDB, Step 5 — emit Socket.IO, Step 6 — cooldown
 *
 *   processRuleTrigger(rule, telemetry)           ← legacy / backward-compat
 *     ↓  builds its own data from raw rule+telemetry
 *     ↓  delegates to processExecutionResult internally
 *
 * Cooldown (Step 6):
 *   Configurable via ALERT_COOLDOWN_MS env var (default 60 s).
 *   Once a rule+sensor pair fires, all repeated TRUE evaluations are
 *   silently suppressed until the cooldown window expires.
 *   This prevents alert spam when telemetry arrives faster than the
 *   condition recovery time.
 *
 *   NORMAL → TRIGGERED  →  alert created
 *   TRIGGERED (cooldown) → suppressed
 *   TRIGGERED → NORMAL  →  recovery logged, no alert, cooldown reset
 *   Cooldown expires    →  next TRIGGERED creates a new alert
 *
 * Socket.IO unified event contract (Step 5):
 *   event: "alert:new"
 *   payload:
 *   {
 *     alertId,  ruleId,   ruleName, sensorId,
 *     severity, action,   message,  value,
 *     field,    operator, threshold,
 *     timestamp
 *   }
 */

'use strict';

const Alert = require('../models/Alert');

// ── Cooldown configuration (Step 6) ──────────────────────────────────────────

/**
 * How long (ms) to suppress repeated alerts for the same rule+sensor pair.
 * Configurable via ALERT_COOLDOWN_MS environment variable.
 * Default: 60 000 ms (60 seconds).
 */
const COOLDOWN_MS = parseInt(process.env.ALERT_COOLDOWN_MS, 10) || 60_000;

/**
 * cooldownMap  Map<"ruleId:sensorId", timestamp>
 * Stores the last time an alert fired for a given (rule, sensor) pair.
 */
const cooldownMap = new Map();

/**
 * conditionStateMap  Map<"ruleId:sensorId", 'TRIGGERED'|'NORMAL'>
 * Tracks whether the condition was TRUE on the last evaluation (Step 7).
 */
const conditionStateMap = new Map();

function _cooldownKey(ruleId, sensorId) {
  return `${ruleId}:${sensorId}`;
}

function isInCooldown(ruleId, sensorId) {
  const last = cooldownMap.get(_cooldownKey(ruleId, sensorId));
  return last ? (Date.now() - last) < COOLDOWN_MS : false;
}

function recordCooldown(ruleId, sensorId) {
  cooldownMap.set(_cooldownKey(ruleId, sensorId), Date.now());
}

function clearCooldown(ruleId, sensorId) {
  cooldownMap.delete(_cooldownKey(ruleId, sensorId));
}

function getConditionState(ruleId, sensorId) {
  return conditionStateMap.get(_cooldownKey(ruleId, sensorId)) || 'NORMAL';
}

function setConditionState(ruleId, sensorId, state) {
  conditionStateMap.set(_cooldownKey(ruleId, sensorId), state);
}

// ── Socket.IO helper ──────────────────────────────────────────────────────────

function _emitAlert(payload) {
  try {
    const { getIo } = require('../websocket/telemetrySocket');
    getIo().emit('alert:new', payload);
  } catch (_) {
    // Socket.IO not initialised in test environments — ignore
  }
}

function _emitRuleTriggered(payload) {
  try {
    const { getIo } = require('../websocket/telemetrySocket');
    getIo().emit('rule:triggered', payload);
  } catch (_) {
    // ignore in tests
  }
}

// ── Message builder (kept for legacy processRuleTrigger path) ─────────────────

function generateAlertMessage(sensorId, telemetry, conditionData) {
  if (!conditionData || !conditionData.field) {
    return `Sensor ${sensorId} triggered an alert condition.`;
  }
  const { field, operator, value } = conditionData;
  const currentValue = telemetry[field];
  const operatorText = {
    '>':  'exceeded',
    '>=': 'met or exceeded',
    '<':  'dropped below',
    '<=': 'met or dropped below',
    '==': 'equalled',
    '!=': 'changed from',
  }[operator] || 'triggered threshold of';
  const fieldDisplay = field.charAt(0).toUpperCase() + field.slice(1);
  const currentPart  = currentValue !== undefined ? ` Current reading: ${currentValue}.` : '';
  return `${fieldDisplay} of ${sensorId} ${operatorText} the configured threshold of ${value}.${currentPart}`;
}

// ── Step 2 — processExecutionResult() ────────────────────────────────────────

/**
 * Primary entry point.  Accepts a canonical RuleExecutionResult and:
 *   1. Checks cooldown            (Step 6)
 *   2. Handles recovery events    (Step 7)
 *   3. Saves alert to MongoDB     (Step 2)
 *   4. Emits rich Socket.IO event (Step 5)
 *   5. Records cooldown
 *
 * @param {RuleExecutionResult} result - from engine/executionResult.buildExecutionResult()
 * @returns {Promise<Object|null>} saved Alert doc, or null if suppressed
 */
async function processExecutionResult(result) {
  const {
    ruleId, ruleName, sensorId,
    field, operator, threshold, value,
    action, severity, message, timestamp,
    conditionState,
  } = result;

  const prevState = getConditionState(ruleId, sensorId);

  // ── Step 7: Recovery — condition flipped TRIGGERED → NORMAL ──────────────
  if (conditionState === 'NORMAL') {
    if (prevState === 'TRIGGERED') {
      console.log(
        `[AlertService] 🟢 RECOVERY  "${ruleName}" | Sensor: ${sensorId} | condition returned to NORMAL`
      );
      setConditionState(ruleId, sensorId, 'NORMAL');
      clearCooldown(ruleId, sensorId);

      // Emit a lightweight recovery event so frontend can update alert status
      _emitRuleTriggered({
        ruleId, ruleName, sensorId,
        event:     'rule:recovered',
        timestamp: new Date().toISOString(),
      });
    }
    return null; // no alert for NORMAL state
  }

  // conditionState === 'TRIGGERED' from here

  // ── Step 6: Cooldown — suppress repeated triggers ─────────────────────────
  if (isInCooldown(ruleId, sensorId)) {
    console.log(
      `[AlertService] ⏳ COOLDOWN   "${ruleName}" | Sensor: ${sensorId} | suppressed (${COOLDOWN_MS / 1000}s)`
    );
    setConditionState(ruleId, sensorId, 'TRIGGERED');
    return null;
  }

  // ── Step 1 & 6: Extract alert-node data (action + severity) from React Flow graph ──
  const nodes = Array.isArray(rule.nodes) ? rule.nodes : [];

  const alertNode = nodes.find(
    (n) => n.type === 'alert' || n.type === 'alertNode'
  );

  const action   = alertNode?.data?.action   || 'NOTIFICATION';
  const severity = alertNode?.data?.severity || 'HIGH';

  // ── Step 5: Generate dynamic message using condition node data ──
  const conditionNode = nodes.find(
    (n) => n.type === 'condition' || n.type === 'conditionNode'
  );
  const conditionData = conditionNode?.data || null;
  const message = generateAlertMessage(sensorId, telemetry, conditionData);

  // ── Step 2, 3, 4: Build + save Alert document to MongoDB ──
  const mongoose = require('mongoose');
  let alertDoc;
  if (mongoose.connection && mongoose.connection.readyState === 1) {
    alertDoc = await Alert.create({
      ruleId,
      ruleName:  rule.name || 'Unnamed Rule',
      sensorId,
      message,
      severity,
      status:    'unread',
      action,
      timestamp: telemetry.timestamp ? new Date(telemetry.timestamp) : new Date(),
    });
  } else {
    // Fallback in-memory document when running without active MongoDB connection (e.g. unit tests)
    alertDoc = {
      _id: `alert-${ruleId}-${sensorId}-${Date.now()}`,
      ruleId,
      ruleName:  rule.name || 'Unnamed Rule',
      sensorId,
      message,
      severity,
      status:    'unread',
      action,
      timestamp: telemetry.timestamp ? new Date(telemetry.timestamp) : new Date(),
    };
  }

  console.log(
    `[AlertService] 🚨 ALERT      "${ruleName}" | Sensor: ${sensorId} | ` +
    `${severity} | ${action} | ${field} ${operator} ${threshold} = ${value}`
  );

  // ── Step 5: Emit unified Socket.IO payload ────────────────────────────────
  const socketPayload = {
    alertId:   alertDoc._id,
    ruleId,
    ruleName,
    sensorId,
    severity,
    action,
    message,
    value,
    field,
    operator,
    threshold,
    timestamp: alertDoc.timestamp,
  };

  _emitAlert(socketPayload);

  // Also emit rule:triggered with the same rich payload
  _emitRuleTriggered({
    ruleId, ruleName, sensorId,
    severity, value, field, operator, threshold,
    timestamp: alertDoc.timestamp,
  });

  // ── Record state + cooldown ───────────────────────────────────────────────
  setConditionState(ruleId, sensorId, 'TRIGGERED');
  recordCooldown(ruleId, sensorId);

  return alertDoc;
}

// ── Legacy entry point (backward-compat) ──────────────────────────────────────

/**
 * processRuleTrigger — kept for backward compatibility with ruleEngineService.
 * Builds a minimal RuleExecutionResult from raw rule + telemetry then delegates.
 *
 * @param {Object} rule      - Rule document with .nodes, ._id, .name
 * @param {Object} telemetry - { sensorId, temperature, ... }
 * @returns {Promise<Object|null>}
 */
async function processRuleTrigger(rule, telemetry) {
  const ruleId   = rule._id ? rule._id.toString() : rule.id || 'unknown';
  const sensorId = telemetry.sensorId || 'unknown';

  const nodes         = Array.isArray(rule.nodes) ? rule.nodes : [];
  const alertNode     = nodes.find((n) => n.type === 'alert' || n.type === 'alertNode');
  const conditionNode = nodes.find((n) => n.type === 'condition' || n.type === 'conditionNode');

  const action    = alertNode?.data?.action   || 'NOTIFICATION';
  const severity  = alertNode?.data?.severity || 'HIGH';
  const condData  = conditionNode?.data       || null;
  const message   = generateAlertMessage(sensorId, telemetry, condData);

  const minimalResult = {
    ruleId,
    ruleName:       rule.name || 'Unnamed Rule',
    sensorId,
    field:          condData?.field    ?? null,
    operator:       condData?.operator ?? null,
    threshold:      condData?.value    ?? null,
    value:          condData?.field    ? (telemetry[condData.field] ?? null) : null,
    action,
    severity,
    message,
    timestamp:      telemetry.timestamp
                      ? new Date(telemetry.timestamp).toISOString()
                      : new Date().toISOString(),
    conditionState: 'TRIGGERED',
  };

  return processExecutionResult(minimalResult);
}

// ── Query helpers ─────────────────────────────────────────────────────────────

async function getAllAlerts() {
  return Alert.find().sort({ timestamp: -1 });
}

async function getAlertById(id) {
  return Alert.findById(id);
}

async function markAlertAsRead(id) {
  return Alert.findByIdAndUpdate(id, { status: 'read' }, { returnDocument: 'after' });
}

// ── Test helpers (exported so tests can reset state) ─────────────────────────

function _resetCooldownMap()       { cooldownMap.clear(); }
function _resetConditionStateMap() { conditionStateMap.clear(); }
function _getCooldownMs()          { return COOLDOWN_MS; }

module.exports = {
  // Primary entry points
  processExecutionResult,
  processRuleTrigger,

  // Query helpers
  getAllAlerts,
  getAlertById,
  markAlertAsRead,

  // Message builder (used by tests + legacy path)
  generateAlertMessage,

  // Cooldown helpers exposed for testing
  isInCooldown,
  recordCooldown,
  clearCooldown,
  getConditionState,
  setConditionState,
  _resetCooldownMap,
  _resetConditionStateMap,
  _getCooldownMs,

  // Exposed constant
  COOLDOWN_MS,
};
