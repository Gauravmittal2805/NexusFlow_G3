/**
 * Rule Engine Advanced Tests
 * 
 * Covers:
 * - Duplicate prevention
 * - Rule updates & hot reload
 * - Alert payload validation
 * - Error handling & graph validation
 */

const { compile } = require('../compiler/ruleCompiler');
const { loadRule, startRule, stopRule, reloadRule, getStatus } = require('../engine/ruleRuntime');
const { pushToStream } = require('../engine/telemetryStream');
const { validate } = require('../compiler/graphValidator');

console.log('================================================================');
console.log('   RULE ENGINE — ADVANCED FUNCTIONALITY TESTS');
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
// TEST SUITE 1: DUPLICATE PREVENTION
// ============================================================================

async function testDuplicatePrevention() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('TEST SUITE 1: Duplicate Prevention');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const testRule = {
    _id: 'test-duplicates',
    name: 'Duplicate Test',
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
    isActive: true
  };

  const alerts = [];
  await loadRule(testRule, (a) => alerts.push(a));
  await startRule(testRule._id);

  // Test 1: Single event → Single alert
  pushToStream({
    sensorId: 'TURBINE-001',
    temperature: 92,
    pressure: 120,
    humidity: 45,
    rpm: 1800,
    timestamp: new Date().toISOString()
  });

  await new Promise(resolve => setTimeout(resolve, 150));
  const singleEventAlerts = alerts.length;

  // Test 2: Multiple rapid events
  for (let i = 0; i < 3; i++) {
    pushToStream({
      sensorId: 'TURBINE-001',
      temperature: 85 + i * 5,
      pressure: 120,
      humidity: 45,
      rpm: 1800,
      timestamp: new Date().toISOString()
    });
    await new Promise(resolve => setTimeout(resolve, 30));
  }

  await new Promise(resolve => setTimeout(resolve, 150));
  const multiEventAlerts = alerts.length - singleEventAlerts;

  // Test 3: After reload
  await stopRule(testRule._id);
  await startRule(testRule._id);

  const beforeReload = alerts.length;

  pushToStream({
    sensorId: 'TURBINE-001',
    temperature: 88,
    pressure: 120,
    humidity: 45,
    rpm: 1800,
    timestamp: new Date().toISOString()
  });

  await new Promise(resolve => setTimeout(resolve, 150));
  const reloadAlerts = alerts.length - beforeReload;

  logResult('Single event → Single alert (no duplicates)', singleEventAlerts === 1);
  logResult('Multiple events → Multiple alerts (1:1 mapping)', multiEventAlerts === 3);
  logResult('After reload → No double subscription', reloadAlerts === 1);

  stopRule(testRule._id);
  console.log();
}

// ============================================================================
// TEST SUITE 2: RULE UPDATES & HOT RELOAD
// ============================================================================

