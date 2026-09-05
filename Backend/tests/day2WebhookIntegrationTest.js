/**
 * day2WebhookIntegrationTest.js
 *
 * NexusFlow Day 2: Webhook Integration & Alert Pipeline Verification Suite
 *
 * Covers:
 *   Step 1  — Verify Day 1 Webhook Integration
 *   Step 2  — Finalize Alert Payload Contract
 *   Step 3  — Connect Multiple Alert Types (Temp + Pressure)
 *   Step 4  — Webhook Failure Handling (Unreachable URL)
 *   Step 5  — Prevent Webhook From Blocking Alerts (Async Non-Blocking)
 *   Step 6  — Webhook Response Logging (Success & Failure)
 *   Step 7  — Test Duplicate Webhook Calls (Deduplication / Cooldown)
 *   Step 8  — Verify Alert Persistence in MongoDB (ruleId, ruleName, sensorId, severity, message, value, timestamp)
 *   Step 9  — Test Alert -> Dashboard Flow (Socket.IO alert:new & rule:triggered)
 *   Step 10 — API & Error Handling Cleanup (400, 404, 200)
 *   Day 2 End-to-End Test — Complete flow from Auth to Rule Trigger to Webhook & Broken Webhook resilience
 */

'use strict';

require('dotenv').config();
const mongoose = require('mongoose');
const http = require('http');
const { Server } = require('socket.io');
const { io: ioClient } = require('socket.io-client');
const jwt = require('jsonwebtoken');

const app = require('../app');
const Alert = require('../models/Alert');
const Rule = require('../models/Rule');
const User = require('../models/User');
const { sendWebhook } = require('../services/webhookService');
const alertService = require('../services/alertService');
const { initWebSocket } = require('../websocket/telemetrySocket');
const { loadRule, startRule, stopRule, deactivateAll } = require('../engine/ruleRuntime');
const { push: pushTelemetry } = require('../compiler/telemetryStream');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/NexusFlow';

// Helper: HTTP Request
function makeRequest(server, method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const postData = body ? JSON.stringify(body) : null;
    const reqHeaders = {
      'Content-Type': 'application/json',
      ...headers,
    };
    if (postData) {
      reqHeaders['Content-Length'] = Buffer.byteLength(postData);
    }
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: server.address().port,
        path,
        method,
        headers: reqHeaders,
      },
      (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(raw) });
          } catch {
            resolve({ status: res.statusCode, body: raw });
          }
        });
      }
    );
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

