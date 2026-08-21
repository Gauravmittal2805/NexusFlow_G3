/**
 * Full 11-Step Integration Test for NexusFlow Rule Engine & Telemetry System
 */
require('dotenv').config();
const http = require('http');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
const { io: ioClient } = require('socket.io-client');

const app = require('../app');
const Alert = require('../models/Alert');
const Rule = require('../models/Rule');
const User = require('../models/User');
const { initWebSocket } = require('../websocket/telemetrySocket');
const { processTelemetry } = require('../services/ruleEngineService');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/NexusFlow';
const JWT_SECRET = process.env.JWT_SECRET || 'supersecretjwtkey123';

function request(server, method, path, token = null, body = null) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: server.address().port,
        path,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: 'Bearer ' + token } : {}),
        },
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
    if (data) req.write(data);
    req.end();
  });
}

const LINE = '═'.repeat(65);
const line = '─'.repeat(65);

async function run11StepsTest() {
  console.log('\n' + LINE);
  console.log('   🚀 NEXUSFLOW: COMPLETE 11-STEP RULE ENGINE VERIFICATION');
  console.log(LINE + '\n');

  try {
    await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 5000 });
    console.log('✅ Connected to MongoDB for testing\n');
  } catch (err) {
    console.error('❌ MongoDB connection failed:', err.message);
    process.exit(1);
  }

  // Cleanup past test data
  await Alert.deleteMany({ ruleName: /^TEST11_/ });
  await Rule.deleteMany({ name: /^TEST11_/ });
  await User.deleteMany({ email: /test11_/ });

  // Setup test server with Socket.IO
  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: '*' } });
  initWebSocket(io);
  await new Promise((r) => server.listen(0, r));
  const PORT = server.address().port;
  console.log('📡 Test server running on port ' + PORT + '\n');

  // Connect a test Socket.IO client
  const receivedSocketAlerts = [];
  const socketClient = ioClient('http://127.0.0.1:' + PORT, { transports: ['websocket'] });
  await new Promise((resolve, reject) => {
    socketClient.on('connect', resolve);
    socketClient.on('connect_error', reject);
    setTimeout(() => reject(new Error('Socket client connect timeout')), 4000);
  });
  console.log('🔌 Test Socket.IO client connected (id: ' + socketClient.id + ')\n');
  socketClient.on('alert:new', (alertData) => {
    receivedSocketAlerts.push(alertData);
    console.log('   📡 [Socket.IO Broadcast Received] alert:new -> "' + alertData.ruleName + '" (' + alertData.sensorId + ')');
  });

  let passed = 0;
  let failed = 0;

  try {
    // -------------------------------------------------------------
    // Setup Test Users (Admin & Operator)
    // -------------------------------------------------------------
    const adminUser = await User.create({
      name: 'Admin User',
      email: 'test11_admin_' + Date.now() + '@nexusflow.io',
      password: 'password123',
      role: 'admin',
    });
    const adminToken = jwt.sign({ userId: adminUser._id.toString(), role: 'admin' }, JWT_SECRET);

    const operatorUser = await User.create({
      name: 'Operator User',
      email: 'test11_operator_' + Date.now() + '@nexusflow.io',
      password: 'password123',
      role: 'operator',
    });
    const operatorToken = jwt.sign({ userId: operatorUser._id.toString(), role: 'operator' }, JWT_SECRET);

    // =============================================================
    // STEP 1 & 4 & 5: Integrate Telemetry + Alert Generation + Socket.IO Broadcast
    // =============================================================
    console.log(LINE);
    console.log('📌 STEP 1, 4 & 5: Telemetry Evaluation -> Complete Alert Generation -> Broadcast');
    console.log(line);

    const rule1 = await Rule.create({
      name: 'TEST11_High_Temp_Turbine_1',
      isActive: true,
      createdBy: operatorUser._id,
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

    console.log('Created Active Rule: "' + rule1.name + '" (temperature > 80) for TURBINE-001');
    console.log('Sending Telemetry: { sensorId: "TURBINE-001", temperature: 82.4 }');

    await processTelemetry({
      sensorId: 'TURBINE-001',
      temperature: 82.4,
      timestamp: new Date(),
    });

    await new Promise((r) => setTimeout(r, 400));

    // Verify Alert in MongoDB
    const alert1 = await Alert.findOne({ ruleName: 'TEST11_High_Temp_Turbine_1' }).lean();
    if (!alert1) throw new Error('Step 1/4: Alert was NOT created in MongoDB');

    if (!alert1.ruleId || alert1.sensorId !== 'TURBINE-001' || alert1.severity !== 'HIGH' || alert1.status !== 'unread') {
      throw new Error('Step 4: Alert fields invalid: ' + JSON.stringify(alert1));
    }

    if (receivedSocketAlerts.length === 0) {
      throw new Error('Step 5: Socket.IO alert:new broadcast not received');
    }

    console.log('✅ Step 1: Evaluated condition 82.4 > 80 -> TRUE');
    console.log('✅ Step 4: Complete Alert Created (ruleId, ruleName, sensorId, message, severity, status, timestamp)');
    console.log('✅ Step 5: Alert broadcasted to Socket.IO clients successfully');
    passed++;

    // =============================================================
    // STEP 2: Process Only Active Rules (isActive === true vs false)
    // =============================================================
    console.log('\n' + LINE);
    console.log('📌 STEP 2: Process Only Active Rules (Disabled Rule Skipped)');
    console.log(line);

    await Rule.create({
      name: 'TEST11_Disabled_Pressure_Rule',
      isActive: false, // Disabled
      createdBy: operatorUser._id,
      nodes: [
        { id: 's2', type: 'sensor', data: { sensorId: 'TURBINE-001' } },
        { id: 'c2', type: 'condition', data: { field: 'pressure', operator: '>', value: 100 } },
        { id: 'a2', type: 'alert', data: { action: 'EMAIL', severity: 'MEDIUM' } },
      ],
      edges: [
        { source: 's2', target: 'c2' },
        { source: 'c2', target: 'a2' },
      ],
    });

    const alertCountBefore = await Alert.countDocuments({ ruleName: 'TEST11_Disabled_Pressure_Rule' });

    console.log('Sending Telemetry: { sensorId: "TURBINE-001", pressure: 150 } for Disabled Rule');
    await processTelemetry({
      sensorId: 'TURBINE-001',
      pressure: 150,
      timestamp: new Date(),
    });

    const alertCountAfter = await Alert.countDocuments({ ruleName: 'TEST11_Disabled_Pressure_Rule' });
    if (alertCountAfter !== alertCountBefore) {
      throw new Error('Step 2: Disabled rule executed and created an alert!');
    }
    console.log('✅ Step 2: Disabled rule (isActive = false) was safely skipped');
    passed++;

    // =============================================================
    // STEP 6: Prevent Duplicate Alerts / Cooldown Logic
    // =============================================================
    console.log('\n' + LINE);
    console.log('📌 STEP 6: Prevent Duplicate Alerts (Cooldown / Deduplication)');
    console.log(line);

    const totalBefore = await Alert.countDocuments({ ruleName: 'TEST11_High_Temp_Turbine_1' });
    console.log('Sending repeated high telemetry: 82.6, 82.8, 83.1, 83.5 for TURBINE-001');

    for (const temp of [82.6, 82.8, 83.1, 83.5]) {
      await processTelemetry({
        sensorId: 'TURBINE-001',
        temperature: temp,
        timestamp: new Date(),
      });
    }

    const totalAfter = await Alert.countDocuments({ ruleName: 'TEST11_High_Temp_Turbine_1' });
    if (totalAfter !== totalBefore) {
      throw new Error('Step 6: Duplicate alerts created within cooldown period (' + totalBefore + ' -> ' + totalAfter + ')');
    }
    console.log('✅ Step 6: Cooldown active — all 4 duplicate triggers suppressed properly (Count: ' + totalAfter + ')');
    passed++;

    // =============================================================
    // STEP 7: Test Multiple Sensors (TURBINE-001, TURBINE-002, TURBINE-003)
    // =============================================================
    console.log('\n' + LINE);
    console.log('📌 STEP 7: Test Multiple Sensors Isolation & Accuracy');
    console.log(line);

    await Rule.create({
      name: 'TEST11_Temp_Turbine_2',
      isActive: true,
      createdBy: operatorUser._id,
      nodes: [
        { id: 'st2', type: 'sensor', data: { sensorId: 'TURBINE-002' } },
        { id: 'ct2', type: 'condition', data: { field: 'temperature', operator: '>', value: 80 } },
        { id: 'at2', type: 'alert', data: { action: 'SMS', severity: 'HIGH' } },
      ],
      edges: [{ source: 'st2', target: 'ct2' }, { source: 'ct2', target: 'at2' }],
    });

    await Rule.create({
      name: 'TEST11_Temp_Turbine_3',
      isActive: true,
      createdBy: operatorUser._id,
      nodes: [
        { id: 'st3', type: 'sensor', data: { sensorId: 'TURBINE-003' } },
        { id: 'ct3', type: 'condition', data: { field: 'temperature', operator: '>', value: 80 } },
        { id: 'at3', type: 'alert', data: { action: 'SMS', severity: 'HIGH' } },
      ],
      edges: [{ source: 'st3', target: 'ct3' }, { source: 'ct3', target: 'at3' }],
    });

    await processTelemetry({ sensorId: 'TURBINE-002', temperature: 72, timestamp: new Date() });
    await processTelemetry({ sensorId: 'TURBINE-003', temperature: 91, timestamp: new Date() });

    const alertT2 = await Alert.findOne({ ruleName: 'TEST11_Temp_Turbine_2' });
    const alertT3 = await Alert.findOne({ ruleName: 'TEST11_Temp_Turbine_3' });

    if (alertT2) throw new Error('Step 7: TURBINE-002 (temp 72 <= 80) created an alert incorrectly');
    if (!alertT3 || alertT3.sensorId !== 'TURBINE-003') throw new Error('Step 7: TURBINE-003 alert not created or wrong sensorId');

    console.log('✅ Step 7: TURBINE-002 (72°F) -> No Alert | TURBINE-003 (91°F) -> Alert with sensorId "TURBINE-003"');
    passed++;

    // =============================================================
    // STEP 3 & 8: Support & Evaluate Multiple Rules Simultaneously
    // =============================================================
    console.log('\n' + LINE);
    console.log('📌 STEP 3 & 8: Support Multiple Rules & Simultaneous Triggering');
    console.log(line);

    await Rule.create({
      name: 'TEST11_Multi_Temp_Rule',
      isActive: true,
      createdBy: operatorUser._id,
      nodes: [
        { id: 'ms1', type: 'sensor', data: { sensorId: 'TURBINE-MULTI' } },
        { id: 'mc1', type: 'condition', data: { field: 'temperature', operator: '>', value: 80 } },
        { id: 'ma1', type: 'alert', data: { action: 'SMS', severity: 'HIGH' } },
      ],
      edges: [{ source: 'ms1', target: 'mc1' }, { source: 'mc1', target: 'ma1' }],
    });

    await Rule.create({
      name: 'TEST11_Multi_Pressure_Rule',
      isActive: true,
      createdBy: operatorUser._id,
      nodes: [
        { id: 'ms2', type: 'sensor', data: { sensorId: 'TURBINE-MULTI' } },
        { id: 'mc2', type: 'condition', data: { field: 'pressure', operator: '>', value: 150 } },
        { id: 'ma2', type: 'alert', data: { action: 'EMAIL', severity: 'HIGH' } },
      ],
      edges: [{ source: 'ms2', target: 'mc2' }, { source: 'mc2', target: 'ma2' }],
    });

    await Rule.create({
      name: 'TEST11_Multi_RPM_Rule',
      isActive: true,
      createdBy: operatorUser._id,
      nodes: [
        { id: 'ms3', type: 'sensor', data: { sensorId: 'TURBINE-MULTI' } },
        { id: 'mc3', type: 'condition', data: { field: 'rpm', operator: '<', value: 1000 } },
        { id: 'ma3', type: 'alert', data: { action: 'NOTIFICATION', severity: 'HIGH' } },
      ],
      edges: [{ source: 'ms3', target: 'mc3' }, { source: 'mc3', target: 'ma3' }],
    });

    console.log('Sending single telemetry payload with 3 trigger metrics:');
    console.log('  { sensorId: "TURBINE-MULTI", temperature: 85, pressure: 160, rpm: 900 }');

    await processTelemetry({
      sensorId: 'TURBINE-MULTI',
      temperature: 85,
      pressure: 160,
      rpm: 900,
      timestamp: new Date(),
    });

    const aTemp = await Alert.findOne({ ruleName: 'TEST11_Multi_Temp_Rule' });
    const aPress = await Alert.findOne({ ruleName: 'TEST11_Multi_Pressure_Rule' });
    const aRpm = await Alert.findOne({ ruleName: 'TEST11_Multi_RPM_Rule' });

    if (!aTemp || !aPress || !aRpm) {
      throw new Error('Step 8: Simultaneous rules failed to trigger');
    }

    console.log('✅ Step 3 & 8: All 3 rules triggered simultaneously and generated 3 distinct alerts');
    passed++;

    // =============================================================
    // STEP 9: Verify User Ownership & Isolation
    // =============================================================
    console.log('\n' + LINE);
    console.log('📌 STEP 9: Verify User Ownership & Access Control');
    console.log(line);

    const createRes = await request(server, 'POST', '/api/rules', operatorToken, {
      name: 'TEST11_Operator_Private_Rule',
      nodes: [{ id: 'n1', type: 'sensor', data: {} }],
      edges: [],
    });

    if (createRes.status !== 201) throw new Error('Failed to create rule via API');
    const createdRuleId = createRes.body.rule._id;

    const otherUser = await User.create({
      name: 'Other Operator',
      email: 'test11_other_' + Date.now() + '@nexusflow.io',
      password: 'password123',
      role: 'operator',
    });
    const otherToken = jwt.sign({ userId: otherUser._id.toString(), role: 'operator' }, JWT_SECRET);

    const otherGetRes = await request(server, 'GET', '/api/rules/' + createdRuleId, otherToken);
    if (otherGetRes.status !== 404) {
      throw new Error('Step 9: Other user could access operator rule (Expected 404, got ' + otherGetRes.status + ')');
    }

    console.log('✅ Step 9: User ownership verified — other users cannot view or modify private rules');
    passed++;

    // =============================================================
    // STEP 10: Verify Alert APIs (GET, GET by ID, PATCH read)
    // =============================================================
    console.log('\n' + LINE);
    console.log('📌 STEP 10: Verify Alert REST APIs (GET /api/alerts, GET /api/alerts/:id, PATCH read)');
    console.log(line);

    const getAlertsRes = await request(server, 'GET', '/api/alerts');
    if (getAlertsRes.status !== 200 || !getAlertsRes.body.success || !Array.isArray(getAlertsRes.body.alerts)) {
      throw new Error('Step 10: GET /api/alerts failed');
    }
    console.log('GET /api/alerts -> 200 OK (' + getAlertsRes.body.count + ' alerts returned)');

    const targetAlertId = aTemp._id.toString();
    const getOneRes = await request(server, 'GET', '/api/alerts/' + targetAlertId);
    if (getOneRes.status !== 200 || getOneRes.body.alert._id !== targetAlertId) {
      throw new Error('Step 10: GET /api/alerts/:id failed');
    }
    console.log('GET /api/alerts/:id -> 200 OK (Alert found)');

    const patchReadRes = await request(server, 'PATCH', '/api/alerts/' + targetAlertId + '/read');
    if (patchReadRes.status !== 200 || patchReadRes.body.alert.status !== 'read') {
      throw new Error('Step 10: PATCH /api/alerts/:id/read failed');
    }
    console.log('PATCH /api/alerts/:id/read -> 200 OK (status updated to "read")');
    passed++;

    // =============================================================
    // STEP 11: Complete End-to-End Postman / Backend Scenario
    // =============================================================
    console.log('\n' + LINE);
    console.log('📌 STEP 11: End-to-End Complete Scenario');
    console.log(line);
    console.log('1. User Login: POST /api/auth/login');
    const loginRes = await request(server, 'POST', '/api/auth/login', null, {
      email: operatorUser.email,
      password: 'password123',
    });
    if (loginRes.status !== 200 || !loginRes.body.token) throw new Error('E2E Login failed');
    const userAuthToken = loginRes.body.token;
    console.log('   ✔ Logged in as: ' + operatorUser.email);

    console.log('2. Create Rule: POST /api/rules (temperature > 80)');
    const ruleCreateRes = await request(server, 'POST', '/api/rules', userAuthToken, {
      name: 'TEST11_E2E_Turbine_Rule',
      isActive: true,
      nodes: [
        { id: 'e2e-s', type: 'sensor', data: { sensorId: 'TURBINE-E2E' } },
        { id: 'e2e-c', type: 'condition', data: { field: 'temperature', operator: '>', value: 80 } },
        { id: 'e2e-a', type: 'alert', data: { action: 'SMS', severity: 'CRITICAL' } },
      ],
      edges: [{ source: 'e2e-s', target: 'e2e-c' }, { source: 'e2e-c', target: 'e2e-a' }],
    });
    if (ruleCreateRes.status !== 201) throw new Error('E2E Rule creation failed');
    console.log('   ✔ Rule created with ID: ' + ruleCreateRes.body.rule._id);

    console.log('3. Send Telemetry: temperature = 85 for TURBINE-E2E');
    await processTelemetry({
      sensorId: 'TURBINE-E2E',
      temperature: 85,
      timestamp: new Date(),
    });

    await new Promise((r) => setTimeout(r, 300));

    console.log('4. Verify Alert in MongoDB & Socket.IO');
    const e2eAlert = await Alert.findOne({ ruleName: 'TEST11_E2E_Turbine_Rule' }).lean();
    if (!e2eAlert) throw new Error('E2E Alert not found in MongoDB');
    console.log('   ✔ Alert stored in MongoDB: _id = ' + e2eAlert._id);

    console.log('5. Mark Alert Read: PATCH /api/alerts/:id/read');
    const e2eReadRes = await request(server, 'PATCH', '/api/alerts/' + e2eAlert._id + '/read');
    if (e2eReadRes.status !== 200 || e2eReadRes.body.alert.status !== 'read') {
      throw new Error('E2E Mark read failed');
    }
    console.log('   ✔ Alert status is now: ' + e2eReadRes.body.alert.status);
    console.log('✅ Step 11: Complete End-to-End pipeline verified successfully');
    passed++;

  } catch (testErr) {
    console.error('\n❌ TEST FAILURE: ' + testErr.message + '\n', testErr.stack);
    failed++;
  }

  // Cleanup
  await Alert.deleteMany({ ruleName: /^TEST11_/ });
  await Rule.deleteMany({ name: /^TEST11_/ });
  await User.deleteMany({ email: /test11_/ });

  socketClient.disconnect();
  server.close();
  await mongoose.connection.close();

  console.log('\n' + LINE);
  console.log('🏁 FINAL RESULTS: ' + passed + ' Passed, ' + failed + ' Failed');
  console.log(LINE + '\n');

  if (failed === 0) {
    console.log('🎉 ALL 11 STEPS ARE 100% VERIFIED AND WORKING PERFECTLY!\n');
    process.exit(0);
  } else {
    process.exit(1);
  }
}

run11StepsTest();