async function testRuleUpdates() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('TEST SUITE 2: Rule Updates & Hot Reload');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const originalRule = {
    _id: 'test-update',
    name: 'Update Test',
    graph: {
      nodes: [
        { id: 'sensor-1', type: 'sensor', data: { sensorId: 'TURBINE-001', field: 'temperature' } },
        { id: 'condition-1', type: 'condition', data: { operator: 'GREATER', threshold: 80 } },
        { id: 'alert-1', type: 'alert', data: { severity: 'HIGH', message: 'Original' } }
      ],
      edges: [
        { source: 'sensor-1', target: 'condition-1' },
        { source: 'condition-1', target: 'alert-1' }
      ]
    },
    isActive: true
  };

  const alerts = [];
  await loadRule(originalRule, (a) => alerts.push(a));
  await startRule(originalRule._id);

  // Test with original threshold (80)
  pushToStream({
    sensorId: 'TURBINE-001',
    temperature: 85,
    pressure: 120,
    humidity: 45,
    rpm: 1800,
    timestamp: new Date().toISOString()
  });

  await new Promise(resolve => setTimeout(resolve, 100));
  const originalAlerts = alerts.filter(a => a.message === 'Original').length;

  // Update rule (threshold 90)
  const updatedRule = {
    ...originalRule,
    graph: {
      nodes: [
        { id: 'sensor-1', type: 'sensor', data: { sensorId: 'TURBINE-001', field: 'temperature' } },
        { id: 'condition-1', type: 'condition', data: { operator: 'GREATER', threshold: 90 } },
        { id: 'alert-1', type: 'alert', data: { severity: 'HIGH', message: 'Updated' } }
      ],
      edges: [
        { source: 'sensor-1', target: 'condition-1' },
        { source: 'condition-1', target: 'alert-1' }
      ]
    }
  };

  await reloadRule(updatedRule, (a) => alerts.push(a));

  // Test 1: 85 should NOT trigger (85 < 90)
  pushToStream({
    sensorId: 'TURBINE-001',
    temperature: 85,
    pressure: 120,
    humidity: 45,
    rpm: 1800,
    timestamp: new Date().toISOString()
  });

  await new Promise(resolve => setTimeout(resolve, 100));
  const noTriggerTest = alerts.filter(a => a.message === 'Updated' && a.value === 85).length;

  // Test 2: 95 should trigger (95 > 90)
  pushToStream({
    sensorId: 'TURBINE-001',
    temperature: 95,
    pressure: 120,
    humidity: 45,
    rpm: 1800,
    timestamp: new Date().toISOString()
  });

  await new Promise(resolve => setTimeout(resolve, 100));
  const triggerTest = alerts.filter(a => a.message === 'Updated' && a.value === 95).length;

  logResult('Original rule worked (85 > 80)', originalAlerts === 1);
  logResult('After update: 85°C does not trigger (85 < 90)', noTriggerTest === 0);
  logResult('After update: 95°C triggers (95 > 90)', triggerTest === 1);
  logResult('Old rule logic removed', alerts.filter(a => a.message === 'Original').length === 1);

  stopRule(updatedRule._id);
  console.log();
}

// ============================================================================
// TEST SUITE 3: ALERT PAYLOAD VALIDATION
// ============================================================================

async function testAlertPayload() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('TEST SUITE 3: Alert Payload Validation');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const rule = {
    nodes: [
      { id: 'sensor-1', type: 'sensor', data: { sensorId: 'TURBINE-001', field: 'temperature' } },
      { id: 'condition-1', type: 'condition', data: { operator: 'GREATER', threshold: 80 } },
      { id: 'alert-1', type: 'alert', data: { severity: 'HIGH', message: 'Test Message' } }
    ],
    edges: [
      { source: 'sensor-1', target: 'condition-1' },
      { source: 'condition-1', target: 'alert-1' }
    ]
  };

  let payload = null;
  const pipeline = compile(rule, (a) => { payload = a; });
  const subscription = pipeline.subscribe({ error: () => {} });

  pushToStream({
    sensorId: 'TURBINE-001',
    temperature: 92,
    pressure: 120,
    humidity: 45,
    rpm: 1800,
    timestamp: new Date().toISOString()
  });

  await new Promise(resolve => setTimeout(resolve, 100));
  subscription.unsubscribe();

  if (!payload) {
    logResult('Alert payload received', false, 'No payload');
    return;
  }

  logResult('Payload has ruleId', 'ruleId' in payload);
  logResult('Payload has ruleName', 'ruleName' in payload);
  logResult('Payload has sensorId', payload.sensorId === 'TURBINE-001');
  logResult('Payload has severity', ['HIGH', 'MEDIUM', 'LOW'].includes(payload.severity));
  logResult('Payload has message', typeof payload.message === 'string' && payload.message.length > 0);
  logResult('Payload has field', payload.field === 'temperature');
  logResult('Payload has value', payload.value === 92);
  logResult('Payload has timestamp', 'timestamp' in payload && !isNaN(Date.parse(payload.timestamp)));

  console.log();
}

// ============================================================================
// TEST SUITE 4: ERROR HANDLING & VALIDATION
// ============================================================================

