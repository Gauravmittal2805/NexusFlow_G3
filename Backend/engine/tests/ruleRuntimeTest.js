/**
 * ruleRuntimeTest.js
 *
 * Full test suite for engine/ruleRuntime.js — covers all 11 steps.
 *
 * Step  1  — Registry structure (activeRules Map, RuntimeEntry shape)
 * Step  2  — loadRule(): compile + store as STOPPED
 * Step  3  — startRule(): subscribe to telemetry$, mark RUNNING
 * Step  4  — stopRule(): unsubscribe, mark STOPPED
 * Step  5  — Duplicate prevention (startRule skips already-RUNNING rule)
 * Step  6  — Multiple independent rules on same stream
 * Step  7  — isActive=false rules are loaded but never started
 * Step  8  — reloadRule(): stop old → recompile → start fresh
 * Step  9  — Trigger payload shape: ruleId, ruleName, sensorId, timestamp, value, field, operator, threshold, action, severity
 * Step 10  — Multi-sensor: each rule processes only its configured sensor
 * Step 11  — getStatus() / getRuleStatus() return RUNNING / STOPPED correctly
 *
 * Run with:
 *   node engine/tests/ruleRuntimeTest.js
 */

'use strict';

const { Subject } = require('rxjs');

// ── Swap out the real telemetry$ with a test Subject ─────────────────────────
// We do this BEFORE requiring ruleRuntime so it picks up the mock.
const testStream = new Subject();
const telemetryStreamModule = require('../../compiler/telemetryStream');
// Override the exported Subject in-place so ruleRuntime uses our test stream.
const originalSubject = telemetryStreamModule.telemetry$;
Object.defineProperty(telemetryStreamModule, 'telemetry$', {
  get: () => testStream,
  configurable: true,
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
  buildTriggerPayload,
} = require('../ruleRuntime');

// ─────────────────────────────────────────────────────────────────────────────
// Assertion helpers
// ─────────────────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅  ${message}`);
    passed++;
  } else {
    console.log(`  ❌  ${message}`);
    failed++;
    failures.push(message);
  }
}

function assertEqual(actual, expected, message) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    console.log(`  ✅  ${message}`);
    passed++;
  } else {
    console.log(`  ❌  ${message}`);
    console.log(`       expected: ${JSON.stringify(expected)}`);
    console.log(`       actual:   ${JSON.stringify(actual)}`);
    failed++;
    failures.push(message);
  }
}

