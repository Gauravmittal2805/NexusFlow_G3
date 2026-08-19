const ruleService = require('../services/ruleService');
const { evaluateRule } = require('../services/ruleEvaluator');
const { processTelemetry, ruleEventEmitter } = require('../services/ruleEngineService');

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runSteps11And12Tests() {
  console.log('🧪 Starting Step 11 & Step 12 Tests...\n');

  try {
    // Rule setup as specified in Step 11
    const highTempRule = {
      _id: '68a123',
      name: 'High Temperature Alert',
      isActive: true,
      nodes: [
        {
          id: 'sensor1',
          type: 'sensor',
          data: {
            sensorId: 'TURBINE-001',
          },
        },
        {
          id: 'condition1',
          type: 'condition',
          data: {
            field: 'temperature',
            operator: '>',
            value: 80,
          },
        },
      ],
    };

    // Mock ruleService.getActiveRules to return highTempRule
    const originalGetActiveRules = ruleService.getActiveRules;
    ruleService.getActiveRules = async () => [highTempRule];

    // Track triggered events
    let triggeredEvents = [];
    const triggerHandler = (evt) => {
      triggeredEvents.push(evt);
    };
    ruleEventEmitter.on('rule:triggered', triggerHandler);

    // ====================================================
    // STEP 11 — Test With Realistic Data (True Case)
    // ====================================================
    console.log('--- Step 11: Test With Realistic Data ---');
    const telemetryHigh = {
      sensorId: 'TURBINE-001',
      temperature: 82.4,
      pressure: 121,
      humidity: 43,
      rpm: 1840,
    };

    console.log('Rule Condition:', `${highTempRule.nodes[1].data.field} ${highTempRule.nodes[1].data.operator} ${highTempRule.nodes[1].data.value}`);
    console.log('Telemetry Value:', `temperature = ${telemetryHigh.temperature}`);

    // Evaluate rule directly
    const evalHigh = evaluateRule(highTempRule, telemetryHigh);
    console.log(`Evaluation: ${telemetryHigh.temperature} > ${highTempRule.nodes[1].data.value} → ${evalHigh.matched ? 'TRUE' : 'FALSE'}`);
    assert(evalHigh.matched === true, 'Step 11: evaluateRule should return matched: true for temperature 82.4 > 80');

    // Process via RuleEngine pipeline
    await processTelemetry(telemetryHigh);
    assert(triggeredEvents.length === 1, 'Step 11: rule:triggered event should be emitted');
    assert(triggeredEvents[0].ruleId === '68a123', 'Step 11: Event ruleId mismatch');
    assert(triggeredEvents[0].sensorId === 'TURBINE-001', 'Step 11: Event sensorId mismatch');
    console.log('Result: TRUE → Rule Triggered (rule:triggered event emitted)');
    console.log('✅ Step 11 Passed Successfully!\n');

    // Reset captured events
    triggeredEvents = [];

    // ====================================================
    // STEP 12 — Test False Case (Non-Matching)
    // ====================================================
    console.log('--- Step 12: Test False Case ---');
    const telemetryLow = {
      sensorId: 'TURBINE-001',
      temperature: 70,
    };

    console.log('Rule Condition:', `${highTempRule.nodes[1].data.field} ${highTempRule.nodes[1].data.operator} ${highTempRule.nodes[1].data.value}`);
    console.log('Telemetry Value:', `temperature = ${telemetryLow.temperature}`);

    // Evaluate rule directly
    const evalLow = evaluateRule(highTempRule, telemetryLow);
    console.log(`Evaluation: ${telemetryLow.temperature} > ${highTempRule.nodes[1].data.value} → ${evalLow.matched ? 'TRUE' : 'FALSE'}`);
    assert(evalLow.matched === false, 'Step 12: evaluateRule should return matched: false for temperature 70 > 80');

    // Process via RuleEngine pipeline
    await processTelemetry(telemetryLow);
    assert(triggeredEvents.length === 0, 'Step 12: No event should be emitted for non-matching telemetry');
    console.log('Result: FALSE → No trigger');
    console.log('✅ Step 12 Passed Successfully!\n');

    // Cleanup mock
    ruleService.getActiveRules = originalGetActiveRules;
    ruleEventEmitter.off('rule:triggered', triggerHandler);

    console.log('🎉 STEPS 11 & 12 TESTED AND VERIFIED SUCCESSFULLY!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Test failed:', err);
    process.exit(1);
  }
}

runSteps11And12Tests();
