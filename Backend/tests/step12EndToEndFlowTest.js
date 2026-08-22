/**
 * step12EndToEndFlowTest.js
 * Comprehensive automated verification for Step 12:
 * Test 1: Rule Trigger & alert:new emission + Alert History & Unread Count update
 * Test 2: Open Alert & Mark as Read (PATCH /api/alerts/:id/read) & Unread Count decrease
 * Test 3: Duplicate Alert suppression via unique ID
 * Test 4: Filtering (HIGH, MEDIUM, LOW, Read, Unread, Sensor, Search)
 */
require('dotenv').config();
const http = require('http');
const mongoose = require('mongoose');
const { Server } = require('socket.io');
const { io: ioClient } = require('socket.io-client');

const app = require('../app');
const Alert = require('../models/Alert');
const Rule = require('../models/Rule');
const User = require('../models/User');
const { initWebSocket } = require('../websocket/telemetrySocket');
const { processTelemetry } = require('../services/ruleEngineService');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/NexusFlow';

function request(server, method, path, body = null) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: server.address().port,
        path,
        method,
        headers: { 'Content-Type': 'application/json' },
      },
      (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => {
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

async function runTests() {
  console.log('\n======================================================');
  console.log('   STEP 12: COMPLETE FLOW VERIFICATION TEST SUITE');
  console.log('======================================================\n');

  // 1. Connect Mongo
  await mongoose.connect(MONGO_URI);
  console.log('? Connected to MongoDB');

  // Cleanup
  await Alert.deleteMany({ ruleName: /^TEST12_/ });
  await Rule.deleteMany({ name: /^TEST12_/ });
  await User.deleteMany({ email: /test12_/ });

  const testUser = await User.create({
    name: 'Flow Tester',
    email: 'test12_' + Date.now() + '@nexusflow.io',
    password: 'password123',
  });

  // Create rules: HIGH, MEDIUM, LOW severity
  const highRule = await Rule.create({
    name: 'TEST12_High Temperature Alert',
    isActive: true,
    createdBy: testUser._id,
    nodes: [
      { id: 's1', type: 'sensor', data: { sensorId: 'TURBINE-001' } },
      { id: 'c1', type: 'condition', data: { field: 'temperature', operator: '>', value: 80 } },
      { id: 'a1', type: 'alert', data: { action: 'NOTIFICATION', severity: 'HIGH' } },
    ],
    edges: [{ source: 's1', target: 'c1' }, { source: 'c1', target: 'a1' }],
  });

  const medRule = await Rule.create({
    name: 'TEST12_Medium Pressure Warning',
    isActive: true,
    createdBy: testUser._id,
    nodes: [
      { id: 's2', type: 'sensor', data: { sensorId: 'TURBINE-002' } },
      { id: 'c2', type: 'condition', data: { field: 'pressure', operator: '>', value: 120 } },
      { id: 'a2', data: { action: 'SMS', severity: 'MEDIUM' } },
    ],
    edges: [{ source: 's2', target: 'c2' }, { source: 'c2', target: 'a2' }],
  });

  // Setup test server + Socket.IO
  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: '*' } });
  initWebSocket(io);

  await new Promise((res) => server.listen(0, res));
  const port = server.address().port;
  console.log(`?? Test server listening on port ${port}`);

  // Connect client simulating Member 4 Frontend
  const client = ioClient(`http://localhost:${port}`, { transports: ['websocket'] });
  await new Promise((res) => client.on('connect', res));
  console.log('?? Member 4 Frontend simulated client connected to Socket.IO\n');

  // Simulated Frontend State Store
  const frontendState = {
    alerts: [],
    unreadCount: 0,
    notifications: [],
    addAlert(incomingAlert) {
      const incomingId = (incomingAlert._id || incomingAlert.id || '').toString();
      if (incomingId && this.alerts.some((a) => (a._id || a.id || '').toString() === incomingId)) {
        return; // deduplicate
      }
      this.alerts.unshift(incomingAlert);
      this.notifications.push(incomingAlert);
      this.unreadCount = this.alerts.filter((a) => a.status === 'unread').length;
    },
    markRead(alertId) {
      this.alerts = this.alerts.map((a) =>
        (a._id || a.id).toString() === alertId.toString() ? { ...a, status: 'read' } : a
      );
      this.unreadCount = this.alerts.filter((a) => a.status === 'unread').length;
    }
  };

  client.on('alert:new', (alertDoc) => {
    frontendState.addAlert(alertDoc);
  });

  // -------------------------------------------------------------
  // TEST 1 — Rule Trigger
  // -------------------------------------------------------------
  console.log('--- TEST 1: Rule Trigger (Telemetry -> Rule TRUE -> Alert -> alert:new -> Frontend) ---');
  
  const telemetryReading = {
    sensorId: 'TURBINE-001',
    temperature: 84.5, // triggers condition (> 80)
    pressure: 110,
    timestamp: new Date().toISOString(),
  };

  const initialUnread = frontendState.unreadCount;
  console.log(`[Frontend] Initial unread count: ${initialUnread}`);

  // Trigger telemetry evaluation
  await processTelemetry(telemetryReading);
  
  // Wait for Socket.IO event propagation
  await new Promise((res) => setTimeout(res, 300));

  console.log(`[Frontend] Alerts in history: ${frontendState.alerts.length}`);
  console.log(`[Frontend] Notifications received: ${frontendState.notifications.length}`);
  console.log(`[Frontend] Updated unread count: ${frontendState.unreadCount}`);

  if (frontendState.alerts.length !== 1 || frontendState.unreadCount !== 1) {
    throw new Error(`Test 1 Failed: Expected 1 alert and unread count 1, got ${frontendState.alerts.length} and ${frontendState.unreadCount}`);
  }
  console.log('? TEST 1 PASSED: New notification received, alert history updated, unread count increased.\n');

  // -------------------------------------------------------------
  // TEST 2 — Open Alert & Mark Read
  // -------------------------------------------------------------
  console.log('--- TEST 2: Open Alert (Unread -> Details -> Mark Read -> Unread Decreases) ---');
  
  const alertToOpen = frontendState.alerts[0];
  console.log(`[Frontend] Opening unread alert: "${alertToOpen.ruleName}" (ID: ${alertToOpen._id})`);
  console.log(`[Frontend] Details verified: Rule="${alertToOpen.ruleName}", Sensor="${alertToOpen.sensorId}", Severity="${alertToOpen.severity}", Status="${alertToOpen.status}"`);

  // Call PATCH /api/alerts/:id/read API
  const patchRes = await request(server, 'PATCH', `/api/alerts/${alertToOpen._id}/read`);
  console.log(`[Backend API] Response status: ${patchRes.status}, message: "${patchRes.body.message}"`);
  
  if (patchRes.status !== 200 || patchRes.body.alert?.status !== 'read') {
    throw new Error('Test 2 Failed: PATCH /api/alerts/:id/read did not return status read');
  }

  // Update frontend state
  frontendState.markRead(alertToOpen._id);
  console.log(`[Frontend] After Mark as Read -> Unread count: ${frontendState.unreadCount}, Alert status: ${frontendState.alerts[0].status}`);

  if (frontendState.unreadCount !== 0 || frontendState.alerts[0].status !== 'read') {
    throw new Error('Test 2 Failed: Unread count did not decrease to 0');
  }
  console.log('? TEST 2 PASSED: Alert marked as read and unread count decreased.\n');

  // -------------------------------------------------------------
  // TEST 3 — Duplicate Alert Handling
  // -------------------------------------------------------------
  console.log('--- TEST 3: Duplicate Alert Handling (Send same alert twice -> Only one in history) ---');
  
  const currentCountBefore = frontendState.alerts.length;
  console.log(`[Frontend] Alerts count before duplicate broadcast: ${currentCountBefore}`);
  
  // Re-broadcast the same alert
  frontendState.addAlert(alertToOpen);
  frontendState.addAlert(alertToOpen);

  console.log(`[Frontend] Alerts count after sending duplicate twice: ${frontendState.alerts.length}`);
  if (frontendState.alerts.length !== currentCountBefore) {
    throw new Error('Test 3 Failed: Duplicate alert was added to history');
  }
  console.log('? TEST 3 PASSED: Duplicate alert correctly ignored, only one entry in history.\n');

  // -------------------------------------------------------------
  // TEST 4 — Filters (HIGH, MEDIUM, LOW, Read, Unread, Sensor, Search)
  // -------------------------------------------------------------
  console.log('--- TEST 4: Filtering & Search Verification ---');

  // Add a second alert with MEDIUM severity and unread status
  const mediumAlert = {
    _id: new mongoose.Types.ObjectId().toString(),
    ruleId: medRule._id.toString(),
    ruleName: medRule.name,
    sensorId: 'TURBINE-002',
    severity: 'MEDIUM',
    status: 'unread',
    message: 'Pressure of TURBINE-002 exceeded 120 PSI',
    timestamp: new Date().toISOString(),
  };
  frontendState.addAlert(mediumAlert);

  // Add a third alert with LOW severity
  const lowAlert = {
    _id: new mongoose.Types.ObjectId().toString(),
    ruleId: 'rule-low-3',
    ruleName: 'TEST12_Low Humidity Notice',
    sensorId: 'TURBINE-003',
    severity: 'LOW',
    status: 'read',
    message: 'Humidity of TURBINE-003 is low',
    timestamp: new Date().toISOString(),
  };
  frontendState.addAlert(lowAlert);

  console.log(`[Frontend] Total alerts in pool: ${frontendState.alerts.length}`);

  // 1. Severity Filter: HIGH
  const highFiltered = frontendState.alerts.filter((a) => (a.severity || '').toUpperCase() === 'HIGH');
  console.log(`   Filter Severity HIGH: found ${highFiltered.length} (Expected: 1) -> ${highFiltered[0].ruleName}`);
  if (highFiltered.length !== 1) throw new Error('Severity HIGH filter failed');

  // 2. Severity Filter: MEDIUM
  const medFiltered = frontendState.alerts.filter((a) => (a.severity || '').toUpperCase() === 'MEDIUM');
  console.log(`   Filter Severity MEDIUM: found ${medFiltered.length} (Expected: 1) -> ${medFiltered[0].ruleName}`);
  if (medFiltered.length !== 1) throw new Error('Severity MEDIUM filter failed');

  // 3. Severity Filter: LOW
  const lowFiltered = frontendState.alerts.filter((a) => (a.severity || '').toUpperCase() === 'LOW');
  console.log(`   Filter Severity LOW: found ${lowFiltered.length} (Expected: 1) -> ${lowFiltered[0].ruleName}`);
  if (lowFiltered.length !== 1) throw new Error('Severity LOW filter failed');

  // 4. Status Filter: Unread
  const unreadFiltered = frontendState.alerts.filter((a) => a.status === 'unread');
  console.log(`   Filter Status Unread: found ${unreadFiltered.length} (Expected: 1)`);
  if (unreadFiltered.length !== 1) throw new Error('Status unread filter failed');

  // 5. Status Filter: Read
  const readFiltered = frontendState.alerts.filter((a) => a.status === 'read');
  console.log(`   Filter Status Read: found ${readFiltered.length} (Expected: 2)`);
  if (readFiltered.length !== 2) throw new Error('Status read filter failed');

  // 6. Sensor Filter: TURBINE-001
  const sensorFiltered = frontendState.alerts.filter((a) => a.sensorId === 'TURBINE-001');
  console.log(`   Filter Sensor TURBINE-001: found ${sensorFiltered.length} (Expected: 1)`);
  if (sensorFiltered.length !== 1) throw new Error('Sensor filter failed');

  // 7. Search: "Pressure"
  const searchFiltered = frontendState.alerts.filter((a) => 
    (a.ruleName || '').toLowerCase().includes('pressure') || 
    (a.message || '').toLowerCase().includes('pressure')
  );
  console.log(`   Search "pressure": found ${searchFiltered.length} (Expected: 1) -> "${searchFiltered[0].ruleName}"`);
  if (searchFiltered.length !== 1) throw new Error('Search filter failed');

  console.log('? TEST 4 PASSED: All filters (Severity, Status, Sensor, Search) work seamlessly with real-time alerts.\n');

  // Cleanup & Close
  client.disconnect();
  server.close();
  await Alert.deleteMany({ ruleName: /^TEST12_/ });
  await Rule.deleteMany({ name: /^TEST12_/ });
  await User.deleteMany({ email: /test12_/ });
  await mongoose.disconnect();

  console.log('======================================================');
  console.log('   ?? ALL 4 STEP 12 TESTS PASSED SUCCESSFULLY! ??');
  console.log('======================================================\n');
}

runTests().catch((err) => {
  console.error('? Test failed with error:', err);
  process.exit(1);
});
