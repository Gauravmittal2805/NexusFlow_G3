/**
 * Alert System Test — Steps 1–11
 * Run: node Backend/tests/alertSystemTest.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const http     = require('http');
const { Server } = require('socket.io');
const { io: ioClient } = require('socket.io-client');

const app            = require('../app');
const Alert          = require('../models/Alert');
const Rule           = require('../models/Rule');
const User           = require('../models/User');
const alertService   = require('../services/alertService');
const { processTelemetry, ruleEventEmitter } = require('../services/ruleEngineService');
const { initWebSocket } = require('../websocket/telemetrySocket');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/NexusFlow';

// ─── Helper: raw HTTP request ─────────────────────────────────────────────────
function request(server, method, path, body = null) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req  = http.request(
      {
        hostname: '127.0.0.1',
        port:     server.address().port,
        path,
        method,
        headers: { 'Content-Type': 'application/json' },
      },
      (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end',  () => {
          try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
          catch { resolve({ status: res.statusCode, body: raw }); }
        });
      }
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

// ─── Main test runner ─────────────────────────────────────────────────────────
async function runTests() {
  console.log('\n🧪 Starting Alert System Tests (Steps 1–11)\n');
  let passed = 0;
  let failed = 0;

  // ── DB connect ──
  try {
    await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 5000 });
    console.log('✅ Connected to MongoDB\n');
  } catch (err) {
    console.error('❌ MongoDB connection failed:', err.message);
    process.exit(1);
  }

  // Cleanup leftover test data
  await Alert.deleteMany({ ruleName: /^TEST_ALERT_/ });
  await Rule.deleteMany({ name: /^TEST_ALERT_/ });
  await User.deleteMany({ email: /alert_test_/ });

  // Create a test user + rule
  const testUser = await User.create({
    name:     'Alert Tester',
    email:    `alert_test_${Date.now()}@nexusflow.io`,
    password: 'password123',
  });

  const testRule = await Rule.create({
    name:      'TEST_ALERT_High Temperature',
    isActive:  true,
    createdBy: testUser._id,
    nodes: [
      { id: 'sensor1',    type: 'sensor',    data: { sensorId: 'TURBINE-001' } },
      { id: 'condition1', type: 'condition', data: { field: 'temperature', operator: '>', value: 80 } },
      { id: 'alert1',     type: 'alert',     data: { action: 'SMS', severity: 'HIGH' } },
    ],
    edges: [
      { source: 'sensor1',    target: 'condition1' },
      { source: 'condition1', target: 'alert1'     },
    ],
  });

  // ── Spin up test HTTP + Socket.IO server ──
  const server = http.createServer(app);
  const io     = new Server(server, { cors: { origin: '*' } });
  initWebSocket(io);
  await new Promise((r) => server.listen(0, r));
  const basePort = server.address().port;
  console.log(`📡 Test server on port ${basePort}\n`);

  try {
    // ── TEST 1: Alert Model & MongoDB collection ───────────────────────────
    console.log('--- Test 1: Alert Model & Collection ---');
    const a = await Alert.create({
      ruleId:   testRule._id,
      ruleName: 'TEST_ALERT_Model Check',
      sensorId: 'TURBINE-999',
      message:  'Test model creation',
      severity: 'LOW',
      action:   'EMAIL',
    });
    if (!a._id) throw new Error('Alert _id missing after create()');
    console.log('✅ Test 1 Passed: Alert document created with _id:', a._id.toString());
    passed++;

    // ── TEST 2: Dynamic Message Generation ───────────────────────────────
    console.log('\n--- Test 2: Dynamic Message Generation ---');
    const conditionData = { field: 'temperature', operator: '>', value: 80 };
    const telemetry     = { sensorId: 'TURBINE-001', temperature: 82.4, timestamp: new Date() };
    const msg = alertService.generateAlertMessage('TURBINE-001', telemetry, conditionData);
    console.log('   Generated message:', msg);
    if (!msg.includes('TURBINE-001') || !msg.includes('80') || !msg.includes('exceeded')) {
      throw new Error('Message missing expected content');
    }
    console.log('✅ Test 2 Passed: Dynamic message generated correctly');
    passed++;

    // ── TEST 3: processRuleTrigger — severity, action, alert node parsing ─
    console.log('\n--- Test 3: Severity & Action from Alert Node ---');
    const alert3 = await alertService.processRuleTrigger(testRule, {
      sensorId:    'TURBINE-001',
      temperature: 85.0,
      timestamp:   new Date(),
    });
    if (!alert3) throw new Error('Alert was not created (cooldown hit too early?)');
    if (alert3.severity !== 'HIGH') throw new Error(`Expected severity HIGH, got ${alert3.severity}`);
    if (alert3.action   !== 'SMS')  throw new Error(`Expected action SMS, got ${alert3.action}`);
    if (alert3.status   !== 'unread') throw new Error('Status should be unread');
    console.log('✅ Test 3 Passed: severity=HIGH, action=SMS, status=unread');
    passed++;

    // ── TEST 4: GET /api/alerts ───────────────────────────────────────────
    console.log('\n--- Test 4: GET /api/alerts ---');
    const r4 = await request(server, 'GET', '/api/alerts');
    if (r4.status !== 200 || !r4.body.success) throw new Error(`Unexpected status ${r4.status}`);
    if (!Array.isArray(r4.body.alerts))         throw new Error('alerts field not an array');
    console.log(`✅ Test 4 Passed: GET /api/alerts returned ${r4.body.count} alert(s)`);
    passed++;

    // ── TEST 5: GET /api/alerts/:id ───────────────────────────────────────
    console.log('\n--- Test 5: GET /api/alerts/:id ---');
    const alertId = alert3._id.toString();
    const r5 = await request(server, 'GET', `/api/alerts/${alertId}`);
    if (r5.status !== 200 || !r5.body.success) throw new Error(`Unexpected status ${r5.status}`);
    if (r5.body.alert._id.toString() !== alertId) throw new Error('Returned wrong alert');
    console.log('✅ Test 5 Passed: GET /api/alerts/:id returned correct alert');
    passed++;

    // ── TEST 6: PATCH /api/alerts/:id/read ───────────────────────────────
    console.log('\n--- Test 6: PATCH /api/alerts/:id/read ---');
    const r6 = await request(server, 'PATCH', `/api/alerts/${alertId}/read`);
    if (r6.status !== 200 || !r6.body.success) throw new Error(`Unexpected status ${r6.status}`);
    if (r6.body.alert.status !== 'read') throw new Error('Alert status not updated to read');
    console.log('✅ Test 6 Passed: Alert marked as read');
    passed++;

    // ── TEST 7: Socket.IO — alert:new event ───────────────────────────────
    console.log('\n--- Test 7: Socket.IO alert:new broadcast ---');
    const receivedAlerts = [];
    const socketClient = ioClient(`http://127.0.0.1:${basePort}`, {
      transports: ['websocket'],
    });
    await new Promise((res, rej) => {
      socketClient.on('connect', res);
      socketClient.on('connect_error', rej);
      setTimeout(() => rej(new Error('Socket connect timeout')), 3000);
    });

    socketClient.on('alert:new', (data) => receivedAlerts.push(data));

    // Advance cooldown key so new alert fires
    const fakeRule = {
      ...testRule.toObject(),
      _id: new mongoose.Types.ObjectId(), // different ruleId bypasses cooldown
    };
    await alertService.processRuleTrigger(fakeRule, {
      sensorId:    'TURBINE-001',
      temperature: 87.3,
      timestamp:   new Date(),
    });

    // Wait briefly for Socket.IO delivery
    await new Promise((r) => setTimeout(r, 500));
    socketClient.disconnect();

    if (receivedAlerts.length === 0) throw new Error('No alert:new event received on Socket.IO');
    console.log('✅ Test 7 Passed: alert:new event received via Socket.IO');
    passed++;

    // ── TEST 8: Duplicate / Cooldown Prevention ───────────────────────────
    console.log('\n--- Test 8: Duplicate Alert Cooldown Prevention ---');
    const countBefore = await Alert.countDocuments({ ruleId: testRule._id.toString() });

    // Fire 5 more telemetry hits — all should be suppressed by cooldown
    for (let i = 0; i < 5; i++) {
      await alertService.processRuleTrigger(testRule, {
        sensorId:    'TURBINE-001',
        temperature: 82 + i,
        timestamp:   new Date(),
      });
    }
    const countAfter = await Alert.countDocuments({ ruleId: testRule._id.toString() });
    // countAfter should equal countBefore (Test 3 already created 1; no new ones during cooldown)
    if (countAfter !== countBefore) {
      throw new Error(`Cooldown failed: expected ${countBefore} alerts, got ${countAfter}`);
    }
    console.log(`✅ Test 8 Passed: Cooldown suppressed all 5 duplicate alerts (count stayed at ${countBefore})`);
    passed++;

    // ── TEST 9: GET /api/alerts — 404 for unknown ID ──────────────────────
    console.log('\n--- Test 9: GET /api/alerts/:id → 404 for unknown ID ---');
    const fakeId = new mongoose.Types.ObjectId();
    const r9 = await request(server, 'GET', `/api/alerts/${fakeId}`);
    if (r9.status !== 404) throw new Error(`Expected 404, got ${r9.status}`);
    console.log('✅ Test 9 Passed: 404 returned for non-existent alert');
    passed++;

    // ── TEST 10: Full pipeline via processTelemetry (rule engine) ─────────
    console.log('\n--- Test 10: Full pipeline via processTelemetry → alert created ---');
    let pipelineAlertFired = false;
    ruleEventEmitter.once('rule:triggered', () => { pipelineAlertFired = true; });

    // Use a unique sensorId to avoid cooldown collision
    const pipelineRule = await Rule.create({
      name:      'TEST_ALERT_Pipeline Check',
      isActive:  true,
      createdBy: testUser._id,
      nodes: [
        { id: 'sP', type: 'sensor',    data: { sensorId: 'TURBINE-002' } },
        { id: 'cP', type: 'condition', data: { field: 'temperature', operator: '>', value: 60 } },
        { id: 'aP', type: 'alert',     data: { action: 'EMAIL', severity: 'MEDIUM' } },
      ],
      edges: [{ source: 'sP', target: 'cP' }],
    });

    await processTelemetry({
      sensorId:    'TURBINE-002',
      temperature: 75.0,
      timestamp:   new Date(),
    });

    const pipelineAlert = await Alert.findOne({ ruleName: 'TEST_ALERT_Pipeline Check' });
    if (!pipelineAlert)          throw new Error('No alert created by processTelemetry');
    if (!pipelineAlertFired)     throw new Error('rule:triggered event not emitted');
    if (pipelineAlert.severity !== 'MEDIUM') throw new Error(`Expected MEDIUM severity, got ${pipelineAlert.severity}`);
    if (pipelineAlert.action   !== 'EMAIL')  throw new Error(`Expected EMAIL action, got ${pipelineAlert.action}`);
    console.log('✅ Test 10 Passed: Full pipeline created alert with severity=MEDIUM, action=EMAIL');
    passed++;

  } catch (err) {
    console.error('\n❌ Test FAILED:', err.message);
    failed++;
  } finally {
    // Cleanup
    await Alert.deleteMany({ ruleName: /^TEST_ALERT_/ });
    await Rule.deleteMany({ name: /^TEST_ALERT_/ });
    await User.deleteMany({ email: /alert_test_/ });

    server.close();
    await mongoose.connection.close();

    console.log(`\n${'─'.repeat(50)}`);
    console.log(`Results: ${passed} passed, ${failed} failed`);
    if (failed === 0) {
      console.log('\n🎉 ALL ALERT SYSTEM TESTS PASSED!');
    } else {
      console.log('\n⚠️  Some tests failed — see above for details.');
    }
    process.exit(failed > 0 ? 1 : 0);
  }
}

runTests();
