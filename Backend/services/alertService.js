const Alert = require('../models/Alert');
const { getIo } = require('../websocket/telemetrySocket');

// ─── Cooldown State ───────────────────────────────────────────────────────────
// Tracks last alert timestamp per (ruleId:sensorId) pair to prevent duplicates
const cooldownMap = new Map();
const COOLDOWN_MS = 60 * 1000; // 60-second cooldown per rule+sensor pair

/**
 * Checks if a (ruleId, sensorId) pair is currently in cooldown.
 * @param {string} ruleId
 * @param {string} sensorId
 * @returns {boolean} true if still in cooldown (suppress alert), false if new alert allowed
 */
function isInCooldown(ruleId, sensorId) {
  const key = `${ruleId}:${sensorId}`;
  const lastFired = cooldownMap.get(key);
  if (!lastFired) return false;
  return Date.now() - lastFired < COOLDOWN_MS;
}

/**
 * Record that an alert was just fired for this (ruleId, sensorId) pair.
 * @param {string} ruleId
 * @param {string} sensorId
 */
function recordCooldown(ruleId, sensorId) {
  const key = `${ruleId}:${sensorId}`;
  cooldownMap.set(key, Date.now());
}

// ─── Dynamic Message Builder ─────────────────────────────────────────────────

/**
 * Generates a human-readable alert message from telemetry + condition data.
 * Example: "Temperature of TURBINE-001 exceeded the configured threshold of 80°C."
 *
 * @param {string} sensorId
 * @param {Object} telemetry   - full telemetry payload
 * @param {Object|null} conditionData  - { field, operator, value } from condition node
 * @returns {string}
 */
function generateAlertMessage(sensorId, telemetry, conditionData) {
  if (!conditionData || !conditionData.field) {
    // Generic fallback
    return `Sensor ${sensorId} triggered an alert condition.`;
  }

  const { field, operator, value } = conditionData;
  const currentValue = telemetry[field];

  // Map operators to readable text
  const operatorText = {
    '>':  'exceeded',
    '>=': 'met or exceeded',
    '<':  'dropped below',
    '<=': 'met or dropped below',
    '==': 'equalled',
    '!=': 'changed from',
  }[operator] || 'triggered threshold of';

  // Capitalise field name for display
  const fieldDisplay = field.charAt(0).toUpperCase() + field.slice(1);

  const currentPart =
    currentValue !== undefined ? ` Current reading: ${currentValue}.` : '';

  return `${fieldDisplay} of ${sensorId} ${operatorText} the configured threshold of ${value}.${currentPart}`;
}

// ─── Core Alert Processing ────────────────────────────────────────────────────

/**
 * Called whenever a rule evaluates TRUE for an incoming telemetry reading.
 * Handles duplicate prevention, alert creation, DB persistence, and Socket.IO broadcast.
 *
 * @param {Object} rule       - full Rule document (with .nodes, .edges, ._id, .name)
 * @param {Object} telemetry  - telemetry payload e.g. { sensorId, temperature, ... }
 * @returns {Object|null} the saved Alert document, or null if suppressed by cooldown
 */
async function processRuleTrigger(rule, telemetry) {
  const ruleId  = rule._id ? rule._id.toString() : rule.id || 'unknown';
  const sensorId = telemetry.sensorId || 'unknown';

  // ── Step 11: Duplicate / cooldown prevention ──
  if (isInCooldown(ruleId, sensorId)) {
    console.log(
      `[AlertService] Cooldown active — suppressing duplicate alert for rule "${rule.name}" | sensor ${sensorId}`
    );
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
    `[AlertService] ✅ Alert created | Rule: "${rule.name}" | Sensor: ${sensorId} | Severity: ${severity} | Action: ${action}`
  );

  // ── Step 10: Broadcast via Socket.IO → "alert:new" ──
  try {
    const io = getIo();
    io.emit('alert:new', alertDoc);
    console.log(`[AlertService] 📡 Broadcasted alert:new for rule "${rule.name}"`);
  } catch (socketErr) {
    // Socket.IO might not be initialised in test environments — log & continue
    console.warn('[AlertService] Socket.IO not available:', socketErr.message);
  }

  // Record cooldown so next identical alert is suppressed for COOLDOWN_MS
  recordCooldown(ruleId, sensorId);

  return alertDoc;
}

// ─── Query Helpers (used by Controller) ──────────────────────────────────────

/**
 * Get all alerts, newest first.
 * @returns {Promise<Array>}
 */
async function getAllAlerts() {
  return Alert.find().sort({ timestamp: -1 });
}

/**
 * Get single alert by Mongo _id.
 * @param {string} id
 * @returns {Promise<Object|null>}
 */
async function getAlertById(id) {
  return Alert.findById(id);
}

/**
 * Mark an alert as read.
 * @param {string} id
 * @returns {Promise<Object|null>}
 */
async function markAlertAsRead(id) {
  return Alert.findByIdAndUpdate(
    id,
    { status: 'read' },
    { returnDocument: 'after' }
  );
}

module.exports = {
  processRuleTrigger,
  generateAlertMessage,
  getAllAlerts,
  getAlertById,
  markAlertAsRead,
};
