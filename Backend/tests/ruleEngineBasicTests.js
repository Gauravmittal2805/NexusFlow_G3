/**
 * Rule Engine Basic Tests
 * 
 * Covers:
 * - Multiple condition operators (>, <, >=, <=, ==, !=)
 * - Multiple simultaneous rules
 * - Sensor-specific filtering
 * - Active/Inactive rule toggling
 */

const { compile } = require('../compiler/ruleCompiler');
const { loadRule, startRule, stopRule, getStatus } = require('../engine/ruleRuntime');
const { pushToStream } = require('../engine/telemetryStream');

console.log('================================================================');
console.log('   RULE ENGINE — BASIC FUNCTIONALITY TESTS');
console.log('================================================================\n');

const results = { passed: 0, failed: 0, tests: [] };

function logResult(testName, passed, message = '') {
  const icon = passed ? '✅' : '❌';
  console.log(`${icon} ${testName}${message ? ': ' + message : ''}`);
  results.tests.push({ name: testName, passed });
  if (passed) results.passed++;
  else results.failed++;
}

// ============================================================================
// TEST SUITE 1: MULTIPLE CONDITION OPERATORS
// ============================================================================

async function testOperators() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('TEST SUITE 1: Multiple Condition Operators');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const operators = [
    { type: 'GREATER', symbol: '>', testValue: 92, threshold: 80, shouldTrigger: true },
    { type: 'GREATER', symbol: '>', testValue: 75, threshold: 80, shouldTrigger: false },
    { type: 'LESS', symbol: '<', testValue: 35, threshold: 40, shouldTrigger: true },
    { type: 'LESS', symbol: '<', testValue: 45, threshold: 40, shouldTrigger: false },
    { type: 'GREATER_EQUAL', symbol: '>=', testValue: 120, threshold: 120, shouldTrigger: true },
    { type: 'LESS_EQUAL', symbol: '<=', testValue: 1000, threshold: 1000, shouldTrigger: true },
    { type: 'EQUAL', symbol: '==', testValue: 50, threshold: 50, shouldTrigger: true },
    { type: 'EQUAL', symbol: '==', testValue: 51, threshold: 50, shouldTrigger: false },
    { type: 'NOT_EQUAL', symbol: '!=', testValue: 51, threshold: 50, shouldTrigger: true },
    { type: 'NOT_EQUAL', symbol: '!=', testValue: 50, threshold: 50, shouldTrigger: false },
  ];

  for (const op of operators) {
    const graph = {
      nodes: [
        { id: 'sensor-1', type: 'sensor', data: { sensorId: 'TURBINE-001', field: 'temperature' } },
        { id: 'condition-1', type: 'condition', data: { operator: op.type, threshold: op.threshold } },
        { id: 'alert-1', type: 'alert', data: { severity: 'HIGH', message: 'Test' } }
      ],
      edges: [
        { source: 'sensor-1', target: 'condition-1' },
        { source: 'condition-1', target: 'alert-1' }
      ]
    };

    let triggered = false;
    const pipeline = compile(graph, () => { triggered = true; });
    const subscription = pipeline.subscribe({ error: () => {} });

    pushToStream({
      sensorId: 'TURBINE-001',
      temperature: op.testValue,
      pressure: 120,
      humidity: 45,
      rpm: 1800,
      timestamp: new Date().toISOString()
    });

    await new Promise(resolve => setTimeout(resolve, 50));
    subscription.unsubscribe();

    const passed = triggered === op.shouldTrigger;
    logResult(
      `${op.symbol} operator (${op.testValue} ${op.symbol} ${op.threshold})`,
      passed,
      `Expected ${op.shouldTrigger ? 'trigger' : 'no trigger'}, got ${triggered ? 'trigger' : 'no trigger'}`
    );
  }

  console.log();
}

// ============================================================================
// TEST SUITE 2: MULTIPLE RULES SIMULTANEOUSLY
// ============================================================================

async function testMultipleRules() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('TEST SUITE 2: Multiple Rules Simultaneously');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const rule1 = {
    nodes: [
      { id: 'sensor-1', type: 'sensor', data: { sensorId: 'TURBINE-001', field: 'temperature' } },
      { id: 'condition-1', type: 'condition', data: { operator: 'GREATER', threshold: 80 } },
      { id: 'alert-1', type: 'alert', data: { severity: 'HIGH', message: 'High Temp' } }
    ],
    edges: [
      { source: 'sensor-1', target: 'condition-1' },
      { source: 'condition-1', target: 'alert-1' }
    ]
  };

  const rule2 = {
    nodes: [
      { id: 'sensor-2', type: 'sensor', data: { sensorId: 'TURBINE-001', field: 'pressure' } },
      { id: 'condition-2', type: 'condition', data: { operator: 'GREATER', threshold: 120 } },
      { id: 'alert-2', type: 'alert', data: { severity: 'HIGH', message: 'High Pressure' } }
    ],
    edges: [
      { source: 'sensor-2', target: 'condition-2' },
      { source: 'condition-2', target: 'alert-2' }
    ]
  };

  const alerts = [];
  const pipeline1 = compile(rule1, (a) => alerts.push({ rule: 1, ...a }));
  const pipeline2 = compile(rule2, (a) => alerts.push({ rule: 2, ...a }));

  const sub1 = pipeline1.subscribe({ error: () => {} });
  const sub2 = pipeline2.subscribe({ error: () => {} });

  pushToStream({
    sensorId: 'TURBINE-001',
    temperature: 92,
    pressure: 125,
    humidity: 45,
    rpm: 1800,
    timestamp: new Date().toISOString()
  });

  await new Promise(resolve => setTimeout(resolve, 100));
  sub1.unsubscribe();
  sub2.unsubscribe();

  logResult('Rule 1 triggered (Temperature > 80)', alerts.some(a => a.rule === 1));
  logResult('Rule 2 triggered (Pressure > 120)', alerts.some(a => a.rule === 2));
  logResult('Both rules independent (no interference)', alerts.length === 2);

  console.log();
}