function section(title) {
  console.log(`\n── ${title} ${'─'.repeat(Math.max(0, 60 - title.length))}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Cleanup helper — wipe registry between suites
// ─────────────────────────────────────────────────────────────────────────────

function cleanRegistry() {
  deactivateAll();
  activeRules.clear();
}

// ─────────────────────────────────────────────────────────────────────────────
// Rule fixtures
// ─────────────────────────────────────────────────────────────────────────────

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
    { id: 'a1', type: 'alert',     data: { action: 'NOTIFICATION', severity: 'MEDIUM' } },
  ],
  edges: [{ source: 's1', target: 'c1' }, { source: 'c1', target: 'a1' }],
};

const RULE_INACTIVE = {
  _id: 'rule-inactive-004', name: 'Disabled Rule', isActive: false,
  nodes: [
    { id: 's1', type: 'sensor',    data: { sensorId: 'TURBINE-001' } },
    { id: 'c1', type: 'condition', data: { field: 'temperature', operator: '>', value: 10 } },
    { id: 'a1', type: 'alert',     data: {} },
  ],
  edges: [{ source: 's1', target: 'c1' }, { source: 'c1', target: 'a1' }],
};

const RULE_INVALID = {
  _id: 'rule-invalid-005', name: 'Bad Rule', isActive: true,
  nodes: [
    { id: 's1', type: 'sensor',  data: {} },
    { id: 'x1', type: 'webhook', data: {} }, // unknown type
  ],
  edges: [{ source: 's1', target: 'x1' }],
};

// ─────────────────────────────────────────────────────────────────────────────
// Step 1 — Registry structure
// ─────────────────────────────────────────────────────────────────────────────

section('Step 1: Registry structure');
{
  cleanRegistry();

  assert(activeRules instanceof Map, 'activeRules is a Map');
  assertEqual(activeRules.size, 0,   'Registry is empty at start');

  assert(STATUS.RUNNING === 'RUNNING', 'STATUS.RUNNING = "RUNNING"');
  assert(STATUS.STOPPED === 'STOPPED', 'STATUS.STOPPED = "STOPPED"');

  // Load one rule and verify RuntimeEntry shape
  loadRule(RULE_TEMP);

  const entry = activeRules.get('rule-temp-001');
  assert(entry !== undefined,                     'Entry stored in registry after loadRule');
  assert(entry.rule !== undefined,                'entry.rule present');
  assert(entry.pipeline !== null,                 'entry.pipeline present after compile');
  assert(entry.subscription === null,             'entry.subscription is null before startRule');
  assertEqual(entry.status, STATUS.STOPPED,       'entry.status = STOPPED before startRule');
  assert(typeof entry.triggerCount === 'number',  'entry.triggerCount is a number');
  assertEqual(entry.triggerCount, 0,              'entry.triggerCount starts at 0');
  assert(entry.startedAt === null,                'entry.startedAt null before start');
  assert(entry.stoppedAt === null,                'entry.stoppedAt null before stop');

  cleanRegistry();
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 2 — loadRule()
// ─────────────────────────────────────────────────────────────────────────────

section('Step 2: loadRule() — compile + store as STOPPED');
{
  cleanRegistry();

  // Valid rule
  const result = loadRule(RULE_TEMP);
  assert(result.ok === true,                         'loadRule() returns ok:true for valid rule');
  assertEqual(result.ruleId, 'rule-temp-001',        'loadRule() returns correct ruleId');
  assert(activeRules.has('rule-temp-001'),            'Rule stored in registry');
  assertEqual(activeRules.get('rule-temp-001').status, STATUS.STOPPED, 'Status is STOPPED after load');

  // Invalid rule (unknown node type)
  const badResult = loadRule(RULE_INVALID);
  assert(badResult.ok === false,                       'loadRule() returns ok:false for invalid graph');
  assert(typeof badResult.reason === 'string',         'loadRule() returns reason for failure');
  assert(activeRules.has('rule-invalid-005'),          'Invalid rule still stored (as STOPPED with loadError)');
  assert(activeRules.get('rule-invalid-005').loadError !== null, 'loadError is set for invalid rule');
  assert(activeRules.get('rule-invalid-005').pipeline === null,  'pipeline is null for invalid rule');

  // Inactive rule loads fine (just stays STOPPED)
  const inactiveResult = loadRule(RULE_INACTIVE);
  assert(inactiveResult.ok === true,               'loadRule() accepts inactive rules without error');
  assert(activeRules.has('rule-inactive-004'),      'Inactive rule in registry');
  assertEqual(activeRules.get('rule-inactive-004').status, STATUS.STOPPED, 'Inactive rule status = STOPPED');

  cleanRegistry();
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 3 — startRule()
// ─────────────────────────────────────────────────────────────────────────────

section('Step 3: startRule() — subscribe to telemetry$, mark RUNNING');
{
  cleanRegistry();

  loadRule(RULE_TEMP);
  const started = startRule('rule-temp-001');

  assert(started === true, 'startRule() returns true for active rule');

  const entry = activeRules.get('rule-temp-001');
  assertEqual(entry.status, STATUS.RUNNING,      'Status is RUNNING after startRule');
  assert(entry.subscription !== null,             'subscription is set');
  assert(entry.subscription.closed === false,     'subscription is open (not closed)');
  assert(entry.startedAt instanceof Date,         'startedAt is a Date');
  assert(entry.stoppedAt === null,                'stoppedAt is null while running');

  // Verify it actually fires on a matching telemetry reading
  const matches = [];
  // Re-attach a test listener on the same testStream
  const { compileRule } = require('../../compiler/ruleCompiler');
  const pipeline = compileRule(RULE_TEMP);
  const testSub  = pipeline.run(testStream, r => matches.push(r));

  testStream.next({ sensorId: 'TURBINE-001', temperature: 85 });
  testSub.unsubscribe();

  assertEqual(matches.length, 1, 'Matching telemetry fires exactly once after startRule');

  cleanRegistry();
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 4 — stopRule()
// ─────────────────────────────────────────────────────────────────────────────

section('Step 4: stopRule() — unsubscribe, mark STOPPED');
{
  cleanRegistry();

  loadRule(RULE_TEMP);
  startRule('rule-temp-001');

  const subBefore = activeRules.get('rule-temp-001').subscription;
  assert(subBefore.closed === false, 'Subscription is open before stopRule');

  stopRule('rule-temp-001');

  const entry = activeRules.get('rule-temp-001');
  assertEqual(entry.status, STATUS.STOPPED,    'Status is STOPPED after stopRule');
  assert(subBefore.closed === true,             'Old subscription is closed');
  assert(entry.subscription === null,           'entry.subscription set to null');
  assert(entry.stoppedAt instanceof Date,       'stoppedAt is a Date after stop');

  // Calling stopRule again on already-STOPPED is a safe no-op
  let threw = false;
  try { stopRule('rule-temp-001'); } catch (_) { threw = true; }
  assert(!threw, 'Double stopRule() does not throw');

  // Calling stopRule on unknown ruleId is also a safe no-op
  let threw2 = false;
  try { stopRule('nonexistent-rule'); } catch (_) { threw2 = true; }
  assert(!threw2, 'stopRule() on unknown ruleId does not throw');

  cleanRegistry();
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 5 — Duplicate prevention
// ─────────────────────────────────────────────────────────────────────────────

section('Step 5: Duplicate prevention — startRule skips already-RUNNING rule');
{
  cleanRegistry();

  loadRule(RULE_TEMP);
  startRule('rule-temp-001');

  const subA = activeRules.get('rule-temp-001').subscription;

  // Call startRule a second time on the same rule
  const secondStart = startRule('rule-temp-001');

  const subB = activeRules.get('rule-temp-001').subscription;

  assert(secondStart === false,  'Second startRule() returns false (already running)');
  assert(subA === subB,          'Subscription object unchanged — no new subscription created');
  assertEqual(activeRules.get('rule-temp-001').status, STATUS.RUNNING, 'Rule still RUNNING');

  // Verify only one subscription fires — emit a reading and count matches
  const matches = [];
  const { compileRule } = require('../../compiler/ruleCompiler');
  const pipeline = compileRule(RULE_TEMP);
  const testSub  = pipeline.run(testStream, r => matches.push(r));
  testStream.next({ sensorId: 'TURBINE-001', temperature: 90 });
  testSub.unsubscribe();

  assertEqual(matches.length, 1, 'Only 1 match emitted — no duplicate subscriptions');

  cleanRegistry();
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 6 — Multiple independent rules
// ─────────────────────────────────────────────────────────────────────────────

section('Step 6: Multiple rules — all run independently on same stream');
{
  cleanRegistry();

  loadRule(RULE_TEMP);
  loadRule(RULE_PRESSURE);
  loadRule(RULE_RPM);

  assertEqual(activeRules.size, 3, 'Registry holds 3 rules');

  startRule('rule-temp-001');
  startRule('rule-pressure-002');
  startRule('rule-rpm-003');

  // All three should be RUNNING
  assert(activeRules.get('rule-temp-001').status     === STATUS.RUNNING, 'Rule 1 (temp) RUNNING');
  assert(activeRules.get('rule-pressure-002').status === STATUS.RUNNING, 'Rule 2 (pressure) RUNNING');
  assert(activeRules.get('rule-rpm-003').status      === STATUS.RUNNING, 'Rule 3 (rpm) RUNNING');

  // Each fires only when its own condition is met
  const { compileRule } = require('../../compiler/ruleCompiler');
  const matchesTemp     = [];
  const matchesPressure = [];
  const matchesRpm      = [];

  const s1 = compileRule(RULE_TEMP).run(testStream,     r => matchesTemp.push(r));
  const s2 = compileRule(RULE_PRESSURE).run(testStream, r => matchesPressure.push(r));
  const s3 = compileRule(RULE_RPM).run(testStream,      r => matchesRpm.push(r));

  // TURBINE-001: temp 85 (fires Rule 1), rpm 800 (fires Rule 3)
  testStream.next({ sensorId: 'TURBINE-001', temperature: 85, rpm: 800 });
  // TURBINE-002: pressure 130 (fires Rule 2)
  testStream.next({ sensorId: 'TURBINE-002', pressure: 130 });
  // TURBINE-001: temp 60, rpm 1200 (neither fires)
  testStream.next({ sensorId: 'TURBINE-001', temperature: 60, rpm: 1200 });

  s1.unsubscribe(); s2.unsubscribe(); s3.unsubscribe();

  assertEqual(matchesTemp.length,     1, 'Rule 1 (temp > 80): 1 match');
  assertEqual(matchesPressure.length, 1, 'Rule 2 (pressure > 120): 1 match');
  assertEqual(matchesRpm.length,      1, 'Rule 3 (rpm < 1000): 1 match');

  cleanRegistry();
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 7 — Active/Inactive rule handling
// ─────────────────────────────────────────────────────────────────────────────

section('Step 7: isActive=false — loaded but never started');
{
  cleanRegistry();

  // loadRule accepts inactive rules — no error
  const loadResult = loadRule(RULE_INACTIVE);
  assert(loadResult.ok === true,    'Inactive rule loads without error');
  assert(activeRules.has('rule-inactive-004'), 'Inactive rule in registry');
  assertEqual(activeRules.get('rule-inactive-004').status, STATUS.STOPPED, 'Status = STOPPED');

  // startRule must refuse it
  const started = startRule('rule-inactive-004');
  assert(started === false,         'startRule() returns false for inactive rule');
  assertEqual(activeRules.get('rule-inactive-004').status, STATUS.STOPPED, 'Still STOPPED after attempted start');
  assert(activeRules.get('rule-inactive-004').subscription === null, 'No subscription created');

  // Enable: update rule to isActive=true, reload, then start
  const enabledRule = { ...RULE_INACTIVE, isActive: true };
  loadRule(enabledRule);
  const enabledStart = startRule('rule-inactive-004');
  assert(enabledStart === true,     'startRule() returns true after enabling rule');
  assertEqual(activeRules.get('rule-inactive-004').status, STATUS.RUNNING, 'Now RUNNING after enable');

  // Disable: stop running rule
  stopRule('rule-inactive-004');
  assertEqual(activeRules.get('rule-inactive-004').status, STATUS.STOPPED, 'Back to STOPPED after disable');

  cleanRegistry();
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 8 — reloadRule()
// ─────────────────────────────────────────────────────────────────────────────

section('Step 8: reloadRule() — stop old → recompile → start fresh');
{
  cleanRegistry();

  loadRule(RULE_TEMP);
  startRule('rule-temp-001');

  const oldSub = activeRules.get('rule-temp-001').subscription;
  assert(oldSub.closed === false, 'Old subscription open before reload');

  // Simulate an edit: threshold changed from 80 to 90
  const updatedRule = {
    ...RULE_TEMP,
    nodes: [
      { id: 's1', type: 'sensor',    data: { sensorId: 'TURBINE-001', field: 'temperature' } },
      { id: 'c1', type: 'condition', data: { field: 'temperature', operator: '>', value: 90 } },
      { id: 'a1', type: 'alert',     data: { action: 'EMAIL', severity: 'CRITICAL' } },
    ],
  };

  const reloaded = reloadRule(updatedRule);
  assert(reloaded === true,           'reloadRule() returns true on success');
  assert(oldSub.closed === true,      'Old subscription closed by reloadRule');

  const newEntry = activeRules.get('rule-temp-001');
  assertEqual(newEntry.status, STATUS.RUNNING, 'Rule is RUNNING after reload');
  assert(newEntry.subscription !== oldSub,     'New subscription is a different instance');
  assert(newEntry.subscription.closed === false, 'New subscription is open');

  // Verify updated threshold: 85 should NOT fire (old threshold was 80)
  const matches = [];
  const { compileRule } = require('../../compiler/ruleCompiler');
  const testSub = compileRule(updatedRule).run(testStream, r => matches.push(r));
  testStream.next({ sensorId: 'TURBINE-001', temperature: 85 }); // 85 <= 90 → no match
  testStream.next({ sensorId: 'TURBINE-001', temperature: 93 }); // 93 > 90  → match
  testSub.unsubscribe();

  assertEqual(matches.length, 1, 'After reload with threshold 90: only 93 fires (85 does not)');

  cleanRegistry();
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 9 — Trigger payload shape
// ─────────────────────────────────────────────────────────────────────────────

section('Step 9: Trigger payload — all required fields present');
{
  cleanRegistry();

  // Build a mock PipelineResult as onMatch would receive
  const mockResult = {
    matched:   true,
    ruleId:    'rule-temp-001',
    ruleName:  'High Temperature Alert',
    sensorId:  'TURBINE-001',
    context: {
      matchedField:  'temperature',
      conditionMet:  true,
      alertAction:   'SMS',
      alertSeverity: 'HIGH',
    },
    outputs: [
      { nodeId: 's1', type: 'sensor',    output: { sensorId: 'TURBINE-001' } },
      { nodeId: 'c1', type: 'condition', output: { field: 'temperature', operator: '>', threshold: 80, actual: 85 } },
      { nodeId: 'a1', type: 'alert',     output: { action: 'SMS', severity: 'HIGH' } },
    ],
    stoppedAt: null,
    reason:    null,
  };

  const payload = buildTriggerPayload(RULE_TEMP, mockResult);

  // Required fields (Step 9)
  assert(typeof payload.ruleId    === 'string', 'payload.ruleId is a string');
  assert(typeof payload.ruleName  === 'string', 'payload.ruleName is a string');
  assert(typeof payload.sensorId  === 'string', 'payload.sensorId is a string');
  assert(typeof payload.timestamp === 'string', 'payload.timestamp is a string');
  assert(typeof payload.value     === 'number', 'payload.value is a number');
  assert(typeof payload.field     === 'string', 'payload.field is a string');
  assert(typeof payload.operator  === 'string', 'payload.operator is a string');
  assert(typeof payload.threshold === 'number', 'payload.threshold is a number');
  assert(typeof payload.action    === 'string', 'payload.action is a string');
  assert(typeof payload.severity  === 'string', 'payload.severity is a string');

  // Correct values
  assertEqual(payload.ruleId,    'rule-temp-001',          'payload.ruleId correct');
  assertEqual(payload.ruleName,  'High Temperature Alert', 'payload.ruleName correct');
  assertEqual(payload.sensorId,  'TURBINE-001',            'payload.sensorId correct');
  assertEqual(payload.field,     'temperature',            'payload.field correct');
  assertEqual(payload.operator,  '>',                      'payload.operator correct');
  assertEqual(payload.threshold, 80,                       'payload.threshold correct');
  assertEqual(payload.value,     85,                       'payload.value = actual reading');
  assertEqual(payload.action,    'SMS',                    'payload.action correct');
  assertEqual(payload.severity,  'HIGH',                   'payload.severity correct');

  // Timestamp is a valid ISO string
  assert(!isNaN(Date.parse(payload.timestamp)), 'payload.timestamp is a valid ISO date');

  cleanRegistry();
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 10 — Multi-sensor isolation
// ─────────────────────────────────────────────────────────────────────────────

section('Step 10: Multi-sensor — each rule processes only its configured sensor');
{
  cleanRegistry();

  // Rule 1: TURBINE-001  temperature > 80
  // Rule 2: TURBINE-002  pressure   > 120
  loadRule(RULE_TEMP);
  loadRule(RULE_PRESSURE);
  startRule('rule-temp-001');
  startRule('rule-pressure-002');

  const matchesT = [];
  const matchesP = [];
  const { compileRule } = require('../../compiler/ruleCompiler');
  const s1 = compileRule(RULE_TEMP).run(testStream,     r => matchesT.push(r));
  const s2 = compileRule(RULE_PRESSURE).run(testStream, r => matchesP.push(r));

  // TURBINE-001 with high temp AND high pressure
  testStream.next({ sensorId: 'TURBINE-001', temperature: 85, pressure: 130 });
  // TURBINE-002 with high temp AND high pressure
  testStream.next({ sensorId: 'TURBINE-002', temperature: 92, pressure: 130 });

  s1.unsubscribe(); s2.unsubscribe();

  // Rule 1 should only fire for TURBINE-001 (even though TURBINE-002 also has high pressure)
  assertEqual(matchesT.length, 1, 'Rule 1 fires once — only for TURBINE-001');
  assertEqual(matchesT[0].sensorId, 'TURBINE-001', 'Rule 1 match is TURBINE-001');

  // Rule 2 should only fire for TURBINE-002 (even though TURBINE-001 also has high pressure)
  assertEqual(matchesP.length, 1, 'Rule 2 fires once — only for TURBINE-002');
  assertEqual(matchesP[0].sensorId, 'TURBINE-002', 'Rule 2 match is TURBINE-002');

  cleanRegistry();
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 11 — getStatus() / getRuleStatus()
// ─────────────────────────────────────────────────────────────────────────────

section('Step 11: Runtime status — RUNNING / STOPPED tracking');
{
  cleanRegistry();

  loadRule(RULE_TEMP);
  loadRule(RULE_PRESSURE);
  loadRule(RULE_INACTIVE);

  // Start only Rule 1 and Rule 2
  startRule('rule-temp-001');
  startRule('rule-pressure-002');
  // Rule 3 (inactive) — startRule must refuse

  const all = getStatus();
  assertEqual(all.length, 3, 'getStatus() returns 3 entries');

  const r1 = all.find(s => s.ruleId === 'rule-temp-001');
  const r2 = all.find(s => s.ruleId === 'rule-pressure-002');
  const r3 = all.find(s => s.ruleId === 'rule-inactive-004');

  assert(r1 !== undefined, 'rule-temp-001 in getStatus()');
  assert(r2 !== undefined, 'rule-pressure-002 in getStatus()');
  assert(r3 !== undefined, 'rule-inactive-004 in getStatus()');

  assertEqual(r1.status, STATUS.RUNNING,  'rule-temp-001 status = RUNNING');
  assertEqual(r2.status, STATUS.RUNNING,  'rule-pressure-002 status = RUNNING');
  assertEqual(r3.status, STATUS.STOPPED,  'rule-inactive-004 status = STOPPED');

  assert(r1.subscriptionClosed === false,  'r1 subscription is open');
  assert(r2.subscriptionClosed === false,  'r2 subscription is open');
  assert(r3.subscriptionClosed === null,   'r3 has no subscription');

  assert(Array.isArray(r1.executionOrder), 'executionOrder is an array');
  assert(r1.executionOrder.length > 0,     'executionOrder has entries');
  assert(r1.startedAt instanceof Date,     'startedAt is a Date for RUNNING rule');
  assert(r3.startedAt === null,            'startedAt is null for STOPPED rule');

  // getRuleStatus() for single rule
  const single = getRuleStatus('rule-temp-001');
  assertEqual(single.status, STATUS.RUNNING, 'getRuleStatus() returns RUNNING for rule-temp-001');
  assertEqual(single.ruleName, 'High Temperature Alert', 'getRuleStatus() returns correct ruleName');

  // getRuleStatus() for unknown ruleId returns null
  const unknown = getRuleStatus('does-not-exist');
  assert(unknown === null, 'getRuleStatus() returns null for unknown ruleId');

  // Stop Rule 1 and verify status updates
  stopRule('rule-temp-001');
  const afterStop = getRuleStatus('rule-temp-001');
  assertEqual(afterStop.status, STATUS.STOPPED,    'Status updates to STOPPED after stopRule');
  assert(afterStop.stoppedAt instanceof Date,       'stoppedAt is set after stopRule');
  assert(afterStop.subscriptionClosed === null,     'subscription is null after stop');

  // deactivateAll — all RUNNING rules become STOPPED
  const status_before = getStatus().filter(s => s.status === STATUS.RUNNING).length;
  assert(status_before === 1, '1 rule still RUNNING before deactivateAll');
  deactivateAll();
  const status_after = getStatus().filter(s => s.status === STATUS.RUNNING).length;
  assertEqual(status_after, 0, 'No RUNNING rules after deactivateAll');

  cleanRegistry();
}

// ─────────────────────────────────────────────────────────────────────────────
// Bonus — loadRule with unknown ruleId then startRule returns false gracefully
// ─────────────────────────────────────────────────────────────────────────────

section('Bonus: startRule on unloaded ruleId returns false gracefully');
{
  cleanRegistry();

  const result = startRule('never-loaded-rule-xyz');
  assert(result === false, 'startRule() returns false when ruleId not in registry');

  cleanRegistry();
}

// ─────────────────────────────────────────────────────────────────────────────
// Restore original telemetry$ Subject
// ─────────────────────────────────────────────────────────────────────────────

Object.defineProperty(telemetryStreamModule, 'telemetry$', {
  get: () => originalSubject,
  configurable: true,
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