async function runDay2Tests() {
  console.log('================================================================');
  console.log('   NEXUSFLOW DAY 2: WEBHOOK INTEGRATION & ALERT PIPELINE TESTS  ');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, stepNum, description) {
    if (condition) {
      console.log(`  ✅ PASS [Step ${stepNum}]: ${description}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL [Step ${stepNum}]: ${description}`);
      failed++;
    }
  }

  // Connect MongoDB
  try {
    await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 5000 });
    console.log('  🗄️  Connected to MongoDB\n');
  } catch (err) {
    console.error('❌ MongoDB connection failed:', err.message);
    process.exit(1);
  }

  // Setup mock webhook receiver server
  const receivedWebhooks = [];
  const mockWebhookServer = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/webhook/receiver') {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          receivedWebhooks.push(parsed);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, received: parsed }));
        } catch {
          res.writeHead(400);
          res.end('Invalid JSON');
        }
      });
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  await new Promise((r) => mockWebhookServer.listen(0, '127.0.0.1', r));
  const webhookPort = mockWebhookServer.address().port;
  const mockWebhookUrl = `http://127.0.0.1:${webhookPort}/webhook/receiver`;
  process.env.WEBHOOK_URL = mockWebhookUrl;

  // Spin up test App & Socket.IO server
  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: '*' } });
  initWebSocket(io);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const appPort = server.address().port;

  // Cleanup prior test artifacts
  await Alert.deleteMany({ ruleName: /^DAY2_TEST_/ });
  await Rule.deleteMany({ name: /^DAY2_TEST_/ });
  await User.deleteMany({ email: /day2_test_/ });

  const testUser = await User.create({
    name: 'Day2 Test User',
    email: `day2_test_${Date.now()}@nexusflow.io`,
    password: 'password123',
    role: 'admin',
  });

  try {
    // ─────────────────────────────────────────────────────────────────
    // STEP 1 & 2: Verify Day 1 Webhook Integration & Standard Payload
    // ─────────────────────────────────────────────────────────────────
    console.log('--- Step 1 & 2: Verify Webhook Integration & Standardized Payload ---');
    receivedWebhooks.length = 0;
    alertService._resetCooldownMap();
    alertService._resetConditionStateMap();

    const rule1 = await Rule.create({
      name: 'DAY2_TEST_High Temperature Alert',
      isActive: true,
      createdBy: testUser._id,
      nodes: [
        { id: 's1', type: 'sensor', data: { sensorId: 'TURBINE-001' } },
        { id: 'c1', type: 'condition', data: { field: 'temperature', operator: '>', value: 80 } },
        { id: 'a1', type: 'alert', data: { action: 'SMS', severity: 'HIGH' } },
      ],
      edges: [
        { source: 's1', target: 'c1' },
        { source: 'c1', target: 'a1' },
      ],
    });

    loadRule(rule1);
    startRule(rule1._id.toString());

    // Send telemetry matching Step 1
    pushTelemetry({
      sensorId: 'TURBINE-001',
      temperature: 92,
      pressure: 125,
      humidity: 43,
      rpm: 1840,
      timestamp: new Date().toISOString(),
    });

    // Wait briefly for pipeline & webhook dispatch
    await new Promise((r) => setTimeout(r, 600));

    const alert1 = await Alert.findOne({ ruleName: 'DAY2_TEST_High Temperature Alert' });
    assert(alert1 !== null, '1', 'Rule triggered and Alert created in MongoDB');
    assert(receivedWebhooks.length === 1, '1', 'Webhook called and received at mock endpoint');

    const p = receivedWebhooks[0] || {};
    assert(p.event === 'RULE_TRIGGERED', '2', 'Payload contains event: "RULE_TRIGGERED"');
    assert(p.ruleName === 'DAY2_TEST_High Temperature Alert', '2', 'Payload contains correct ruleName');
    assert(p.ruleId === rule1._id.toString(), '2', 'Payload contains correct ruleId');
    assert(p.sensorId === 'TURBINE-001', '2', 'Payload contains sensorId: "TURBINE-001"');
    assert(p.severity === 'HIGH', '2', 'Payload contains severity: "HIGH"');
    assert(p.value === 92, '2', 'Payload contains triggered reading value: 92');
    assert(typeof p.message === 'string' && p.message.length > 0, '2', 'Payload contains formatted message');
    assert(typeof p.timestamp === 'string', '2', 'Payload contains valid timestamp');

    // ─────────────────────────────────────────────────────────────────
    // STEP 3: Connect Multiple Alert Types (Temp + Pressure)
    // ─────────────────────────────────────────────────────────────────
    console.log('\n--- Step 3: Connect Multiple Alert Types (Temperature & Pressure) ---');
    receivedWebhooks.length = 0;
    alertService._resetCooldownMap();
    alertService._resetConditionStateMap();

    const rule2 = await Rule.create({
      name: 'DAY2_TEST_High Pressure Alert',
      isActive: true,
      createdBy: testUser._id,
      nodes: [
        { id: 's2', type: 'sensor', data: { sensorId: 'TURBINE-002' } },
        { id: 'c2', type: 'condition', data: { field: 'pressure', operator: '>', value: 120 } },
        { id: 'a2', type: 'alert', data: { action: 'EMAIL', severity: 'CRITICAL' } },
      ],
      edges: [
        { source: 's2', target: 'c2' },
        { source: 'c2', target: 'a2' },
      ],
    });

    loadRule(rule2);
    startRule(rule2._id.toString());

    // Send reading on TURBINE-002 with Temp=92 and Pressure=125
    pushTelemetry({
      sensorId: 'TURBINE-002',
      temperature: 92,
      pressure: 125,
      humidity: 43,
      rpm: 1840,
      timestamp: new Date().toISOString(),
    });

    await new Promise((r) => setTimeout(r, 600));

    const pressureAlert = await Alert.findOne({ ruleName: 'DAY2_TEST_High Pressure Alert' });
    assert(pressureAlert !== null, '3', 'Pressure alert created for Pressure > 120');
    assert(receivedWebhooks.length >= 1, '3', 'Webhook dispatched for Pressure alert');
    const pressureWebhook = receivedWebhooks.find((w) => w.ruleName === 'DAY2_TEST_High Pressure Alert');
    assert(pressureWebhook && pressureWebhook.value === 125, '3', 'Pressure webhook received value 125');

    // ─────────────────────────────────────────────────────────────────
    // STEP 4 & 5: Webhook Failure Handling & Non-Blocking Execution
    // ─────────────────────────────────────────────────────────────────
    console.log('\n--- Step 4 & 5: Webhook Failure Handling & Non-Blocking Async Execution ---');
    alertService._resetCooldownMap();
    alertService._resetConditionStateMap();

    // Temporarily point to invalid unreachable webhook URL
    process.env.WEBHOOK_URL = 'http://127.0.0.1:59999/invalid';

    const rule3 = await Rule.create({
      name: 'DAY2_TEST_Failure Resilience Check',
      isActive: true,
      createdBy: testUser._id,
      nodes: [
        { id: 's3', type: 'sensor', data: { sensorId: 'TURBINE-003' } },
        { id: 'c3', type: 'condition', data: { field: 'temperature', operator: '>', value: 70 } },
        { id: 'a3', type: 'alert', data: { action: 'NOTIFICATION', severity: 'HIGH' } },
      ],
      edges: [
        { source: 's3', target: 'c3' },
        { source: 'c3', target: 'a3' },
      ],
    });

    loadRule(rule3);
    startRule(rule3._id.toString());

    const startTime = Date.now();
    // Dispatch telemetry
    pushTelemetry({
      sensorId: 'TURBINE-003',
      temperature: 88,
      timestamp: new Date().toISOString(),
    });

    // Alert creation must happen immediately without waiting for webhook failure
    await new Promise((r) => setTimeout(r, 300));
    const failAlert = await Alert.findOne({ ruleName: 'DAY2_TEST_Failure Resilience Check' });
    const elapsedMs = Date.now() - startTime;

    assert(failAlert !== null, '4', 'Alert was created in MongoDB even though webhook endpoint is offline');
    assert(elapsedMs < 1000, '5', `Webhook dispatch is asynchronous & non-blocking (${elapsedMs}ms)`);

    // Restore valid webhook URL
    process.env.WEBHOOK_URL = mockWebhookUrl;

    // ─────────────────────────────────────────────────────────────────
    // STEP 6: Webhook Response Logging (Success and Failure)
    // ─────────────────────────────────────────────────────────────────
    console.log('\n--- Step 6: Webhook Response Logging ---');
    let capturedLogs = [];
    const originalLog = console.log;
    const originalError = console.error;

    console.log = (...args) => { capturedLogs.push(args.join(' ')); originalLog(...args); };
    console.error = (...args) => { capturedLogs.push(args.join(' ')); originalError(...args); };

    // Test successful webhook log
    await sendWebhook({
      ruleName: 'DAY2_TEST_Log Success Rule',
      ruleId: 'log-rule-1',
      sensorId: 'TURBINE-LOG-1',
      severity: 'HIGH',
      value: 88.5,
    });

    // Test failed webhook log with unreachable URL
    process.env.WEBHOOK_URL = 'http://127.0.0.1:59999/invalid';
    await sendWebhook({
      ruleName: 'DAY2_TEST_Log Fail Rule',
      ruleId: 'log-rule-2',
      sensorId: 'TURBINE-LOG-2',
      severity: 'CRITICAL',
      value: 199,
    });

    process.env.WEBHOOK_URL = mockWebhookUrl;
    console.log = originalLog;
    console.error = originalError;

    const hasSuccessLog = capturedLogs.some((l) => l.includes('Webhook sent successfully') && l.includes('Status: 200'));
    const hasFailLog = capturedLogs.some((l) => l.includes('Webhook failed') && l.includes('Connection Error'));
    const hasSensitiveData = capturedLogs.some((l) => l.includes('Bearer') || l.includes('your_secret_key'));

    assert(hasSuccessLog, '6', 'Logged structured success message with Status 200, Alert, Sensor');
    assert(hasFailLog, '6', 'Logged structured failure message with Connection Error, Alert, delivery status');
    assert(!hasSensitiveData, '6', 'No sensitive credentials or tokens leaked in logs');

    // ─────────────────────────────────────────────────────────────────
    // STEP 7: Test Duplicate Webhook Calls (Deduplication)
    // ─────────────────────────────────────────────────────────────────
    console.log('\n--- Step 7: Duplicate Webhook Call Prevention ---');
    receivedWebhooks.length = 0;
    alertService._resetCooldownMap();
    alertService._resetConditionStateMap();

    const rule4 = await Rule.create({
      name: 'DAY2_TEST_Duplicate Prevention',
      isActive: true,
      createdBy: testUser._id,
      nodes: [
        { id: 's4', type: 'sensor', data: { sensorId: 'TURBINE-004' } },
        { id: 'c4', type: 'condition', data: { field: 'temperature', operator: '>', value: 80 } },
        { id: 'a4', type: 'alert', data: { action: 'SMS', severity: 'HIGH' } },
      ],
      edges: [
        { source: 's4', target: 'c4' },
        { source: 'c4', target: 'a4' },
      ],
    });

    loadRule(rule4);
    startRule(rule4._id.toString());

    // Send 1 telemetry event
    pushTelemetry({
      sensorId: 'TURBINE-004',
      temperature: 95,
      timestamp: new Date().toISOString(),
    });

    await new Promise((r) => setTimeout(r, 600));

    const alertCountBefore = await Alert.countDocuments({ ruleName: 'DAY2_TEST_Duplicate Prevention' });
    const webhookCountBefore = receivedWebhooks.length;

    assert(alertCountBefore === 1, '7', '1 Telemetry Event -> 1 Alert created');
    assert(webhookCountBefore === 1, '7', '1 Telemetry Event -> 1 Webhook dispatched');

    // Send 4 immediate repeat events while in cooldown
    for (let i = 0; i < 4; i++) {
      pushTelemetry({
        sensorId: 'TURBINE-004',
        temperature: 96 + i,
        timestamp: new Date().toISOString(),
      });
    }

    await new Promise((r) => setTimeout(r, 600));

    const alertCountAfter = await Alert.countDocuments({ ruleName: 'DAY2_TEST_Duplicate Prevention' });
    const webhookCountAfter = receivedWebhooks.length;

    assert(alertCountAfter === 1, '7', 'Duplicate alerts suppressed during cooldown (alert count remained 1)');
    assert(webhookCountAfter === 1, '7', 'Duplicate webhooks suppressed during cooldown (webhook count remained 1)');

    // ─────────────────────────────────────────────────────────────────
    // STEP 8: Verify Alert Persistence in MongoDB
    // ─────────────────────────────────────────────────────────────────
    console.log('\n--- Step 8: Verify Alert Persistence in MongoDB ---');
    const persistedAlert = await Alert.findById(alert1._id);
    assert(persistedAlert !== null, '8', 'Alert document retrieved by _id from MongoDB');
    assert(persistedAlert.ruleId !== undefined, '8', 'Alert contains ruleId');
    assert(persistedAlert.ruleName === 'DAY2_TEST_High Temperature Alert', '8', 'Alert contains ruleName');
    assert(persistedAlert.sensorId === 'TURBINE-001', '8', 'Alert contains sensorId');
    assert(persistedAlert.severity === 'HIGH', '8', 'Alert contains severity');
    assert(typeof persistedAlert.message === 'string', '8', 'Alert contains message');
    assert(persistedAlert.value === 92, '8', 'Alert contains triggered value persisted in MongoDB');
    assert(persistedAlert.timestamp instanceof Date, '8', 'Alert contains timestamp Date');

    // ─────────────────────────────────────────────────────────────────
    // STEP 9: Test Alert -> Dashboard Flow (Socket.IO)
    // ─────────────────────────────────────────────────────────────────
    console.log('\n--- Step 9: Test Alert -> Dashboard Real-Time Flow via Socket.IO ---');
    alertService._resetCooldownMap();
    alertService._resetConditionStateMap();

    const socketEvents = [];
    const socketClient = ioClient(`http://127.0.0.1:${appPort}`, { transports: ['websocket'] });
    await new Promise((resolve, reject) => {
      socketClient.on('connect', resolve);
      socketClient.on('connect_error', reject);
      setTimeout(() => reject(new Error('Socket.IO connection timeout')), 3000);
    });

    socketClient.on('alert:new', (data) => socketEvents.push({ event: 'alert:new', data }));
    socketClient.on('rule:triggered', (data) => socketEvents.push({ event: 'rule:triggered', data }));

    const rule5 = await Rule.create({
      name: 'DAY2_TEST_Dashboard Socket Flow',
      isActive: true,
      createdBy: testUser._id,
      nodes: [
        { id: 's5', type: 'sensor', data: { sensorId: 'TURBINE-005' } },
        { id: 'c5', type: 'condition', data: { field: 'temperature', operator: '>', value: 85 } },
        { id: 'a5', type: 'alert', data: { action: 'SMS', severity: 'HIGH' } },
      ],
      edges: [
        { source: 's5', target: 'c5' },
        { source: 'c5', target: 'a5' },
      ],
    });

    loadRule(rule5);
    startRule(rule5._id.toString());

    // Trigger alert
    pushTelemetry({
      sensorId: 'TURBINE-005',
      temperature: 92,
      timestamp: new Date().toISOString(),
    });

    await new Promise((r) => setTimeout(r, 600));
    socketClient.disconnect();

    const alertNewEvent = socketEvents.find((e) => e.event === 'alert:new');
    const ruleTriggeredEvent = socketEvents.find((e) => e.event === 'rule:triggered');

    assert(alertNewEvent !== undefined, '9', 'Socket.IO emitted "alert:new" event for Dashboard');
    assert(alertNewEvent?.data?.value === 92, '9', '"alert:new" payload contains triggered value (92)');
    assert(ruleTriggeredEvent !== undefined, '9', 'Socket.IO emitted "rule:triggered" event for Dashboard');

    // ─────────────────────────────────────────────────────────────────
    // STEP 10: API & Error Handling Cleanup
    // ─────────────────────────────────────────────────────────────────
    console.log('\n--- Step 10: API & Error Handling Cleanup ---');

    // GET /api/alerts -> 200 OK
    const resAll = await makeRequest(server, 'GET', '/api/alerts');
    assert(resAll.status === 200 && Array.isArray(resAll.body.alerts), '10', 'GET /api/alerts returns 200 with alerts array');

    // GET /api/alerts/:id -> 200 OK
    const resSingle = await makeRequest(server, 'GET', `/api/alerts/${alert1._id}`);
    assert(resSingle.status === 200 && resSingle.body.alert._id === alert1._id.toString(), '10', 'GET /api/alerts/:id returns 200 with alert document');

    // GET /api/alerts/:id -> 404 for non-existent valid ObjectId
    const fakeObjectId = new mongoose.Types.ObjectId();
    const res404 = await makeRequest(server, 'GET', `/api/alerts/${fakeObjectId}`);
    assert(res404.status === 404 && res404.body.success === false, '10', 'GET /api/alerts/:id returns 404 for non-existent ID');

    // GET /api/alerts/:id -> 400 for invalid ObjectId format
    const res400 = await makeRequest(server, 'GET', '/api/alerts/invalid-object-id-123');
    assert(res400.status === 400 && res400.body.success === false, '10', 'GET /api/alerts/:id returns 400 for invalid ID format');

    // PATCH /api/alerts/:id/read -> 200 OK
    const resRead = await makeRequest(server, 'PATCH', `/api/alerts/${alert1._id}/read`);
    assert(resRead.status === 200 && resRead.body.alert.status === 'read', '10', 'PATCH /api/alerts/:id/read marks alert as read');

    // PATCH /api/alerts/:id/read -> 400 for invalid ObjectId format
    const resRead400 = await makeRequest(server, 'PATCH', '/api/alerts/malformed-id/read');
    assert(resRead400.status === 400 && resRead400.body.success === false, '10', 'PATCH /api/alerts/:id/read returns 400 for malformed ID');

    // POST /api/webhook/test -> 200 OK
    const resWebhookTest = await makeRequest(server, 'POST', '/api/webhook/test', {
      event: 'RULE_TRIGGERED',
      ruleName: 'Test Webhook Endpoint',
      sensorId: 'TURBINE-TEST',
      value: 100,
    });
    assert(resWebhookTest.status === 200 && resWebhookTest.body.success === true, '10', 'POST /api/webhook/test mock receiver responds 200 OK');

    // ─────────────────────────────────────────────────────────────────
    // DAY 2 END-TO-END TEST
    // ─────────────────────────────────────────────────────────────────
    console.log('\n================================================================');
    console.log('   DAY 2 END-TO-END INTEGRATION TEST');
    console.log('================================================================');

    receivedWebhooks.length = 0;
    alertService._resetCooldownMap();
    alertService._resetConditionStateMap();
    process.env.WEBHOOK_URL = mockWebhookUrl;

    // 1. Create rule: Temperature > 80
    const e2eRule = await Rule.create({
      name: 'DAY2_TEST_E2E High Temp',
      isActive: true,
      createdBy: testUser._id,
      nodes: [
        { id: 'sE2E', type: 'sensor', data: { sensorId: 'TURBINE-E2E' } },
        { id: 'cE2E', type: 'condition', data: { field: 'temperature', operator: '>', value: 80 } },
        { id: 'aE2E', type: 'alert', data: { action: 'SMS', severity: 'HIGH' } },
      ],
      edges: [
        { source: 'sE2E', target: 'cE2E' },
        { source: 'cE2E', target: 'aE2E' },
      ],
    });

    loadRule(e2eRule);
    startRule(e2eRule._id.toString());

    // 2. Send Temperature = 75 (Below threshold)
    console.log('  -> Sending temperature = 75 (Below threshold)...');
    pushTelemetry({
      sensorId: 'TURBINE-E2E',
      temperature: 75,
      timestamp: new Date().toISOString(),
    });
    await new Promise((r) => setTimeout(r, 400));

    const belowThresholdAlert = await Alert.findOne({ ruleName: 'DAY2_TEST_E2E High Temp' });
    assert(belowThresholdAlert === null, 'E2E', 'Temp = 75 did NOT trigger alert');
    assert(receivedWebhooks.length === 0, 'E2E', 'Temp = 75 did NOT send webhook');

    // 3. Send Temperature = 92 (Above threshold)
    console.log('  -> Sending temperature = 92 (Above threshold)...');
    pushTelemetry({
      sensorId: 'TURBINE-E2E',
      temperature: 92,
      timestamp: new Date().toISOString(),
    });
    await new Promise((r) => setTimeout(r, 600));

    const aboveThresholdAlert = await Alert.findOne({ ruleName: 'DAY2_TEST_E2E High Temp' });
    assert(aboveThresholdAlert !== null, 'E2E', 'Temp = 92 triggered rule and created alert in MongoDB');
    assert(aboveThresholdAlert?.value === 92, 'E2E', 'Alert stored triggered value (92)');
    assert(receivedWebhooks.length === 1, 'E2E', 'Mock webhook receiver got payload');
    assert(receivedWebhooks[0].ruleName === 'DAY2_TEST_E2E High Temp', 'E2E', 'Webhook payload matches rule name');

    // 4. Intentionally break webhook URL and trigger alert
    console.log('  -> Breaking webhook URL (setting invalid port)...');
    process.env.WEBHOOK_URL = 'http://127.0.0.1:59999/offline-endpoint';
    alertService._resetCooldownMap();

    const brokenWebhookRule = await Rule.create({
      name: 'DAY2_TEST_E2E Broken Webhook Tolerance',
      isActive: true,
      createdBy: testUser._id,
      nodes: [
        { id: 'sOffline', type: 'sensor', data: { sensorId: 'TURBINE-OFFLINE' } },
        { id: 'cOffline', type: 'condition', data: { field: 'temperature', operator: '>', value: 80 } },
        { id: 'aOffline', type: 'alert', data: { action: 'SMS', severity: 'HIGH' } },
      ],
      edges: [
        { source: 'sOffline', target: 'cOffline' },
        { source: 'cOffline', target: 'aOffline' },
      ],
    });

    loadRule(brokenWebhookRule);
    startRule(brokenWebhookRule._id.toString());

    pushTelemetry({
      sensorId: 'TURBINE-OFFLINE',
      temperature: 95,
      timestamp: new Date().toISOString(),
    });
    await new Promise((r) => setTimeout(r, 600));

    const offlineAlert = await Alert.findOne({ ruleName: 'DAY2_TEST_E2E Broken Webhook Tolerance' });
    assert(offlineAlert !== null, 'E2E', 'Alert created in MongoDB despite broken webhook');
    assert(offlineAlert.value === 95, 'E2E', 'Offline alert has correct value (95)');

    // Verify backend is still healthy
    const healthRes = await makeRequest(server, 'GET', '/api/health');
    assert(healthRes.status === 200 && healthRes.body.success === true, 'E2E', 'NexusFlow backend is still running and healthy');

  } catch (err) {
    console.error('\n❌ Test suite encountered an error:', err);
    failed++;
  } finally {
    // Teardown & cleanup
    deactivateAll();
    await Alert.deleteMany({ ruleName: /^DAY2_TEST_/ });
    await Rule.deleteMany({ name: /^DAY2_TEST_/ });
    await User.deleteMany({ email: /day2_test_/ });

    server.close();
    mockWebhookServer.close();
    await mongoose.connection.close();

    console.log(`\n${'─'.repeat(60)}`);
    console.log(`DAY 2 TEST RESULTS: ${passed} passed, ${failed} failed`);
    console.log(`${'─'.repeat(60)}`);
    if (failed === 0) {
      console.log('🎉 ALL DAY 2 WEBHOOK INTEGRATION TESTS PASSED SUCCESSFULLY!\n');
    } else {
      console.log('⚠️ Some tests failed. Please review errors above.\n');
    }
    process.exit(failed > 0 ? 1 : 0);
  }
}

runDay2Tests();