// ============================================================================
// TEST SUITE 3: SENSOR-SPECIFIC FILTERING
// ============================================================================

async function testSensorFiltering() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('TEST SUITE 3: Sensor-Specific Filtering');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const rule = {
    nodes: [
      { id: 'sensor-1', type: 'sensor', data: { sensorId: 'TURBINE-001', field: 'temperature' } },
      { id: 'condition-1', type: 'condition', data: { operator: 'GREATER', threshold: 80 } },
      { id: 'alert-1', type: 'alert', data: { severity: 'HIGH', message: 'Alert' } }
    ],
    edges: [
      { source: 'sensor-1', target: 'condition-1' },
      { source: 'condition-1', target: 'alert-1' }
    ]
  };

  let alertCount = 0;
  const pipeline = compile(rule, () => alertCount++);
  const subscription = pipeline.subscribe({ error: () => {} });

  // Test 1: Wrong sensor
  pushToStream({
    sensorId: 'TURBINE-002',
    temperature: 95,
    pressure: 120,
    humidity: 45,
    rpm: 1800,
    timestamp: new Date().toISOString()
  });

  await new Promise(resolve => setTimeout(resolve, 100));
  const wrongSensorAlerts = alertCount;

  // Test 2: Correct sensor
  pushToStream({
    sensorId: 'TURBINE-001',
    temperature: 95,
    pressure: 120,
    humidity: 45,
    rpm: 1800,
    timestamp: new Date().toISOString()
  });

  await new Promise(resolve => setTimeout(resolve, 100));
  subscription.unsubscribe();

  logResult('Wrong sensor ignored (TURBINE-002)', wrongSensorAlerts === 0);
  logResult('Correct sensor triggered (TURBINE-001)', alertCount === 1);

  console.log();
}

// ============================================================================
// TEST SUITE 4: ACTIVE/INACTIVE TOGGLING
// ============================================================================

async function testActiveInactive() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('TEST SUITE 4: Active/Inactive Rule Toggling');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const testRule = {
    _id: 'test-active-inactive',
    name: 'Test Rule',
    graph: {
      nodes: [
        { id: 'sensor-1', type: 'sensor', data: { sensorId: 'TURBINE-001', field: 'temperature' } },
        { id: 'condition-1', type: 'condition', data: { operator: 'GREATER', threshold: 80 } },
        { id: 'alert-1', type: 'alert', data: { severity: 'HIGH', message: 'Alert' } }
      ],
      edges: [
        { source: 'sensor-1', target: 'condition-1' },
        { source: 'condition-1', target: 'alert-1' }
      ]
    },
    isActive: false
  };

  let alertCount = 0;
  const handler = () => alertCount++;

  // Test 1: Inactive
  await loadRule(testRule, handler);

  pushToStream({
    sensorId: 'TURBINE-001',
    temperature: 95,
    pressure: 120,
    humidity: 45,
    rpm: 1800,
    timestamp: new Date().toISOString()
  });

  await new Promise(resolve => setTimeout(resolve, 100));
  const inactiveAlerts = alertCount;

  // Test 2: Activate
  testRule.isActive = true;
  await startRule(testRule._id);

  pushToStream({
    sensorId: 'TURBINE-001',
    temperature: 95,
    pressure: 120,
    humidity: 45,
    rpm: 1800,
    timestamp: new Date().toISOString()
  });

  await new Promise(resolve => setTimeout(resolve, 100));
  const activeAlerts = alertCount - inactiveAlerts;

  // Test 3: Deactivate
  await stopRule(testRule._id);

  pushToStream({
    sensorId: 'TURBINE-001',
    temperature: 95,
    pressure: 120,
    humidity: 45,
    rpm: 1800,
    timestamp: new Date().toISOString()
  });

  await new Promise(resolve => setTimeout(resolve, 100));
  const deactivatedAlerts = alertCount - inactiveAlerts - activeAlerts;

  logResult('Inactive rule does not trigger', inactiveAlerts === 0);
  logResult('Active rule triggers correctly', activeAlerts === 1);
  logResult('Deactivated rule stops triggering', deactivatedAlerts === 0);

  stopRule(testRule._id);
  console.log();
}

// ============================================================================
// RUN ALL TESTS
// ============================================================================

(async () => {
  try {
    await testOperators();
    await testMultipleRules();
    await testSensorFiltering();
    await testActiveInactive();

    console.log('================================================================');
    console.log('SUMMARY');
    console.log('================================================================\n');
    console.log(`✅ Passed: ${results.passed}`);
    console.log(`❌ Failed: ${results.failed}`);
    console.log(`📊 Total:  ${results.tests.length}\n`);

    if (results.failed === 0) {
      console.log('🎉 ALL BASIC TESTS PASSED!\n');
    }

    process.exit(results.failed === 0 ? 0 : 1);
  } catch (err) {
    console.error('❌ Test suite error:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
})();
