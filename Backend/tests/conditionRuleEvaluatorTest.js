const ruleService = require('../services/ruleService');
const { evaluateCondition } = require('../services/conditionEvaluator');
const { evaluateRule } = require('../services/ruleEvaluator');
const { processTelemetry, ruleEventEmitter } = require('../services/ruleEngineService');

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runEvaluatorTests() {
  console.log('🧪 Starting Condition & Rule Evaluator Tests (Steps 1 to 10)...\n');

  try {
    // ----------------------------------------------------
    // STEP 1 & 2 & 4: Basic Condition Evaluation & Telemetry Extraction
    // ----------------------------------------------------
    console.log('--- Step 1, 2 & 4: Condition Node Understanding & Telemetry Field Extraction ---');
    const conditionNode1 = {
      id: 'condition1',
      type: 'condition',
      data: {
        field: 'temperature',
        operator: '>',
        value: 80,
      },
    };

    const telemetryHigh = {
      sensorId: 'TURBINE-001',
      temperature: 82.4,
      pressure: 121,
      rpm: 1840,
    };

    const resultHigh = evaluateCondition(conditionNode1, telemetryHigh);
    assert(resultHigh === true, '82.4 > 80 should evaluate to TRUE');
    console.log('✅ Step 1, 2 & 4 Passed: temperature 82.4 > 80 evaluated to TRUE');

    // ----------------------------------------------------
    // STEP 3: Basic Operators (>, <, >=, <=, ==, !=)
    // ----------------------------------------------------
    console.log('\n--- Step 3: Support Basic Operators ---');

    // Greater Than (>)
    assert(evaluateCondition({ field: 'temperature', operator: '>', value: 80 }, { temperature: 85 }) === true, '> operator true check');
    assert(evaluateCondition({ field: 'temperature', operator: '>', value: 80 }, { temperature: 75 }) === false, '> operator false check');

    // Less Than (<)
    assert(evaluateCondition({ field: 'temperature', operator: '<', value: 40 }, { temperature: 35 }) === true, '< operator true check');
    assert(evaluateCondition({ field: 'temperature', operator: '<', value: 40 }, { temperature: 45 }) === false, '< operator false check');

    // Greater Than or Equal (>=)
    assert(evaluateCondition({ field: 'rpm', operator: '>=', value: 1800 }, { rpm: 1800 }) === true, '>= operator equal check');
    assert(evaluateCondition({ field: 'rpm', operator: '>=', value: 1800 }, { rpm: 1850 }) === true, '>= operator greater check');
    assert(evaluateCondition({ field: 'rpm', operator: '>=', value: 1800 }, { rpm: 1799 }) === false, '>= operator false check');

    // Less Than or Equal (<=)
    assert(evaluateCondition({ field: 'pressure', operator: '<=', value: 100 }, { pressure: 100 }) === true, '<= operator equal check');
    assert(evaluateCondition({ field: 'pressure', operator: '<=', value: 100 }, { pressure: 90 }) === true, '<= operator less check');
    assert(evaluateCondition({ field: 'pressure', operator: '<=', value: 100 }, { pressure: 105 }) === false, '<= operator false check');

    // Equal (==)
    assert(evaluateCondition({ field: 'humidity', operator: '==', value: 50 }, { humidity: 50 }) === true, '== operator true check');
    assert(evaluateCondition({ field: 'humidity', operator: '==', value: 50 }, { humidity: 55 }) === false, '== operator false check');

    // Not Equal (!=)
    assert(evaluateCondition({ field: 'status', operator: '!=', value: 'ERROR' }, { status: 'NORMAL' }) === true, '!= operator true check');
    assert(evaluateCondition({ field: 'status', operator: '!=', value: 'NORMAL' }, { status: 'NORMAL' }) === false, '!= operator false check');

    console.log('✅ Step 3 Passed: All basic operators (>, <, >=, <=, ==, !=) tested successfully');

    // ----------------------------------------------------
    // STEP 5: Validate Condition Node & Error Handling
    // ----------------------------------------------------
    console.log('\n--- Step 5: Validate Condition Node (Error Handling without Crashing) ---');

    // Invalid operator
    const invalidOpCond = { field: 'temperature', operator: '???', value: 80 };
    const invalidOpResult = evaluateCondition(invalidOpCond, telemetryHigh);
    assert(invalidOpResult === false, 'Invalid operator should return false and log error without crashing');

    // Missing field in condition
    const missingFieldCond = { operator: '>', value: 80 };
    assert(evaluateCondition(missingFieldCond, telemetryHigh) === false, 'Missing field should safely return false');

    // Missing value in condition
    const missingValCond = { field: 'temperature', operator: '>' };
    assert(evaluateCondition(missingValCond, telemetryHigh) === false, 'Missing value should safely return false');

    // Telemetry missing requested field
    const missingTelemetryField = { field: 'vibration', operator: '>', value: 10 };
    assert(evaluateCondition(missingTelemetryField, telemetryHigh) === false, 'Missing telemetry field should safely return false');

    console.log('✅ Step 5 Passed: Invalid conditions and missing fields handled safely without backend crash');

    // ----------------------------------------------------
    // STEP 6, 7 & 8: Rule Evaluator & Graph Connection (Matching vs Non-Matching)
    // ----------------------------------------------------
    console.log('\n--- Step 6, 7 & 8: Rule Evaluation Service & Graph Node Connection ---');

    const sampleRule = {
      _id: '68a123',
      name: 'High Temperature Turbine Rule',
      nodes: [
        { id: 'sensor1', type: 'sensor', data: { sensorId: 'TURBINE-001' } },
        { id: 'condition1', type: 'condition', data: { field: 'temperature', operator: '>', value: 80 } },
        { id: 'alert1', type: 'alert', data: { action: 'EMAIL' } },
      ],
      edges: [
        { source: 'sensor1', target: 'condition1' },
        { source: 'condition1', target: 'alert1' },
      ],
    };

    // Case 1: Matching Condition (temperature = 82.4 > 80)
    const matchRes = evaluateRule(sampleRule, telemetryHigh);
    assert(matchRes.matched === true, 'Matching telemetry should result in matched: true');
    assert(matchRes.ruleId === '68a123', 'ruleId in match result should match rule _id');
    assert(matchRes.sensorId === 'TURBINE-001', 'sensorId in match result should match sensorId');
    console.log('✅ Step 7 Passed: evaluateRule returned matching result:', JSON.stringify(matchRes));

    // Case 2: Step 8 Non-Matching Condition (temperature = 72 <= 80)
    const telemetryLow = {
      sensorId: 'TURBINE-001',
      temperature: 72,
      pressure: 120,
      rpm: 1800,
    };
    const nonMatchRes = evaluateRule(sampleRule, telemetryLow);
    assert(nonMatchRes.matched === false, 'Non-matching telemetry should result in matched: false');
    console.log('✅ Step 8 Passed: Non-matching telemetry returned:', JSON.stringify(nonMatchRes));

    // ----------------------------------------------------
    // STEP 9 & 10: Rule Triggered Event Emission & Day 2 Pipeline
    // ----------------------------------------------------
    console.log('\n--- Step 9 & 10: Generate rule:triggered Event & Complete Flow Connection ---');

    let triggeredEventReceived = null;
    const eventHandler = (payload) => {
      triggeredEventReceived = payload;
    };

    ruleEventEmitter.on('rule:triggered', eventHandler);

    // Mock active rules returned by getActiveRules in ruleEngineService test context
    const originalGetActiveRules = ruleService.getActiveRules;
    ruleService.getActiveRules = async () => [sampleRule];

    // Trigger processTelemetry with matching data
    const timestamp = '2026-08-19T10:30:00Z';
    await processTelemetry({
      sensorId: 'TURBINE-001',
      temperature: 82.4,
      pressure: 121,
      rpm: 1840,
      timestamp,
    });

    assert(triggeredEventReceived !== null, 'rule:triggered event should be emitted when condition evaluates TRUE');
    assert(triggeredEventReceived.ruleId === '68a123', 'rule:triggered event ruleId mismatch');
    assert(triggeredEventReceived.sensorId === 'TURBINE-001', 'rule:triggered event sensorId mismatch');
    assert(triggeredEventReceived.timestamp === timestamp, 'rule:triggered event timestamp mismatch');

    console.log('✅ Step 9 & 10 Passed: rule:triggered event emitted with payload:', JSON.stringify(triggeredEventReceived));

    // Cleanup mock
    ruleService.getActiveRules = originalGetActiveRules;
    ruleEventEmitter.off('rule:triggered', eventHandler);

    console.log('\n🎉 ALL 10 STEPS FULLY VERIFIED AND PASSED SUCCESSFULLY!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Test execution failed:', err);
    process.exit(1);
  }
}

runEvaluatorTests();
