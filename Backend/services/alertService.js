'use strict';

/**
 * alertService.js — clean rewrite
 * Primary entry point: processExecutionResult(result)
 * Legacy entry point:  processRuleTrigger(rule, telemetry)
 */

const Alert          = require('../models/Alert');
const { sendWebhook } = require('./webhookService');

const COOLDOWN_MS = parseInt(process.env.ALERT_COOLDOWN_MS, 10) || 60_000;
const cooldownMap      = new Map();
const conditionStateMap = new Map();

function _key(ruleId, sensorId) { return `${ruleId}:${sensorId}`; }
function isInCooldown(ruleId, sensorId)      { const l = cooldownMap.get(_key(ruleId, sensorId)); return l ? (Date.now() - l) < COOLDOWN_MS : false; }
function recordCooldown(ruleId, sensorId)    { cooldownMap.set(_key(ruleId, sensorId), Date.now()); }
function clearCooldown(ruleId, sensorId)     { cooldownMap.delete(_key(ruleId, sensorId)); }
function getConditionState(ruleId, sensorId) { return conditionStateMap.get(_key(ruleId, sensorId)) || 'NORMAL'; }
function setConditionState(ruleId, sensorId, state) { conditionStateMap.set(_key(ruleId, sensorId), state); }

function _emit(event, payload) {
  try { require('../websocket/telemetrySocket').getIo().emit(event, payload); } catch (_) {}
}

function generateAlertMessage(sensorId, telemetry, conditionData) {
  if (!conditionData || !conditionData.field) return `Sensor ${sensorId} triggered an alert condition.`;
  const { field, operator, value } = conditionData;
  const cur = telemetry[field];
  const verb = { '>':'exceeded','>=':'met or exceeded','<':'dropped below','<=':'met or dropped below','==':'equalled','!=':'changed from' }[operator] || 'triggered threshold of';
  const f = field.charAt(0).toUpperCase() + field.slice(1);
  return `${f} of ${sensorId} ${verb} the configured threshold of ${value}.${cur !== undefined ? ` Current reading: ${cur}.` : ''}`;
}

async function processExecutionResult(result) {
  const { ruleId, ruleName, sensorId, field, operator, threshold, value, action, severity, message, timestamp, conditionState } = result;
  const prevState = getConditionState(ruleId, sensorId);

  if (conditionState === 'NORMAL') {
    if (prevState === 'TRIGGERED') {
      console.log(`[AlertService] 🟢 RECOVERY  "${ruleName}" | Sensor: ${sensorId}`);
      setConditionState(ruleId, sensorId, 'NORMAL');
      clearCooldown(ruleId, sensorId);
      _emit('rule:triggered', { ruleId, ruleName, sensorId, event: 'rule:recovered', timestamp: new Date().toISOString() });
    }
    return null;
  }

  if (isInCooldown(ruleId, sensorId)) {
    console.log(`[AlertService] ⏳ COOLDOWN   "${ruleName}" | Sensor: ${sensorId} | suppressed (${COOLDOWN_MS / 1000}s)`);
    setConditionState(ruleId, sensorId, 'TRIGGERED');
    return null;
  }

  const alertDoc = await Alert.create({ ruleId, ruleName, sensorId, message, severity, status: 'unread', action, timestamp: timestamp ? new Date(timestamp) : new Date() });
  console.log(`[AlertService] 🚨 ALERT      "${ruleName}" | Sensor: ${sensorId} | ${severity} | ${action} | ${field} ${operator} ${threshold} = ${value}`);

  // Step 5: Fire webhook — attach `value` so the external service has the raw reading
  sendWebhook({ ...alertDoc.toObject(), value }).catch((err) => {
    console.error(`[AlertService] Webhook dispatch error (non-fatal): ${err.message}`);
  });

  const socketPayload = { alertId: alertDoc._id, ruleId, ruleName, sensorId, severity, action, message, value, field, operator, threshold, timestamp: alertDoc.timestamp };
  _emit('alert:new', socketPayload);
  _emit('rule:triggered', { ruleId, ruleName, sensorId, severity, value, field, operator, threshold, timestamp: alertDoc.timestamp });

  setConditionState(ruleId, sensorId, 'TRIGGERED');
  recordCooldown(ruleId, sensorId);
  return alertDoc;
}

async function processRuleTrigger(rule, telemetry) {
  const ruleId   = rule._id ? rule._id.toString() : rule.id || 'unknown';
  const sensorId = telemetry.sensorId || 'unknown';
  const nodes         = Array.isArray(rule.nodes) ? rule.nodes : [];
  const alertNode     = nodes.find(n =>
    n.type === 'alert' || n.type === 'alertNode' ||
    n.type === 'action' || n.type === 'actionNode' ||
    n.type === 'email' || n.type === 'emailNode'
  );
  const conditionNode = nodes.find(n => n.type === 'condition' || n.type === 'conditionNode');
  const alertAction   = alertNode?.data?.action   || 'NOTIFICATION';
  const alertSeverity = alertNode?.data?.severity || 'HIGH';
  const condData      = conditionNode?.data || null;
  const msg           = generateAlertMessage(sensorId, telemetry, condData);
  return processExecutionResult({
    ruleId, ruleName: rule.name || 'Unnamed Rule', sensorId,
    field:     condData?.field    ?? null,
    operator:  condData?.operator ?? null,
    threshold: condData?.value    ?? null,
    value:     condData?.field    ? (telemetry[condData.field] ?? null) : null,
    action: alertAction, severity: alertSeverity, message: msg,
    timestamp:      telemetry.timestamp ? new Date(telemetry.timestamp).toISOString() : new Date().toISOString(),
    conditionState: 'TRIGGERED',
  });
}

async function getAllAlerts()        { return Alert.find().sort({ timestamp: -1 }); }
async function getAlertById(id)     { return Alert.findById(id); }
async function markAlertAsRead(id)  { return Alert.findByIdAndUpdate(id, { status: 'read' }, { returnDocument: 'after' }); }

function _resetCooldownMap()        { cooldownMap.clear(); }
function _resetConditionStateMap()  { conditionStateMap.clear(); }
function _getCooldownMs()           { return COOLDOWN_MS; }

module.exports = {
  processExecutionResult, processRuleTrigger,
  getAllAlerts, getAlertById, markAlertAsRead,
  generateAlertMessage,
  isInCooldown, recordCooldown, clearCooldown, getConditionState, setConditionState,
  _resetCooldownMap, _resetConditionStateMap, _getCooldownMs,
  COOLDOWN_MS,
};
