/**
 * executionResultTest.js
 *
 * Full test suite covering Steps 1–11.
 *
 * Step  1  — buildExecutionResult() produces canonical RuleExecutionResult
 * Step  2  — processExecutionResult() saves alert (mock) and returns doc
 * Step  3  — Severity read from alert node (never hardcoded)
 * Step  4  — generateMessage() produces meaningful messages, never generic
 * Step  5  — Socket.IO payload shape (alert:new event object)
 * Step  6  — Cooldown suppresses repeated triggers; resets after window
 * Step  7  — State machine: NORMAL → TRIGGERED → NORMAL recovery
 * Step  8  — Multiple rules fire independently (temp, pressure, rpm)
 * Step  9  — Multiple sensors: each rule processes only its own sensor
 * Step 10  — Compile errors isolated per-rule; others keep running
 * Step 11  — reloadRule() replaces stale pipeline with updated graph
 *
 * Run:  node engine/tests/executionResultTest.js
 */

'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// Assertion helpers
// ─────────────────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, message) {
  if (condition) { console.log(`  ✅  ${message}`); passed++; }
  else           { console.log(`  ❌  ${message}`); failed++; failures.push(message); }
}
function assertEqual(actual, expected, message) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { console.log(`  ✅  ${message}`); passed++; }
  else {
    console.log(`  ❌  ${message}`);
    console.log(`       expected: ${JSON.stringify(expected)}`);
    console.log(`       actual:   ${JSON.stringify(actual)}`);
    failed++; failures.push(message);
  }
}
function section(title) {
  console.log(`\n── ${title} ${'─'.repeat(Math.max(0, 60 - title.length))}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// All tests run inside an async IIFE so we can await properly
// ─────────────────────────────────────────────────────────────────────────────

(async () => {

// ── Imports ───────────────────────────────────────────────────────────────────

const { Subject } = require('rxjs');

const {
  buildExecutionResult,
  buildRecoveryResult,
  generateMessage,
  normaliseSeverity,
  operatorToText,
  CONDITION_STATE,
  VALID_SEVERITIES,
} = require('../executionResult');

const {
  processExecutionResult,
  isInCooldown,
  clearCooldown,
  getConditionState,
  _resetCooldownMap,
  _resetConditionStateMap,
  _getCooldownMs,
} = require('../../services/alertService');

// Swap live telemetry$ for a test Subject BEFORE requiring ruleRuntime
const telemetryStreamModule = require('../../compiler/telemetryStream');
const testStream  = new Subject();
const _origSubject = telemetryStreamModule.telemetry$;
Object.defineProperty(telemetryStreamModule, 'telemetry$', {
  get: () => testStream, configurable: true,
});

const {
  activeRules,
  STATUS,
  loadRule,
  startRule,
  stopRule,
  reloadRule,
  deactivateAll,
  getStatus,
  getRuleStatus,
} = require('../ruleRuntime');

// ── Mock Alert.create (no MongoDB needed) ────────────────────────────────────

const Alert = require('../../models/Alert');
const savedAlerts = [];
Alert.create = async (data) => {
  const doc = { _id: `mock-alert-${Date.now()}`, ...data };
  savedAlerts.push(doc);
  return doc;
};

// ── Mock Socket.IO (capture emitted events) ───────────────────────────────────

const emittedEvents = [];
const telemetrySocket = require('../../websocket/telemetrySocket');
telemetrySocket.getIo = () => ({
  emit: (event, payload) => emittedEvents.push({ event, payload }),
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function resetAlertState() {
  _resetCooldownMap();
  _resetConditionStateMap();
  savedAlerts.length = 0;
  emittedEvents.length = 0;
}

function cleanRegistry() {
  deactivateAll();
  activeRules.clear();
}

// ── Rule fixtures ─────────────────────────────────────────────────────────────

const RULE_TEMP = {
  _id: 'rule-temp-001', name: 'High Temperature Alert', isActive: true,
  nodes: [
    { id: 's1', type: 'sensor',    data: { sensorId: 'TURBINE-001', field: 'temperature' } },
    { id: 'c1', type: 'condition', data: { field: 'temperature', operator: '>', value: 80 } },
    { id: 'a1', type: 'alert',     data: { action: 'SMS', severity: 'HIGH' } },
  ],
  edges: [{ source: 's1', target: 'c1' }, { source: 'c1', target: 'a1' }],
};

const RULE_PRESSURE = {
  _id: 'rule-pressure-002', name: 'High Pressure Alert', isActive: true,
  nodes: [
    { id: 's1', type: 'sensor',    data: { sensorId: 'TURBINE-002', field: 'pressure' } },
    { id: 'c1', type: 'condition', data: { field: 'pressure', operator: '>', value: 120 } },
    { id: 'a1', type: 'alert',     data: { action: 'EMAIL', severity: 'MEDIUM' } },
  ],
  edges: [{ source: 's1', target: 'c1' }, { source: 'c1', target: 'a1' }],
};

const RULE_RPM = {
  _id: 'rule-rpm-003', name: 'Low RPM Alert', isActive: true,
  nodes: [
    { id: 's1', type: 'sensor',    data: { sensorId: 'TURBINE-001', field: 'rpm' } },
    { id: 'c1', type: 'condition', data: { field: 'rpm', operator: '<', value: 1000 } },
    { id: 'a1', type: 'alert',     data: { action: 'NOTIFICATION', severity: 'LOW' } },
  ],
  edges: [{ source: 's1', target: 'c1' }, { source: 'c1', target: 'a1' }],
};

const RULE_INVALID = {
  _id: 'rule-invalid-099', name: 'Bad Rule', isActive: true,
  nodes: [
    { id: 's1', type: 'sensor',  data: {} },
    { id: 'x1', type: 'webhook', data: {} }, // unknown type
  ],
  edges: [{ source: 's1', target: 'x1' }],
};

// Mock pipeline result (what compiled.run onMatch receives)
function mockPipelineResult(overrides = {}) {
  return {
    matched: true,
    ruleId:  'rule-temp-001',
    ruleName:'High Temperature Alert',
    sensorId:'TURBINE-001',
    stoppedAt: null, reason: null,
    context: {
      matchedField: 'temperature', conditionMet: true,
      alertAction: 'SMS', alertSeverity: 'HIGH',
    },
    outputs: [
      { nodeId: 's1', type: 'sensor',    output: { sensorId: 'TURBINE-001' } },
      { nodeId: 'c1', type: 'condition', output: { field: 'temperature', operator: '>', threshold: 80, actual: 85 } },
      { nodeId: 'a1', type: 'alert',     output: { action: 'SMS', severity: 'HIGH' } },
    ],
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 1 — buildExecutionResult() shape
// ─────────────────────────────────────────────────────────────────────────────

section('Step 1: buildExecutionResult() — canonical RuleExecutionResult');
{
  const result = buildExecutionResult(mockPipelineResult(), RULE_TEMP);

  assert(typeof result.ruleId    === 'string', 'ruleId is a string');
  assert(typeof result.ruleName  === 'string', 'ruleName is a string');
  assert(typeof result.sensorId  === 'string', 'sensorId is a string');
  assert(typeof result.field     === 'string', 'field is a string');
  assert(typeof result.operator  === 'string', 'operator is a string');
  assert(typeof result.threshold === 'number', 'threshold is a number');
  assert(typeof result.value     === 'number', 'value is a number (actual reading)');
  assert(typeof result.action    === 'string', 'action is a string');
  assert(typeof result.severity  === 'string', 'severity is a string');
  assert(typeof result.message   === 'string', 'message is a string');
  assert(typeof result.timestamp === 'string', 'timestamp is a string');
  assert(!isNaN(Date.parse(result.timestamp)), 'timestamp is valid ISO-8601');
  assertEqual(result.conditionState, CONDITION_STATE.TRIGGERED, 'conditionState = TRIGGERED');
  assertEqual(result.ruleId,    'rule-temp-001',          'ruleId correct');
  assertEqual(result.ruleName,  'High Temperature Alert', 'ruleName correct');
  assertEqual(result.sensorId,  'TURBINE-001',            'sensorId correct');
  assertEqual(result.field,     'temperature',            'field correct');
  assertEqual(result.operator,  '>',                      'operator correct');
  assertEqual(result.threshold, 80,                       'threshold correct');
  assertEqual(result.value,     85,                       'value = actual reading 85');
  assertEqual(result.action,    'SMS',                    'action from alert node');
  assertEqual(result.severity,  'HIGH',                   'severity from alert node');
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 2 — processExecutionResult() saves alert
// ─────────────────────────────────────────────────────────────────────────────

section('Step 2: processExecutionResult() — saves to MongoDB (mock)');
{
  resetAlertState();
  const execResult = buildExecutionResult(mockPipelineResult(), RULE_TEMP);
  const alertDoc   = await processExecutionResult(execResult);

  assert(alertDoc !== null,                  'Alert doc returned (not suppressed)');
  assert(savedAlerts.length === 1,           'One alert saved to DB');
  assertEqual(savedAlerts[0].ruleId,   'rule-temp-001',          'alertDoc.ruleId correct');
  assertEqual(savedAlerts[0].ruleName, 'High Temperature Alert', 'alertDoc.ruleName correct');
  assertEqual(savedAlerts[0].sensorId, 'TURBINE-001',            'alertDoc.sensorId correct');
  assertEqual(savedAlerts[0].severity, 'HIGH',                   'alertDoc.severity correct');
  assertEqual(savedAlerts[0].action,   'SMS',                    'alertDoc.action correct');
  assertEqual(savedAlerts[0].status,   'unread',                 'alertDoc.status = unread');
  assert(typeof savedAlerts[0].message === 'string' &&
         savedAlerts[0].message.length > 0,                      'alertDoc.message non-empty');
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 3 — Severity from rule graph, never hardcoded
// ─────────────────────────────────────────────────────────────────────────────

section('Step 3: Severity mapping — read from alert node, never hardcoded');
{
  assertEqual(normaliseSeverity('HIGH'),     'HIGH',     'HIGH normalised');
  assertEqual(normaliseSeverity('MEDIUM'),   'MEDIUM',   'MEDIUM normalised');
  assertEqual(normaliseSeverity('LOW'),      'LOW',      'LOW normalised');
  assertEqual(normaliseSeverity('CRITICAL'), 'CRITICAL', 'CRITICAL normalised');
  assertEqual(normaliseSeverity('high'),     'HIGH',     'lowercase "high" → HIGH');
  assertEqual(normaliseSeverity('medium'),   'MEDIUM',   'lowercase "medium" → MEDIUM');
  assertEqual(normaliseSeverity('URGENT'),   'HIGH',     'unknown severity defaults to HIGH');
  assertEqual(normaliseSeverity(undefined),  'HIGH',     'undefined defaults to HIGH');
  assertEqual(normaliseSeverity(''),         'HIGH',     'empty string defaults to HIGH');

  const lowResult = buildExecutionResult(
    mockPipelineResult({
      outputs: [
        { nodeId: 's1', type: 'sensor',    output: { sensorId: 'TURBINE-001' } },
        { nodeId: 'c1', type: 'condition', output: { field: 'temperature', operator: '>', threshold: 80, actual: 85 } },
        { nodeId: 'a1', type: 'alert',     output: { action: 'EMAIL', severity: 'LOW' } },
      ],
    }),
    RULE_TEMP
  );
  assertEqual(lowResult.severity, 'LOW',   'Severity LOW read from alert node');
  assertEqual(lowResult.action,   'EMAIL', 'Action EMAIL read from alert node');

  const critResult = buildExecutionResult(
    mockPipelineResult({
      outputs: [
        { nodeId: 's1', type: 'sensor',    output: { sensorId: 'TURBINE-001' } },
        { nodeId: 'c1', type: 'condition', output: { field: 'temperature', operator: '>', threshold: 80, actual: 85 } },
        { nodeId: 'a1', type: 'alert',     output: { action: 'SMS', severity: 'CRITICAL' } },
      ],
    }),
    RULE_TEMP
  );
  assertEqual(critResult.severity, 'CRITICAL', 'Severity CRITICAL read from alert node');
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 4 — Meaningful alert messages
// ─────────────────────────────────────────────────────────────────────────────

section('Step 4: generateMessage() — meaningful, never generic');
{
  const msg = generateMessage('High Temperature Alert', 'TURBINE-001', 'temperature', '>', 80, 85);
  assert(msg.includes('High Temperature Alert'),       'Message includes rule name');
  assert(msg.includes('TURBINE-001'),                  'Message includes sensor ID');
  assert(msg.includes('temperature'),                  'Message includes field name');
  assert(msg.includes('80'),                           'Message includes threshold');
  assert(msg.includes('85'),                           'Message includes actual value');
  assert(!msg.toLowerCase().includes('rule triggered'), 'Message is NOT generic "rule triggered"');

  const ops = [
    ['>', 'exceeded'],
    ['>=', 'met or exceeded'],
    ['<', 'dropped below'],
    ['<=', 'met or dropped below'],
    ['==', 'equalled'],
    ['!=', 'changed from'],
  ];
  for (const [op, verb] of ops) {
    const m = generateMessage('Test', 'S-001', 'pressure', op, 100, 105);
    assert(m.includes(verb), `Operator "${op}" → verb "${verb}" in message`);
  }

  const result = buildExecutionResult(mockPipelineResult(), RULE_TEMP);
  assert(result.message.length > 20,                          'message is substantive (>20 chars)');
  assert(!result.message.toLowerCase().includes('rule triggered'), 'message is not generic');
  assert(result.message.includes('TURBINE-001'),               'message includes sensorId');
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 5 — Socket.IO payload shape
// ─────────────────────────────────────────────────────────────────────────────

section('Step 5: Socket.IO unified payload shape');
{
  resetAlertState();
  const execResult = buildExecutionResult(mockPipelineResult(), RULE_TEMP);
  await processExecutionResult(execResult);

  const alertNew      = emittedEvents.find(e => e.event === 'alert:new');
  const ruleTriggered = emittedEvents.find(e => e.event === 'rule:triggered');

  assert(alertNew      !== undefined, 'alert:new event emitted');
  assert(ruleTriggered !== undefined, 'rule:triggered event emitted');

  // alert:new unified payload (Step 5 contract)
  const p = alertNew.payload;
  assert('alertId'   in p, 'alert:new has alertId');
  assert('ruleId'    in p, 'alert:new has ruleId');
  assert('ruleName'  in p, 'alert:new has ruleName');
  assert('sensorId'  in p, 'alert:new has sensorId');
  assert('severity'  in p, 'alert:new has severity');
  assert('action'    in p, 'alert:new has action');
  assert('message'   in p, 'alert:new has message');
  assert('value'     in p, 'alert:new has value');
  assert('field'     in p, 'alert:new has field');
  assert('operator'  in p, 'alert:new has operator');
  assert('threshold' in p, 'alert:new has threshold');
  assert('timestamp' in p, 'alert:new has timestamp');

  assertEqual(p.ruleId,    'rule-temp-001',          'alert:new ruleId correct');
  assertEqual(p.ruleName,  'High Temperature Alert', 'alert:new ruleName correct');
  assertEqual(p.sensorId,  'TURBINE-001',            'alert:new sensorId correct');
  assertEqual(p.severity,  'HIGH',                   'alert:new severity correct');
  assertEqual(p.value,     85,                       'alert:new value = 85');
  assertEqual(p.field,     'temperature',            'alert:new field correct');
  assertEqual(p.operator,  '>',                      'alert:new operator correct');
  assertEqual(p.threshold, 80,                       'alert:new threshold correct');
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 6 — Cooldown
// ─────────────────────────────────────────────────────────────────────────────

section('Step 6: Cooldown — suppresses repeated triggers');
{
  resetAlertState();
  const execResult = buildExecutionResult(mockPipelineResult(), RULE_TEMP);

  const first  = await processExecutionResult({ ...execResult });
  const second = await processExecutionResult({ ...execResult });
  const third  = await processExecutionResult({ ...execResult });

  assert(first  !== null,          'First trigger creates alert');
  assert(second === null,          'Second trigger suppressed (cooldown active)');
  assert(third  === null,          'Third trigger suppressed (cooldown active)');
  assertEqual(savedAlerts.length, 1, 'Only 1 alert saved during cooldown');

  assert(isInCooldown('rule-temp-001', 'TURBINE-001'),  'isInCooldown true during window');

  clearCooldown('rule-temp-001', 'TURBINE-001');
  assert(!isInCooldown('rule-temp-001', 'TURBINE-001'), 'isInCooldown false after clearCooldown');

  const afterExpiry = await processExecutionResult({ ...execResult });
  assert(afterExpiry !== null,       'Alert fires again after cooldown cleared');
  assertEqual(savedAlerts.length, 2, '2 alerts total after reset');

  const cooldownMs = _getCooldownMs();
  assert(typeof cooldownMs === 'number' && cooldownMs > 0, 'COOLDOWN_MS is positive number');
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 7 — State machine: NORMAL → TRIGGERED → NORMAL
// ─────────────────────────────────────────────────────────────────────────────

section('Step 7: State machine — NORMAL → TRIGGERED → NORMAL');
{
  resetAlertState();
  const ruleId = 'rule-temp-001', sensorId = 'TURBINE-001';

  assertEqual(getConditionState(ruleId, sensorId), 'NORMAL', 'Initial state = NORMAL');

  const triggered = buildExecutionResult(mockPipelineResult(), RULE_TEMP);
  await processExecutionResult(triggered);
  assertEqual(getConditionState(ruleId, sensorId), 'TRIGGERED', 'State → TRIGGERED after alert');

  const recovery = buildRecoveryResult(ruleId, 'High Temperature Alert', sensorId, 'temperature');
  assertEqual(recovery.conditionState, CONDITION_STATE.NORMAL, 'Recovery result conditionState = NORMAL');
  assert(recovery.message.includes('NORMAL'),   'Recovery message mentions NORMAL');
  assert(recovery.message.includes(sensorId),  'Recovery message includes sensorId');

  await processExecutionResult(recovery);
  assertEqual(getConditionState(ruleId, sensorId), 'NORMAL', 'State → NORMAL after recovery');
  assert(!isInCooldown(ruleId, sensorId),                     'Cooldown cleared after recovery');

  // After recovery, next trigger fires a new alert
  resetAlertState();
  const afterRecovery = await processExecutionResult({ ...triggered });
  assert(afterRecovery !== null, 'New alert fires after recovery (cooldown was cleared)');
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 8 — Multiple rules fire independently
// ─────────────────────────────────────────────────────────────────────────────

section('Step 8: Multiple rules — temp > 80, pressure > 120, rpm < 1000');
{
  cleanRegistry();
  const { compileRule } = require('../../compiler/ruleCompiler');
  const matchesT = [], matchesP = [], matchesR = [];

  const sT = compileRule(RULE_TEMP).run(testStream,     r => matchesT.push(r));
  const sP = compileRule(RULE_PRESSURE).run(testStream, r => matchesP.push(r));
  const sR = compileRule(RULE_RPM).run(testStream,      r => matchesR.push(r));

  // temperature=85 (Rule 1 fires), pressure=125 (Rule 2 fires), rpm=1800 (Rule 3 does NOT)
  testStream.next({ sensorId: 'TURBINE-001', temperature: 85, rpm: 1800 });
  testStream.next({ sensorId: 'TURBINE-002', pressure: 125 });

  sT.unsubscribe(); sP.unsubscribe(); sR.unsubscribe();

  assertEqual(matchesT.length, 1, 'Rule 1 (temp > 80): 1 match');
  assertEqual(matchesP.length, 1, 'Rule 2 (pressure > 120): 1 match');
  assertEqual(matchesR.length, 0, 'Rule 3 (rpm < 1000): 0 matches — rpm=1800 above threshold');
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 9 — Multiple sensors
// ─────────────────────────────────────────────────────────────────────────────

section('Step 9: Multiple sensors — rule processes only its configured sensor');
{
  const { compileRule } = require('../../compiler/ruleCompiler');
  const RULE_T2 = {
    _id: 'rule-t2', name: 'TURBINE-002 Temp Alert', isActive: true,
    nodes: [
      { id: 's1', type: 'sensor',    data: { sensorId: 'TURBINE-002', field: 'temperature' } },
      { id: 'c1', type: 'condition', data: { field: 'temperature', operator: '>', value: 90 } },
      { id: 'a1', type: 'alert',     data: { action: 'SMS', severity: 'HIGH' } },
    ],
    edges: [{ source: 's1', target: 'c1' }, { source: 'c1', target: 'a1' }],
  };

  const matchesT1 = [], matchesT2 = [];
  const sA = compileRule(RULE_TEMP).run(testStream, r => matchesT1.push(r));
  const sB = compileRule(RULE_T2).run(testStream,   r => matchesT2.push(r));

  testStream.next({ sensorId: 'TURBINE-001', temperature: 85 }); // Rule A fires
  testStream.next({ sensorId: 'TURBINE-002', temperature: 95 }); // Rule B fires
  testStream.next({ sensorId: 'TURBINE-002', temperature: 85 }); // Neither (85 not >90 for T2)

  sA.unsubscribe(); sB.unsubscribe();

  assertEqual(matchesT1.length, 1, 'Rule A (TURBINE-001 temp>80): 1 match');
  assertEqual(matchesT2.length, 1, 'Rule B (TURBINE-002 temp>90): 1 match');
  assert(matchesT1[0].sensorId === 'TURBINE-001', 'Rule A match is TURBINE-001');
  assert(matchesT2[0].sensorId === 'TURBINE-002', 'Rule B match is TURBINE-002');

  const miss = compileRule(RULE_T2).runOnce({ sensorId: 'TURBINE-002', temperature: 85 });
  assert(miss.matched === false, 'TURBINE-002 temp=85 does NOT trigger Rule B (threshold 90)');
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 10 — Compile errors isolated
// ─────────────────────────────────────────────────────────────────────────────

section('Step 10: Compile errors isolated — other rules keep running');
{
  cleanRegistry();

  const r1   = loadRule(RULE_TEMP);
  const rBad = loadRule(RULE_INVALID);
  const r3   = loadRule(RULE_RPM);

  assert(r1.ok   === true,  'Rule 1 (valid) loads ok');
  assert(rBad.ok === false, 'RULE_INVALID fails compilation');
  assert(typeof rBad.reason === 'string' && rBad.reason.length > 0, 'Failure reason recorded');
  assert(r3.ok   === true,  'Rule 3 (valid) loads ok despite Rule 2 failing');

  const started1   = startRule('rule-temp-001');
  const startedBad = startRule('rule-invalid-099');
  const started3   = startRule('rule-rpm-003');

  assert(started1   === true,  'Rule 1 starts successfully');
  assert(startedBad === false, 'Invalid rule cannot be started (no pipeline)');
  assert(started3   === true,  'Rule 3 starts successfully despite invalid rule');

  const all = getStatus();
  assertEqual(all.length, 3, 'getStatus() returns 3 entries (including failed)');

  const badEntry = all.find(s => s.ruleId === 'rule-invalid-099');
  assertEqual(badEntry.status, STATUS.STOPPED, 'Invalid rule status = STOPPED');
  assert(badEntry.loadError !== null,          'loadError populated for invalid rule');

  const r1Entry = all.find(s => s.ruleId === 'rule-temp-001');
  assertEqual(r1Entry.status, STATUS.RUNNING, 'Rule 1 status = RUNNING');
  assert(r1Entry.loadError === null,           'Rule 1 has no loadError');

  cleanRegistry();
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 11 — reloadRule() replaces stale pipeline
// ─────────────────────────────────────────────────────────────────────────────

section('Step 11: reloadRule() — stop old pipeline, compile new, start fresh');
{
  cleanRegistry();

  loadRule(RULE_TEMP);
  startRule('rule-temp-001');

  const oldSub = activeRules.get('rule-temp-001').subscription;
  assert(oldSub.closed === false, 'Old subscription open before reload');

  // Simulate edit: threshold 80 → 90, action SMS → EMAIL, severity HIGH → CRITICAL
  const updatedRule = {
    ...RULE_TEMP,
    nodes: [
      { id: 's1', type: 'sensor',    data: { sensorId: 'TURBINE-001', field: 'temperature' } },
      { id: 'c1', type: 'condition', data: { field: 'temperature', operator: '>', value: 90 } },
      { id: 'a1', type: 'alert',     data: { action: 'EMAIL', severity: 'CRITICAL' } },
    ],
  };

  const reloaded = reloadRule(updatedRule);
  assert(reloaded === true,           'reloadRule() returns true');
  assert(oldSub.closed === true,      'Old subscription closed after reload');

  const entry = activeRules.get('rule-temp-001');
  assertEqual(entry.status, STATUS.RUNNING, 'Rule is RUNNING after reload');
  assert(entry.subscription !== oldSub,      'New subscription is a different instance');
  assert(entry.subscription.closed === false,'New subscription is open');

  // Verify new threshold: 85 should NOT fire; 93 should
  const { compileRule } = require('../../compiler/ruleCompiler');
  const matchesAfter = [];
  const testSub = compileRule(updatedRule).run(testStream, r => matchesAfter.push(r));
  testStream.next({ sensorId: 'TURBINE-001', temperature: 85 }); // 85 ≤ 90 → no match
  testStream.next({ sensorId: 'TURBINE-001', temperature: 93 }); // 93 > 90 → match
  testSub.unsubscribe();

  assertEqual(matchesAfter.length, 1,                        'Only 93 fires after reload');
  assertEqual(matchesAfter[0].context.alertAction,    'EMAIL',    'Updated action = EMAIL');
  assertEqual(matchesAfter[0].context.alertSeverity, 'CRITICAL', 'Updated severity = CRITICAL');

  const status = getRuleStatus('rule-temp-001');
  assertEqual(status.status, STATUS.RUNNING, 'getRuleStatus = RUNNING');
  assert(status.executionOrder.length === 3, 'executionOrder has 3 nodes');

  cleanRegistry();
}

// ─────────────────────────────────────────────────────────────────────────────
// Bonus — operatorToText and VALID_SEVERITIES
// ─────────────────────────────────────────────────────────────────────────────

section('Bonus: operatorToText and VALID_SEVERITIES exports');
{
  assertEqual(operatorToText('>'),  'exceeded',               'operatorToText >');
  assertEqual(operatorToText('<'),  'dropped below',          'operatorToText <');
  assertEqual(operatorToText('>='), 'met or exceeded',        'operatorToText >=');
  assertEqual(operatorToText('<='), 'met or dropped below',   'operatorToText <=');
  assertEqual(operatorToText('=='), 'equalled',               'operatorToText ==');
  assertEqual(operatorToText('!='), 'changed from',           'operatorToText !=');
  assertEqual(operatorToText('??'), 'triggered threshold of', 'unknown operator fallback');

  assert(VALID_SEVERITIES.has('HIGH'),     'VALID_SEVERITIES has HIGH');
  assert(VALID_SEVERITIES.has('MEDIUM'),   'VALID_SEVERITIES has MEDIUM');
  assert(VALID_SEVERITIES.has('LOW'),      'VALID_SEVERITIES has LOW');
  assert(VALID_SEVERITIES.has('CRITICAL'), 'VALID_SEVERITIES has CRITICAL');
  assert(!VALID_SEVERITIES.has('URGENT'),  'VALID_SEVERITIES does NOT have URGENT');
}

// ─────────────────────────────────────────────────────────────────────────────
// Restore original Subject
// ─────────────────────────────────────────────────────────────────────────────

Object.defineProperty(telemetryStreamModule, 'telemetry$', {
  get: () => _origSubject, configurable: true,
});

// ─────────────────────────────────────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n' + '═'.repeat(64));
console.log(`  Results: ${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  console.log('\n  Failed tests:');
  failures.forEach(f => console.log(`    ✗ ${f}`));
}
console.log('═'.repeat(64));
if (failed > 0) process.exit(1);

})(); // end async IIFE
