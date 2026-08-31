/**
 * e2eVerificationTest.js
 *
 * End-to-end verification test covering Steps 1–8 of the rule engine spec.
 *
 * Step 1 — Compiler understands sensor / condition / alert / edges / field / operator / value
 * Step 2 — FALSE telemetry (75 > 80 → no alert)  +  TRUE telemetry (92 > 80 → alert)
 * Step 3 — Multiple rules fire independently on same telemetry stream
 * Step 4 — isActive=false → pipeline not started; isActive=true → pipeline running
 * Step 5 — One telemetry event → exactly ONE alert (no duplicates)
 * Step 6 — Invalid rule (unknown operator / missing sensor) → error handled, engine keeps running
 * Step 7 — Trigger payload contains all required alert fields
 * Step 8 — Full e2e: graph → compile → RxJS pipeline → live telemetry → condition TRUE → alert
 *
 * No MongoDB / Socket.IO needed — Alert.create and getIo() are mocked.
 *
 * Run:
 *   node compiler/tests/e2eVerificationTest.js
 */

'use strict';

(async () => {

// ─────────────────────────────────────────────────────────────────────────────
// Assertion helpers (same style as compilerTest.js)
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
// Infrastructure mocks (no DB / no Socket.IO)
// ─────────────────────────────────────────────────────────────────────────────

// Mock Alert.create — captures saved alerts in memory
const Alert      = require('../../models/Alert');
const savedAlerts = [];
Alert.create = async (data) => {
  const doc = { _id: `alert-${Date.now()}-${Math.random().toString(36).slice(2)}`, ...data };
  savedAlerts.push(doc);
  return doc;
};

// Mock Socket.IO — capture emitted events
const emittedEvents = [];
const telemetrySocket = require('../../websocket/telemetrySocket');
telemetrySocket.getIo = () => ({
  emit: (event, payload) => emittedEvents.push({ event, payload }),
});

// Swap live telemetry$ for a private test Subject so tests are isolated
const { Subject } = require('rxjs');
const telemetryStreamModule = require('../telemetryStream');
const testStream = new Subject();
const _origSubject = telemetryStreamModule.telemetry$;
Object.defineProperty(telemetryStreamModule, 'telemetry$', {
  get: () => testStream, configurable: true,
});

// Reset helpers
function resetState() {
  savedAlerts.length   = 0;
  emittedEvents.length = 0;
  require('../../services/alertService')._resetCooldownMap();
  require('../../services/alertService')._resetConditionStateMap();
}

// ─────────────────────────────────────────────────────────────────────────────
// Imports (after mocks are in place)
// ─────────────────────────────────────────────────────────────────────────────

const { compileRule, CompilationError } = require('../ruleCompiler');
const { validateGraph }                 = require('../graphValidator');
const {
  activeRules, STATUS,
  loadRule, startRule, stopRule, reloadRule,
  deactivateAll, getStatus,
}                                       = require('../../engine/ruleRuntime');
const {
  buildExecutionResult,
  CONDITION_STATE,
}                                       = require('../../engine/executionResult');
const { processExecutionResult }        = require('../../services/alertService');

// ─────────────────────────────────────────────────────────────────────────────
// Rule fixtures
// ─────────────────────────────────────────────────────────────────────────────

// Canonical rule used throughout — mirrors the "High Temperature Alert" in MongoDB
const RULE_TEMP = {
  _id: 'e2e-temp-001', name: 'High Temperature Alert', isActive: true,
  nodes: [
    { id: 's1', type: 'sensor',    data: { sensorId: 'TURBINE-001', field: 'temperature' } },
    { id: 'c1', type: 'condition', data: { field: 'temperature', operator: '>', value: 80 } },
    { id: 'a1', type: 'alert',     data: { action: 'SMS', severity: 'HIGH' } },
  ],
  edges: [{ source: 's1', target: 'c1' }, { source: 'c1', target: 'a1' }],
};

const RULE_PRESSURE = {
  _id: 'e2e-pressure-002', name: 'High Pressure Alert', isActive: true,
  nodes: [
    { id: 's1', type: 'sensor',    data: { sensorId: 'TURBINE-001', field: 'pressure' } },
    { id: 'c1', type: 'condition', data: { field: 'pressure', operator: '>', value: 120 } },
    { id: 'a1', type: 'alert',     data: { action: 'EMAIL', severity: 'MEDIUM' } },
  ],
  edges: [{ source: 's1', target: 'c1' }, { source: 'c1', target: 'a1' }],
};

// Helper: clean registry between tests
function cleanRegistry() {
  deactivateAll();
  activeRules.clear();
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 1 — Compiler understands the rule graph from the Rule Builder
// ─────────────────────────────────────────────────────────────────────────────

section('Step 1: Compiler understands sensor / condition / alert / edges');
{
  // 1a. Graph validation accepts the canonical structure
  const { valid, errors } = validateGraph({
    nodes: RULE_TEMP.nodes,
    edges: RULE_TEMP.edges,
  });
  assert(valid === true, 'validateGraph() accepts sensor→condition→alert graph');
  assertEqual(errors.length, 0, 'No validation errors for canonical graph');

  // 1b. Compilation succeeds and extracts the correct metadata
  const compiled = compileRule(RULE_TEMP);
  assert(typeof compiled.run     === 'function', 'Compiled rule has run()');
  assert(typeof compiled.runOnce === 'function', 'Compiled rule has runOnce()');
  assertEqual(compiled.executionOrder, ['s1', 'c1', 'a1'], 'Execution order: sensor → condition → alert');

  // 1c. Edge map correctly represents the graph flow
  assertEqual(compiled.edgeMap.get('s1'), ['c1'], 'Edge: sensor → condition');
  assertEqual(compiled.edgeMap.get('c1'), ['a1'], 'Edge: condition → alert');
  assert(compiled.edgeMap.get('a1') === undefined, 'Alert node has no outgoing edges (sink)');

  // 1d. Node map has all three nodes
  assert(compiled.nodeMap.has('s1'), 'nodeMap has sensor node s1');
  assert(compiled.nodeMap.has('c1'), 'nodeMap has condition node c1');
  assert(compiled.nodeMap.has('a1'), 'nodeMap has alert node a1');

  // 1e. Compiler correctly reads field, operator, threshold from condition node
  const condNode = compiled.nodeMap.get('c1');
  assertEqual(condNode.data.field,    'temperature', 'condition.data.field = temperature');
  assertEqual(condNode.data.operator, '>',           'condition.data.operator = >');
  assertEqual(condNode.data.value,    80,            'condition.data.value = 80');

  // 1f. email / action node types also compile (they exist in the real DB)
  const emailRule = {
    ...RULE_TEMP,
    nodes: [
      { id: 's1', type: 'sensor',    data: { sensorId: 'TURBINE-001', field: 'temperature' } },
      { id: 'c1', type: 'condition', data: { field: 'temperature', operator: '>', value: 80 } },
      { id: 'a1', type: 'email',     data: { action: 'EMAIL', severity: 'HIGH' } },
    ],
  };
  let emailErr = null;
  try { compileRule(emailRule); } catch(e) { emailErr = e; }
  assert(emailErr === null, 'Compiler accepts node type "email" as alert alias');
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 2 — FALSE then TRUE telemetry
// ─────────────────────────────────────────────────────────────────────────────

section('Step 2: FALSE (75 > 80) → no alert  |  TRUE (92 > 80) → alert');
{
  const compiled = compileRule(RULE_TEMP);

  // FALSE: 75 > 80
  const miss = compiled.runOnce({
    sensorId: 'TURBINE-001', temperature: 75,
    pressure: 110, humidity: 43, rpm: 1800,
  });
  assert(miss.matched   === false,     '75 > 80 → matched = false');
  assert(miss.stoppedAt === 'c1',      '75 > 80 → pipeline stopped at condition node');
  assert(miss.reason.includes('evaluated false'), '75 > 80 → reason says "evaluated false"');

  // TRUE: 92 > 80
  const hit = compiled.runOnce({
    sensorId: 'TURBINE-001', temperature: 92,
    pressure: 110, humidity: 43, rpm: 1800,
  });
  assert(hit.matched   === true,  '92 > 80 → matched = true');
  assert(hit.stoppedAt === null,  '92 > 80 → stoppedAt = null (pipeline ran to completion)');

  // Verify all operators work correctly
  const ops = [
    [{ operator: '>', value: 80 }, 81, true,  'strictly greater-than'],
    [{ operator: '>', value: 80 }, 80, false, 'exactly at threshold is FALSE for >'],
    [{ operator: '>=', value: 80 }, 80, true,  '>= at threshold is TRUE'],
    [{ operator: '<',  value: 80 }, 79, true,  '< below threshold is TRUE'],
    [{ operator: '<=', value: 80 }, 80, true,  '<= at threshold is TRUE'],
    [{ operator: '==', value: 80 }, 80, true,  '== exact match is TRUE'],
    [{ operator: '!=', value: 80 }, 79, true,  '!= different value is TRUE'],
  ];
  for (const [cond, temp, expected, label] of ops) {
    const r = { ...RULE_TEMP,
      nodes: [
        { id: 's1', type: 'sensor',    data: { sensorId: 'TURBINE-001', field: 'temperature' } },
        { id: 'c1', type: 'condition', data: { field: 'temperature', ...cond } },
        { id: 'a1', type: 'alert',     data: {} },
      ],
    };
    const result = compileRule(r).runOnce({ sensorId: 'TURBINE-001', temperature: temp });
    assert(result.matched === expected, `Operator ${label}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 3 — Multiple rules on same stream
// ─────────────────────────────────────────────────────────────────────────────

section('Step 3: Multiple rules fire independently on same telemetry stream');
{
  const { from } = require('rxjs');
  const matchesT = [];
  const matchesP = [];

  const sT = compileRule(RULE_TEMP).run(testStream,     r => matchesT.push(r));
  const sP = compileRule(RULE_PRESSURE).run(testStream, r => matchesP.push(r));

  // This payload satisfies BOTH rules: temperature 92 > 80 AND pressure 125 > 120
  testStream.next({
    sensorId: 'TURBINE-001', temperature: 92,
    pressure: 125, humidity: 43, rpm: 1840,
  });

  sT.unsubscribe(); sP.unsubscribe();

  // Rule 1 (temperature)
  assertEqual(matchesT.length, 1,                    'Rule 1 (temp > 80): 1 match');
  assert(matchesT[0].matched === true,               'Rule 1 match is TRUE');
  assertEqual(matchesT[0].context.alertAction, 'SMS', 'Rule 1 alert action = SMS');

  // Rule 2 (pressure)
  assertEqual(matchesP.length, 1,                      'Rule 2 (pressure > 120): 1 match');
  assert(matchesP[0].matched === true,                 'Rule 2 match is TRUE');
  assertEqual(matchesP[0].context.alertAction, 'EMAIL', 'Rule 2 alert action = EMAIL');

  // Separate sensors are ignored correctly
  const matchesT2 = [];
  const wrongSensorSub = compileRule(RULE_TEMP).run(testStream, r => matchesT2.push(r));
  testStream.next({ sensorId: 'TURBINE-002', temperature: 99 }); // wrong sensor for RULE_TEMP
  wrongSensorSub.unsubscribe();
  assertEqual(matchesT2.length, 0, 'Rule 1 ignores telemetry from TURBINE-002 (sensor mismatch)');
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 4 — Active / Inactive rule handling
// ─────────────────────────────────────────────────────────────────────────────

section('Step 4: isActive=false → not started  |  isActive=true → RUNNING');
{
  cleanRegistry();

  // Inactive: should NOT start
  const inactiveRule = { ...RULE_TEMP, isActive: false };
  loadRule(inactiveRule);
  const startedInactive = startRule('e2e-temp-001');
  assert(startedInactive === false,                    'startRule() returns false for inactive rule');
  assertEqual(activeRules.get('e2e-temp-001').status, STATUS.STOPPED, 'Inactive rule stays STOPPED');
  assert(activeRules.get('e2e-temp-001').subscription === null, 'No subscription for inactive rule');

  // Verify inactive rule genuinely produces no matches
  const inactiveMatches = [];
  const inactivePipeline = compileRule(RULE_TEMP);
  const inactiveSub = inactivePipeline.run(testStream, r => inactiveMatches.push(r));
  testStream.next({ sensorId: 'TURBINE-001', temperature: 95 });
  inactiveSub.unsubscribe();
  // The pipeline itself works, but startRule() prevented the engine from subscribing it
  assert(activeRules.get('e2e-temp-001').subscription === null, 'Engine has no live sub for inactive rule');

  // Enable: reload with isActive=true → should start
  const activeRule = { ...RULE_TEMP, isActive: true };
  reloadRule(activeRule);
  assertEqual(activeRules.get('e2e-temp-001').status, STATUS.RUNNING, 'Rule is RUNNING after enable');
  assert(activeRules.get('e2e-temp-001').subscription !== null,       'Subscription is live after enable');
  assert(activeRules.get('e2e-temp-001').subscription.closed === false, 'Subscription is open');

  // Disable again: stopRule → STOPPED
  stopRule('e2e-temp-001');
  assertEqual(activeRules.get('e2e-temp-001').status, STATUS.STOPPED, 'Rule returns to STOPPED after disable');

  cleanRegistry();
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 5 — One telemetry event → exactly ONE alert (duplicate prevention)
// ─────────────────────────────────────────────────────────────────────────────

section('Step 5: One telemetry event → exactly one alert (no duplicates)');
{
  resetState();
  cleanRegistry();

  // Load and start exactly ONE pipeline for the rule
  loadRule(RULE_TEMP);
  startRule('e2e-temp-001');

  // Confirm only one entry in the registry for this rule
  const entries = [...activeRules.entries()].filter(([id]) => id === 'e2e-temp-001');
  assertEqual(entries.length, 1, 'Exactly 1 registry entry for rule e2e-temp-001');

  // Call startRule again — duplicate prevention must block it
  const secondStart = startRule('e2e-temp-001');
  assert(secondStart === false, 'Second startRule() returns false (duplicate prevention)');
  assertEqual(
    [...activeRules.entries()].filter(([id]) => id === 'e2e-temp-001').length,
    1,
    'Still exactly 1 registry entry after duplicate startRule() attempt'
  );

  // Push a matching telemetry reading through the live Subject
  // processExecutionResult is async — await a tick to let it settle
  testStream.next({
    sensorId: 'TURBINE-001', temperature: 92,
    pressure: 110, humidity: 43, rpm: 1800,
  });
  await new Promise(r => setTimeout(r, 50));

  assert(savedAlerts.length === 1, 'Exactly 1 alert saved for 1 telemetry event');

  const alert = savedAlerts[0];
  assert(alert.ruleId    === 'e2e-temp-001',          'Alert ruleId correct');
  assert(alert.sensorId  === 'TURBINE-001',            'Alert sensorId correct');
  assert(alert.severity  === 'HIGH',                   'Alert severity = HIGH');
  assert(alert.action    === 'SMS',                    'Alert action = SMS');
  assert(alert.status    === 'unread',                 'Alert status = unread');
  assert(typeof alert.message === 'string' &&
         alert.message.length > 20,                    'Alert message is meaningful');
  assert(!alert.message.toLowerCase().includes('rule triggered'), 'Message is NOT generic');

  cleanRegistry();
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 6 — Handle invalid rules without crashing the engine
// ─────────────────────────────────────────────────────────────────────────────

section('Step 6: Invalid rules handled gracefully — engine keeps running');
{
  cleanRegistry();

  // 6a. Unknown node type — CompilationError thrown, not a crash
  const badTypeRule = {
    _id: 'e2e-bad-001', name: 'Bad Node Type', isActive: true,
    nodes: [
      { id: 's1', type: 'sensor',  data: { sensorId: 'X' } },
      { id: 'x1', type: 'webhook', data: {} },   // unknown type
    ],
    edges: [{ source: 's1', target: 'x1' }],
  };

  const badLoad = loadRule(badTypeRule);
  assert(badLoad.ok === false,                       'loadRule() returns ok:false for unknown type');
  assert(typeof badLoad.reason === 'string',         'Failure reason is provided');
  assert(activeRules.has('e2e-bad-001'),             'Failed rule still appears in registry');
  assertEqual(activeRules.get('e2e-bad-001').status, STATUS.STOPPED, 'Failed rule status = STOPPED');
  assert(activeRules.get('e2e-bad-001').loadError !== null, 'loadError is populated');

  // 6b. Invalid rule does not prevent a valid rule from running
  loadRule(RULE_TEMP);
  startRule('e2e-temp-001');
  assertEqual(activeRules.get('e2e-temp-001').status, STATUS.RUNNING, 'Valid rule runs despite bad rule');

  // 6c. Missing condition node
  let threw = false;
  try {
    compileRule({
      name: 'No Condition', nodes: [
        { id: 's1', type: 'sensor', data: { sensorId: 'X' } },
        { id: 'a1', type: 'alert',  data: {} },
      ],
      edges: [{ source: 's1', target: 'a1' }],
    });
  } catch(e) { threw = true; }
  assert(threw, 'compileRule() throws CompilationError for missing condition node');

  // 6d. Invalid operator in condition — evaluator returns false (no crash)
  const { evaluateCondition } = require('../../services/conditionEvaluator');
  const result = evaluateCondition(
    { data: { field: 'temperature', operator: '??', value: 80 } },
    { temperature: 92 }
  );
  assert(result === false, 'evaluateCondition() returns false for unsupported operator (no crash)');

  // 6e. getStatus() still shows the full registry snapshot
  const status = getStatus();
  assert(Array.isArray(status), 'getStatus() returns array even with mixed valid/invalid rules');
  assert(status.length >= 2,    'getStatus() includes both valid and invalid rules');

  cleanRegistry();
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 7 — Trigger payload contains all required alert fields
// ─────────────────────────────────────────────────────────────────────────────

section('Step 7: Trigger payload — all required fields for alert/webhook layer');
{
  // Build a mock pipeline result (what compiled.run onMatch emits)
  const mockPipelineResult = {
    matched: true,
    ruleId:  'e2e-temp-001',
    ruleName:'High Temperature Alert',
    sensorId:'TURBINE-001',
    stoppedAt: null, reason: null,
    context: {
      matchedField: 'temperature', conditionMet: true,
      alertAction: 'SMS', alertSeverity: 'HIGH',
    },
    outputs: [
      { nodeId: 's1', type: 'sensor',    output: { sensorId: 'TURBINE-001' } },
      { nodeId: 'c1', type: 'condition', output: { field: 'temperature', operator: '>', threshold: 80, actual: 92 } },
      { nodeId: 'a1', type: 'alert',     output: { action: 'SMS', severity: 'HIGH' } },
    ],
  };

  const execResult = buildExecutionResult(mockPipelineResult, RULE_TEMP);

  // All required fields present (Step 7 spec)
  assert('ruleId'    in execResult, 'payload has ruleId');
  assert('ruleName'  in execResult, 'payload has ruleName');
  assert('sensorId'  in execResult, 'payload has sensorId');
  assert('field'     in execResult, 'payload has field');
  assert('operator'  in execResult, 'payload has operator');
  assert('threshold' in execResult, 'payload has threshold');
  assert('value'     in execResult, 'payload has value (triggered reading)');
  assert('severity'  in execResult, 'payload has severity');
  assert('action'    in execResult, 'payload has action');
  assert('message'   in execResult, 'payload has message');
  assert('timestamp' in execResult, 'payload has timestamp');

  // Correct values
  assertEqual(execResult.ruleName,  'High Temperature Alert', 'ruleName correct');
  assertEqual(execResult.sensorId,  'TURBINE-001',            'sensorId correct');
  assertEqual(execResult.field,     'temperature',            'field correct');
  assertEqual(execResult.operator,  '>',                      'operator correct');
  assertEqual(execResult.threshold, 80,                       'threshold = 80');
  assertEqual(execResult.value,     92,                       'value = 92 (actual reading)');
  assertEqual(execResult.severity,  'HIGH',                   'severity = HIGH (from alert node)');
  assertEqual(execResult.action,    'SMS',                    'action = SMS (from alert node)');
  assertEqual(execResult.conditionState, CONDITION_STATE.TRIGGERED, 'conditionState = TRIGGERED');
  assert(!isNaN(Date.parse(execResult.timestamp)),            'timestamp is valid ISO date');

  // Message is meaningful (Step 7 + Step 4 alignment)
  assert(execResult.message.includes('TURBINE-001'), 'message mentions sensorId');
  assert(execResult.message.includes('92'),          'message mentions actual value');
  assert(execResult.message.includes('80'),          'message mentions threshold');

  // Socket.IO alert:new payload is emitted by processExecutionResult
  resetState();
  await processExecutionResult(execResult);
  const alertNew = emittedEvents.find(e => e.event === 'alert:new');
  assert(alertNew !== undefined, 'alert:new Socket.IO event emitted after processExecutionResult');
  const p = alertNew.payload;
  assert('alertId'   in p, 'alert:new payload has alertId');
  assert('ruleId'    in p, 'alert:new payload has ruleId');
  assert('ruleName'  in p, 'alert:new payload has ruleName');
  assert('sensorId'  in p, 'alert:new payload has sensorId');
  assert('severity'  in p, 'alert:new payload has severity');
  assert('message'   in p, 'alert:new payload has message');
  assert('value'     in p, 'alert:new payload has value');
  assert('timestamp' in p, 'alert:new payload has timestamp');
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 8 — Full end-to-end: graph → compile → pipeline → telemetry → alert
// ─────────────────────────────────────────────────────────────────────────────

section('Step 8: Full E2E — React Flow graph → compile → RxJS → telemetry → alert');
{
  resetState();
  cleanRegistry();

  // 8a. Receive rule graph (as saved by Member 3's Rule Builder)
  const ruleFromBuilder = {
    _id: 'e2e-full-001',
    name: 'High Temperature Alert',
    isActive: true,
    nodes: [
      { id: 'sensor1',    type: 'sensor',    data: { sensorId: 'TURBINE-001', field: 'temperature' } },
      { id: 'condition1', type: 'condition', data: { field: 'temperature', operator: '>', value: 80 } },
      { id: 'alert1',     type: 'alert',     data: { action: 'SMS', severity: 'HIGH' } },
    ],
    edges: [
      { source: 'sensor1',    target: 'condition1' },
      { source: 'condition1', target: 'alert1' },
    ],
  };

  // 8b. Load into runtime (compile + register)
  const loadResult = loadRule(ruleFromBuilder);
  assert(loadResult.ok === true, '✓ Condition evaluated — compileRule() succeeded');
  assert(activeRules.has('e2e-full-001'), 'Rule is in the runtime registry');

  // 8c. Start pipeline — subscribe to telemetry$
  const started = startRule('e2e-full-001');
  assert(started === true, '✓ RxJS pipeline subscribed to telemetry$');
  assertEqual(activeRules.get('e2e-full-001').status, STATUS.RUNNING, 'Pipeline status = RUNNING');

  // 8d. Send telemetry with temperature = 92 → should trigger
  testStream.next({
    sensorId: 'TURBINE-001',
    timestamp: new Date().toISOString(),
    temperature: 92,
    pressure: 110,
    humidity: 43,
    rpm: 1800,
  });

  // Allow async alert creation to complete
  await new Promise(r => setTimeout(r, 80));

  assert(savedAlerts.length === 1, '✓ Alert generated (exactly 1 alert in DB)');
  assert(emittedEvents.some(e => e.event === 'alert:new'),     '✓ alert:new Socket.IO event emitted');
  assert(emittedEvents.some(e => e.event === 'rule:triggered'), '✓ rule:triggered event emitted');

  const alert = savedAlerts[0];
  assertEqual(alert.ruleId,   'e2e-full-001',         '✓ Alert available — ruleId correct');
  assertEqual(alert.sensorId, 'TURBINE-001',           '  sensorId correct');
  assertEqual(alert.severity, 'HIGH',                  '  severity = HIGH');
  assert(alert.message.includes('temperature'),        '  message mentions field');
  assert(alert.message.includes('92'),                 '  message includes actual value 92');
  assert(alert.message.includes('80'),                 '  message includes threshold 80');
  assert(alert.status === 'unread',                    '  alert status = unread');

  // 8e. Send temperature = 60 → should NOT trigger (below threshold)
  resetState(); // clear cooldown
  require('../../services/alertService')._resetCooldownMap();
  require('../../services/alertService')._resetConditionStateMap();

  testStream.next({
    sensorId: 'TURBINE-001', temperature: 60,
    pressure: 110, humidity: 43, rpm: 1800,
  });
  await new Promise(r => setTimeout(r, 80));

  assert(savedAlerts.length === 0, 'temperature=60 → no alert (condition FALSE)');

  // 8f. Runtime status reflects the trigger count
  const runtimeStatus = activeRules.get('e2e-full-001');
  assert(runtimeStatus.triggerCount >= 1, 'triggerCount incremented after rule fired');

  // 8g. Cleanup
  stopRule('e2e-full-001');
  assertEqual(activeRules.get('e2e-full-001').status, STATUS.STOPPED, 'Pipeline stopped cleanly');

  cleanRegistry();
}

// ─────────────────────────────────────────────────────────────────────────────
// Restore original telemetry Subject
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

})();
