require('dotenv').config();
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const app = require('../app');
const Rule = require('../models/Rule');
const User = require('../models/User');
const { getActiveRules } = require('../services/ruleService');
const { processTelemetry, ruleEventEmitter } = require('../services/ruleEngineService');

const JWT_SECRET = process.env.JWT_SECRET || 'supersecretjwtkey123';
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/NexusFlow';

async function runRuleEngineTests() {
  console.log('🧪 Starting Rule Engine CRUD & Telemetry Matching Tests (Steps 1-10)...\n');

  try {
    await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 5000 });
    console.log('✅ Connected to MongoDB for testing');
  } catch (err) {
    console.error('❌ Failed to connect to MongoDB:', err.message);
    process.exit(1);
  }

  try {
    // Clean up test records
    await Rule.deleteMany({ name: /^ENGINE_TEST_/ });
    await User.deleteMany({ email: /engine_test_/ });

    // Create test user
    const testUser = await User.create({
      name: 'Engine User',
      email: `engine_test_${Date.now()}@example.com`,
      password: 'password123',
    });
    const token = jwt.sign({ userId: testUser._id.toString() }, JWT_SECRET);

    // HTTP Helper
    const makeRequest = (server, method, path, body = null) => {
      return new Promise((resolve, reject) => {
        const http = require('http');
        const req = http.request(
          {
            hostname: '127.0.0.1',
            port: server.address().port,
            path,
            method,
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
          },
          (res) => {
            let data = '';
            res.on('data', (chunk) => (data += chunk));
            res.on('end', () => {
              try {
                resolve({ status: res.statusCode, body: JSON.parse(data) });
              } catch (e) {
                resolve({ status: res.statusCode, body: data });
              }
            });
          }
        );
        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
      });
    };

    const server = app.listen(0);
    const port = server.address().port;
    console.log(`📡 Test server running on port ${port}\n`);

    // --- STEP 1 TEST: Create & Update Rule (PUT /api/rules/:id) ---
    const initialGraph = {
      name: 'ENGINE_TEST_Turbine Alert',
      description: 'Initial alert',
      nodes: [
        { id: 'sensor1', type: 'sensor', data: { sensorId: 'TURBINE-001' } },
        { id: 'condition1', type: 'condition', data: { field: 'temperature', operator: '>', value: 80 } },
      ],
      edges: [{ source: 'sensor1', target: 'condition1' }],
    };

    const createRes = await makeRequest(server, 'POST', '/api/rules', initialGraph);
    if (createRes.status !== 201) throw new Error(`Rule creation failed: ${createRes.status}`);
    const ruleId = createRes.body.rule._id;

    // Call PUT /api/rules/:id
    const updatePayload = {
      name: 'ENGINE_TEST_Critical Temperature Alert',
      description: 'Alert when turbine temperature exceeds 90°C',
      isActive: true,
    };
    const updateRes = await makeRequest(server, 'PUT', `/api/rules/${ruleId}`, updatePayload);

    if (updateRes.status !== 200 || updateRes.body.success !== true) {
      throw new Error(`Step 1 Failed: PUT /api/rules/:id returned status ${updateRes.status}`);
    }
    if (updateRes.body.message !== 'Rule updated successfully') {
      throw new Error(`Step 1 Failed: Unexpected message '${updateRes.body.message}'`);
    }
    if (updateRes.body.rule.name !== 'ENGINE_TEST_Critical Temperature Alert') {
      throw new Error('Step 1 Failed: Updated name does not match');
    }
    console.log('✅ Step 1 Passed: PUT /api/rules/:id updated rule successfully');

    // --- STEP 3 TEST: Enable / Disable Rule (PATCH /api/rules/:id/status) ---
    const disableRes = await makeRequest(server, 'PATCH', `/api/rules/${ruleId}/status`, { isActive: false });
    if (disableRes.status !== 200 || disableRes.body.success !== true) {
      throw new Error(`Step 3 Failed: Disable status returned ${disableRes.status}`);
    }
    if (disableRes.body.message !== 'Rule disabled successfully') {
      throw new Error(`Step 3 Failed: Unexpected disable message '${disableRes.body.message}'`);
    }
    console.log('✅ Step 3 Passed: PATCH /api/rules/:id/status disabled rule successfully');

    // --- STEP 4 & 5 TEST: getActiveRules() filters out disabled rules ---
    const activeRulesAfterDisable = await getActiveRules();
    const foundDisabledRule = activeRulesAfterDisable.find((r) => r._id.toString() === ruleId);
    if (foundDisabledRule) {
      throw new Error('Step 4 & 5 Failed: Disabled rule was returned by getActiveRules()!');
    }
    console.log('✅ Step 4 & 5 Passed: Disabled rule ignored by getActiveRules()');

    // Enable rule back for matching tests
    const enableRes = await makeRequest(server, 'PATCH', `/api/rules/${ruleId}/status`, { isActive: true });
    if (enableRes.status !== 200 || enableRes.body.message !== 'Rule enabled successfully') {
      throw new Error(`Step 3 Enable Failed: ${enableRes.body.message}`);
    }
    console.log('✅ Step 3 Re-enable Passed: Rule enabled successfully');

    const activeRulesAfterEnable = await getActiveRules();
    const foundActiveRule = activeRulesAfterEnable.find((r) => r._id.toString() === ruleId);
    if (!foundActiveRule) {
      throw new Error('Step 5 Failed: Enabled rule not found by getActiveRules()');
    }
    console.log('✅ Step 5 Passed: getActiveRules() returned active rule');

    // --- STEPS 6-10 TEST: Telemetry Stream Matching & Event Emitter ---
    let eventFired = false;
    let matchedPayload = null;

    ruleEventEmitter.once('rule:matched', (evt) => {
      eventFired = true;
      matchedPayload = evt;
    });

    console.log('\n--- Testing Rule Engine Logs (Step 10) ---');
    await processTelemetry({
      sensorId: 'TURBINE-001',
      timestamp: new Date().toISOString(),
      temperature: 88.5,
      pressure: 122,
      humidity: 42,
      rpm: 1820,
    });
    console.log('-------------------------------------------\n');

    if (!eventFired || !matchedPayload) {
      throw new Error('Steps 6-9 Failed: rule:matched event was not emitted!');
    }
    if (matchedPayload.ruleId !== ruleId) {
      throw new Error('Step 9 Failed: Event ruleId mismatch');
    }
    if (matchedPayload.sensorId !== 'TURBINE-001') {
      throw new Error('Step 9 Failed: Event sensorId mismatch');
    }
    if (!matchedPayload.evaluationInput || matchedPayload.evaluationInput.telemetry.temperature !== 88.5) {
      throw new Error('Step 8 Failed: Evaluation Input structure invalid');
    }
    console.log('✅ Steps 6-10 Passed: Telemetry matched sensor, built evaluation input & emitted rule:matched event');

    // --- STEP 2 TEST: Delete Rule (DELETE /api/rules/:id) & 404 Check ---
    const deleteRes = await makeRequest(server, 'DELETE', `/api/rules/${ruleId}`);
    if (deleteRes.status !== 200 || deleteRes.body.message !== 'Rule deleted successfully') {
      throw new Error(`Step 2 Failed: Delete returned ${deleteRes.status} ${JSON.stringify(deleteRes.body)}`);
    }

    const nonExistingRes = await makeRequest(server, 'DELETE', `/api/rules/${ruleId}`);
    if (nonExistingRes.status !== 404) {
      throw new Error(`Step 2 Failed: Deleting non-existing rule should return 404, got ${nonExistingRes.status}`);
    }
    console.log('✅ Step 2 Passed: DELETE /api/rules/:id deleted rule & 404 verified for non-existing rule');

    // Cleanup
    await Rule.deleteMany({ name: /^ENGINE_TEST_/ });
    await User.deleteMany({ email: /engine_test_/ });

    server.close();
    await mongoose.connection.close();
    console.log('\n🎉 ALL 10 STEPS IMPLEMENTED & TESTED SUCCESSFULLY!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Test failed with exception:', err);
    process.exit(1);
  }
}

runRuleEngineTests();