async function testErrorHandling() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('TEST SUITE 4: Error Handling & Validation');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const invalidRules = [
    {
      name: 'Missing sensor node',
      graph: {
        nodes: [
          { id: 'condition-1', type: 'condition', data: { operator: 'GREATER', threshold: 80 } },
          { id: 'alert-1', type: 'alert', data: { severity: 'HIGH', message: 'Alert' } }
        ],
        edges: [{ source: 'condition-1', target: 'alert-1' }]
      }
    },
    {
      name: 'Invalid operator',
      graph: {
        nodes: [
          { id: 'sensor-1', type: 'sensor', data: { sensorId: 'TURBINE-001', field: 'temperature' } },
          { id: 'condition-1', type: 'condition', data: { operator: 'INVALID', threshold: 80 } },
          { id: 'alert-1', type: 'alert', data: { severity: 'HIGH', message: 'Alert' } }
        ],
        edges: [
          { source: 'sensor-1', target: 'condition-1' },
          { source: 'condition-1', target: 'alert-1' }
        ]
      }
    },
    {
      name: 'Missing threshold',
      graph: {
        nodes: [
          { id: 'sensor-1', type: 'sensor', data: { sensorId: 'TURBINE-001', field: 'temperature' } },
          { id: 'condition-1', type: 'condition', data: { operator: 'GREATER' } },
          { id: 'alert-1', type: 'alert', data: { severity: 'HIGH', message: 'Alert' } }
        ],
        edges: [
          { source: 'sensor-1', target: 'condition-1' },
          { source: 'condition-1', target: 'alert-1' }
        ]
      }
    },
    {
      name: 'Broken edge',
      graph: {
        nodes: [
          { id: 'sensor-1', type: 'sensor', data: { sensorId: 'TURBINE-001', field: 'temperature' } },
          { id: 'condition-1', type: 'condition', data: { operator: 'GREATER', threshold: 80 } }
        ],
        edges: [{ source: 'sensor-1', target: 'non-existent' }]
      }
    }
  ];

  for (const testCase of invalidRules) {
    let caught = false;

    try {
      const validationResult = validate(testCase.graph);
      if (!validationResult.valid) {
        caught = true;
      } else {
        compile(testCase.graph, () => {});
      }
    } catch (err) {
      caught = true;
    }

    logResult(`Invalid rule rejected: ${testCase.name}`, caught);
  }

  // Test system stability after errors
  const validRule = {
    nodes: [
      { id: 'sensor-1', type: 'sensor', data: { sensorId: 'TURBINE-001', field: 'temperature' } },
      { id: 'condition-1', type: 'condition', data: { operator: 'GREATER', threshold: 80 } },
      { id: 'alert-1', type: 'alert', data: { severity: 'HIGH', message: 'Valid' } }
    ],
    edges: [
      { source: 'sensor-1', target: 'condition-1' },
      { source: 'condition-1', target: 'alert-1' }
    ]
  };

  let validTriggered = false;
  const pipeline = compile(validRule, () => { validTriggered = true; });
  const subscription = pipeline.subscribe({ error: () => {} });

  pushToStream({
    sensorId: 'TURBINE-001',
    temperature: 92,
    pressure: 120,
    humidity: 45,
    rpm: 1800,
    timestamp: new Date().toISOString()
  });

  await new Promise(resolve => setTimeout(resolve, 100));
  subscription.unsubscribe();

  logResult('System stable after errors (valid rule works)', validTriggered);

  console.log();
}

// ============================================================================
// RUN ALL TESTS
// ============================================================================

(async () => {
  try {
    await testDuplicatePrevention();
    await testRuleUpdates();
    await testAlertPayload();
    await testErrorHandling();

    console.log('================================================================');
    console.log('SUMMARY');
    console.log('================================================================\n');
    console.log(`✅ Passed: ${results.passed}`);
    console.log(`❌ Failed: ${results.failed}`);
    console.log(`📊 Total:  ${results.tests.length}\n`);

    if (results.failed === 0) {
      console.log('🎉 ALL ADVANCED TESTS PASSED!\n');
    }

    process.exit(results.failed === 0 ? 0 : 1);
  } catch (err) {
    console.error('❌ Test suite error:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
})();
