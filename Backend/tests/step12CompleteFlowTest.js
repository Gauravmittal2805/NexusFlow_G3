/**
 * Step 12 — Complete Flow Test
 *
 * Tests:
 *   A) TRUE condition  → Rule triggered → Alert created → MongoDB → Socket.IO alert:new
 *   B) FALSE condition → No alert created
 *   C) Read/Unread    → New alert is unread → PATCH /api/alerts/:id/read → read
 *
 * Run: node Backend/tests/step12CompleteFlowTest.js
 */
require('dotenv').config();
const http     = require('http');
const mongoose = require('mongoose');
const { Server } = require('socket.io');
const { io: ioClient } = require('socket.io-client');

const app                   = require('../app');
const Alert                 = require('../models/Alert');
const Rule                  = require('../models/Rule');
const User                  = require('../models/User');
const { initWebSocket }     = require('../websocket/telemetrySocket');
const { processTelemetry }  = require('../services/ruleEngineService');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/NexusFlow';

// ─── HTTP Helper ─────────────────────────────────────────────────────────────
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

// ─── Visual separator ─────────────────────────────────────────────────────────
const LINE = '═'.repeat(55);
const line = '─'.repeat(55);

// ─── Main ─────────────────────────────────────────────────────────────────────
async function run() {
  console.log(`\n${LINE}`);
  console.log('   Step 12 — Complete Flow Test');
  console.log(`${LINE}\n`);

  // Connect to MongoDB
  try {
    await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 5000 });
    console.log('✅ MongoDB connected\n');
  } catch (err) {
    console.error('❌ MongoDB connection failed:', err.message);
    process.exit(1);
  }

  // Cleanup any leftover data from previous runs
  await Alert.deleteMany({ ruleName: /^S12_/ });
  await Rule.deleteMany({ name: /^S12_/ });
  await User.deleteMany({ email: /s12_test_/ });

  // Create test user + rule  (temperature > 80)
  const testUser = await User.create({
    name:     'Step12 Tester',
    email:    `s12_test_${Date.now()}@nexusflow.io`,
    password: 'password123',
  });

  const testRule = await Rule.create({
    name:      'S12_High Temperature Alert',
    isActive:  true,
    createdBy: testUser._id,
    nodes: [
      { id: 'sn1', type: 'sensor',    data: { sensorId: 'TURBINE-S12' } },
      { id: 'cn1', type: 'condition', data: { field: 'temperature', operator: '>', value: 80 } },
      { id: 'an1', type: 'alert',     data: { action: 'SMS', severity: 'HIGH' } },
    ],
    edges: [
      { source: 'sn1', target: 'cn1' },
      { source: 'cn1', target: 'an1' },
    ],
  });
  const { activateAll } = require('../engine/ruleRuntime');
  await activateAll();
  console.log(`📋 Rule created & activated: "${testRule.name}" (temperature > 80)\n`);

  // Spin up HTTP + Socket.IO test server
  const server = http.createServer(app);
  const io     = new Server(server, { cors: { origin: '*' } });
  initWebSocket(io);
  await new Promise((r) => server.listen(0, r));
  const PORT = server.address().port;
  console.log(`📡 Test server running on port ${PORT}\n`);

  let passed = 0;
  let failed = 0;

  // ════════════════════════════════════════════════════════
  //  TEST A — TRUE Condition
  //  temperature = 82.4  →  82.4 > 80 → TRUE
  // ════════════════════════════════════════════════════════
  console.log(`${LINE}`);
  console.log('  TEST A — TRUE Condition Flow');
  console.log(`${line}`);
  console.log('  Rule      : temperature > 80');
  console.log('  Telemetry : temperature = 82.4');
  console.log('  Expected  : Condition TRUE → Rule Triggered → Alert Created');
  console.log(`${LINE}\n`);

  try {
    // Subscribe a Socket.IO client BEFORE triggering telemetry
    const receivedAlerts = [];
    const socketClient = ioClient(`http://127.0.0.1:${PORT}`, {
      transports: ['websocket'],
    });
    await new Promise((res, rej) => {
      socketClient.on('connect', res);
      socketClient.on('connect_error', rej);
      setTimeout(() => rej(new Error('Socket connect timeout')), 3000);
    });
    console.log(`  🔌 Socket.IO client connected (id: ${socketClient.id})`);
    socketClient.on('alert:new', (data) => {
      receivedAlerts.push(data);
      console.log(`  📥 [Socket.IO] alert:new received ─ ruleName: "${data.ruleName}", severity: ${data.severity}`);
    });

    console.log('\n  ▶ Sending telemetry: { sensorId: "TURBINE-S12", temperature: 82.4 }');

    // Send telemetry through full rule engine pipeline
    await processTelemetry({
      sensorId:    'TURBINE-S12',
      temperature: 82.4,
      timestamp:   new Date(),
    });

    // Wait briefly for async Socket.IO delivery
    await new Promise((r) => setTimeout(r, 500));
    socketClient.disconnect();

    // ── Verify alert was created in MongoDB ──
    const savedAlert = await Alert.findOne({ ruleName: 'S12_High Temperature Alert' }).lean();
    if (!savedAlert) throw new Error('Alert NOT found in MongoDB!');

    console.log('\n  📊 Condition Result  : TRUE  (82.4 > 80)');
    console.log('  🔔 Rule Triggered    : YES');
    console.log(`  🗄️  MongoDB Alert     : _id = ${savedAlert._id}`);
    console.log(`  📝 Message           : ${savedAlert.message}`);
    console.log(`  🔴 Severity          : ${savedAlert.severity}`);
    console.log(`  📬 Action            : ${savedAlert.action}`);
    console.log(`  📖 Status            : ${savedAlert.status}`);
    console.log(`  📡 Socket.IO event   : ${receivedAlerts.length > 0 ? 'alert:new received ✓' : '⚠ not received'}`);

    if (savedAlert.severity !== 'HIGH')    throw new Error(`severity mismatch: ${savedAlert.severity}`);
    if (savedAlert.action   !== 'SMS')     throw new Error(`action mismatch: ${savedAlert.action}`);
    if (savedAlert.status   !== 'unread')  throw new Error(`status should be unread, got ${savedAlert.status}`);
    if (receivedAlerts.length === 0)       throw new Error('Socket.IO alert:new event NOT received');

    console.log('\n  ✅ TEST A PASSED — Full TRUE flow verified\n');
    passed++;

  } catch (err) {
    console.error(`\n  ❌ TEST A FAILED: ${err.message}\n`);
    failed++;
  }

  // ════════════════════════════════════════════════════════
  //  TEST B — FALSE Condition
  //  temperature = 70  →  70 > 80 → FALSE → No Alert
  // ════════════════════════════════════════════════════════
  console.log(`${LINE}`);
  console.log('  TEST B — FALSE Condition Flow');
  console.log(`${line}`);
  console.log('  Rule      : temperature > 80');
  console.log('  Telemetry : temperature = 70');
  console.log('  Expected  : Condition FALSE → No alert created');
  console.log(`${LINE}\n`);

  try {
    const countBefore = await Alert.countDocuments({ ruleName: 'S12_High Temperature Alert' });

    console.log('  ▶ Sending telemetry: { sensorId: "TURBINE-S12", temperature: 70 }');
    await processTelemetry({
      sensorId:    'TURBINE-S12',
      temperature: 70,
      timestamp:   new Date(),
    });

    const countAfter = await Alert.countDocuments({ ruleName: 'S12_High Temperature Alert' });

    console.log('\n  📊 Condition Result  : FALSE  (70 > 80 → NO)');
    console.log(`  🗄️  Alerts before     : ${countBefore}`);
    console.log(`  🗄️  Alerts after      : ${countAfter}`);
    console.log('  🚫 No new alert      : ' + (countAfter === countBefore ? 'CONFIRMED ✓' : 'FAILED — alert was created incorrectly!'));

    if (countAfter !== countBefore) throw new Error(`Alert count changed from ${countBefore} to ${countAfter} — should be equal`);

    console.log('\n  ✅ TEST B PASSED — FALSE condition created no alert\n');
    passed++;

  } catch (err) {
    console.error(`\n  ❌ TEST B FAILED: ${err.message}\n`);
    failed++;
  }

  // ════════════════════════════════════════════════════════
  //  TEST C — Read / Unread Status
  //  New alert → unread → PATCH /api/alerts/:id/read → read
  // ════════════════════════════════════════════════════════
  console.log(`${LINE}`);
  console.log('  TEST C — Read / Unread Status');
  console.log(`${line}`);
  console.log('  Flow: New Alert → unread → PATCH → read');
  console.log(`${LINE}\n`);

  try {
    // Fetch the alert created in Test A
    const alertDoc = await Alert.findOne({ ruleName: 'S12_High Temperature Alert' }).lean();
    if (!alertDoc) throw new Error('Alert from Test A not found — cannot run Test C');

    const alertId = alertDoc._id.toString();
    console.log(`  🔍 Alert ID          : ${alertId}`);
    console.log(`  📖 Initial status    : ${alertDoc.status}`);

    if (alertDoc.status !== 'unread') throw new Error(`Expected initial status "unread", got "${alertDoc.status}"`);
    console.log('  ✔  Confirmed: new alert is UNREAD\n');

    // Call PATCH /api/alerts/:id/read
    console.log('  ▶ PATCH /api/alerts/:id/read');
    const patchRes = await request(server, 'PATCH', `/api/alerts/${alertId}/read`);

    console.log(`\n  🌐 HTTP Response     : ${patchRes.status}`);
    console.log(`  📖 Updated status    : ${patchRes.body?.alert?.status}`);
    console.log(`  💬 Message           : ${patchRes.body?.message}`);

    if (patchRes.status !== 200)                    throw new Error(`HTTP ${patchRes.status} from PATCH`);
    if (!patchRes.body.success)                     throw new Error('success flag was false');
    if (patchRes.body.alert.status !== 'read')      throw new Error(`status not updated to "read"`);

    // Double-check in MongoDB
    const updatedAlert = await Alert.findById(alertId).lean();
    if (updatedAlert.status !== 'read') throw new Error('MongoDB still shows status as "unread" after PATCH');

    console.log('  🗄️  MongoDB verified  : status = "read" ✓');
    console.log('\n  ✅ TEST C PASSED — Read/Unread flow works correctly\n');
    passed++;

  } catch (err) {
    console.error(`\n  ❌ TEST C FAILED: ${err.message}\n`);
    failed++;
  }

  // ─── Summary ────────────────────────────────────────────
  console.log(`${LINE}`);
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log(`${LINE}`);
  if (failed === 0) {
    console.log('\n  🎉 STEP 12 — ALL FLOWS VERIFIED SUCCESSFULLY!\n');
  } else {
    console.log('\n  ⚠️  Some tests failed — see details above.\n');
  }

  // Cleanup
  await Alert.deleteMany({ ruleName: /^S12_/ });
  await Rule.deleteMany({ name: /^S12_/ });
  await User.deleteMany({ email: /s12_test_/ });

  server.close();
  await mongoose.connection.close();
  process.exit(failed > 0 ? 1 : 0);
}

run();
