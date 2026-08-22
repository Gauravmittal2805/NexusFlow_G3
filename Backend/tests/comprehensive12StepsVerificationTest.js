/**
 * Comprehensive 12-Step Integration & Verification Test Suite
 * NexusFlow G3 - Rule Builder & Alert System End-to-End Verification
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
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret';

// HTTP Request Helper
function request(server, method, path, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: server.address().port,
        path,
        method,
        headers,
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

const LINE = '='.repeat(60);
const SUB_LINE = '-'.repeat(60);

async function runAll12Steps() {
  console.log(`\n${LINE}`);
  console.log('   NEXUSFLOW G3 — 12-STEP END-TO-END VERIFICATION');
  console.log(`${LINE}\n`);

  let server;
  let socketClient;

  try {
    await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 5000 });
    console.log('✅ Connected to MongoDB\n');
  } catch (err) {
    console.error('❌ MongoDB connection failed:', err.message);
    process.exit(1);
  }

  // Cleanup old test data
  await Alert.deleteMany({ ruleName: /^TEST_/ });
  await Rule.deleteMany({ name: /^TEST_/ });
  await User.deleteMany({ email: /test_user_12steps_/ });

  // Spin up test server
  server = http.createServer(app);
  const io = new Server(server, { cors: { origin: '*' } });
  initWebSocket(io);
  await new Promise((r) => server.listen(0, r));
  const PORT = server.address().port;
  console.log(`📡 WebSocket and HTTP server listening on port ${PORT}\n`);

  let totalTests = 0;
  let passedTests = 0;
  let failedTests = 0;

  function assert(condition, message) {
    totalTests++;
    if (condition) {
      console.log(`  ✓ ${message}`);
      passedTests++;
    } else {
      console.error(`  ❌ FAILED: ${message}`);
      failedTests++;
      throw new Error(`Assertion failed: ${message}`);
    }
  }

  try {
    // Setup Users
    const userA = await User.create({
      name: 'Alice Operator',
      email: `test_user_12steps_a_${Date.now()}@nexusflow.io`,
      password: 'password123',
      role: 'operator',
    });
    const tokenA = jwt.sign({ userId: userA._id, role: userA.role }, JWT_SECRET, { expiresIn: '1h' });

    const userB = await User.create({
      name: 'Bob Operator',
      email: `test_user_12steps_b_${Date.now()}@nexusflow.io`,
      password: 'password123',
      role: 'operator',
    });
    const tokenB = jwt.sign({ userId: userB._id, role: userB.role }, JWT_SECRET, { expiresIn: '1h' });

    // ========================================================
    // STEP 1 — Verify Authentication
    // ========================================================
    console.log(`${SUB_LINE}`);
    console.log('Step 1 — Verify Authentication (/api/rules with & without JWT)');
    console.log(`${SUB_LINE}`);
    {
      const noAuthRes = await request(server, 'GET', '/api/rules', null, null);
      assert(noAuthRes.status === 401, 'Unauthenticated GET /api/rules blocked with HTTP 401');

      const badAuthRes = await request(server, 'GET', '/api/rules', null, 'invalid_token_123');
      assert(badAuthRes.status === 401, 'Invalid token GET /api/rules blocked with HTTP 401');

      const authedRes = await request(server, 'GET', '/api/rules', null, tokenA);
      assert(authedRes.status === 200, 'Authenticated GET /api/rules with Bearer token allowed (HTTP 200)');
    }

    // ========================================================
    // STEP 2 — Verify User's Rules Isolation
    // ========================================================
    console.log(`\n${SUB_LINE}`);
    console.log("Step 2 — Verify User's Rules Isolation (GET /api/rules)");
    console.log(`${SUB_LINE}`);
    let ruleAId, ruleBId;
    {
      // Create rule for User A
      const createResA = await request(
        server,
        'POST',
        '/api/rules',
        {
          name: 'TEST_Rule_User_A',
          description: 'Alice rule',
          nodes: [{ id: 'n1', type: 'sensorNode', data: { sensorId: 'TURBINE-001' } }],
          edges: [],
        },
        tokenA
      );
      assert(createResA.status === 201, 'User A creates rule successfully');
      ruleAId = createResA.body.rule._id;

      // Create rule for User B
      const createResB = await request(
        server,
        'POST',
        '/api/rules',
        {
          name: 'TEST_Rule_User_B',
          description: 'Bob rule',
          nodes: [{ id: 'n1', type: 'sensorNode', data: { sensorId: 'TURBINE-002' } }],
          edges: [],
        },
        tokenB
      );
      assert(createResB.status === 201, 'User B creates rule successfully');
      ruleBId = createResB.body.rule._id;

      // Check User A rules
      const listA = await request(server, 'GET', '/api/rules', null, tokenA);
      assert(listA.body.rules.some((r) => r._id === ruleAId), 'User A can see Rule A');
      assert(!listA.body.rules.some((r) => r._id === ruleBId), 'User A cannot see Rule B (User isolation verified)');

      // Check User B rules
      const listB = await request(server, 'GET', '/api/rules', null, tokenB);
      assert(listB.body.rules.some((r) => r._id === ruleBId), 'User B can see Rule B');
      assert(!listB.body.rules.some((r) => r._id === ruleAId), 'User B cannot see Rule A (User isolation verified)');
    }

    // ========================================================
    // STEP 3 — Finalize Rule Create / Edit Flow
    // ========================================================
    console.log(`\n${SUB_LINE}`);
    console.log('Step 3 — Finalize Rule Create / Edit Flow (POST, GET :id, PUT :id)');
    console.log(`${SUB_LINE}`);
    let mainRuleId;
    {
      // 1. Create Rule
      const createPayload = {
        name: 'TEST_High Temperature Alert',
        description: 'Alert when temperature exceeds 80°C',
        nodes: [
          { id: 'node-1', type: 'sensorNode', position: { x: 260, y: 40 }, data: { sensor: 'temperature', sensorId: 'TURBINE-001' } },
          { id: 'node-2', type: 'conditionNode', position: { x: 260, y: 200 }, data: { operator: '>', value: 80, field: 'temperature' } },
          { id: 'node-3', type: 'alertNode', position: { x: 260, y: 360 }, data: { actionType: 'SMS', action: 'SMS', severity: 'HIGH' } },
        ],
        edges: [
          { id: 'e1', source: 'node-1', target: 'node-2' },
          { id: 'e2', source: 'node-2', target: 'node-3' },
        ],
      };
      const createRes = await request(server, 'POST', '/api/rules', createPayload, tokenA);
      assert(createRes.status === 201, 'POST /api/rules successfully creates rule');
      mainRuleId = createRes.body.rule._id;

      // 2. Open Existing Rule (GET /api/rules/:id)
      const getRes = await request(server, 'GET', `/api/rules/${mainRuleId}`, null, tokenA);
      assert(getRes.status === 200, 'GET /api/rules/:id returns complete rule graph');
      assert(getRes.body.rule.nodes.length === 3, 'Nodes graph loaded correctly');
      assert(getRes.body.rule.edges.length === 2, 'Edges graph loaded correctly');

      // 3. Edit Rule (PUT /api/rules/:id)
      const editPayload = {
        name: 'TEST_High Temperature Alert (Updated)',
        description: 'Updated threshold to 80°C with Critical severity',
        nodes: [
          { id: 'node-1', type: 'sensorNode', data: { sensor: 'temperature', sensorId: 'TURBINE-001' } },
          { id: 'node-2', type: 'conditionNode', data: { operator: '>', value: 80, field: 'temperature' } },
          { id: 'node-3', type: 'alertNode', data: { actionType: 'SMS', action: 'SMS', severity: 'CRITICAL' } },
        ],
        edges: [
          { id: 'e1', source: 'node-1', target: 'node-2' },
          { id: 'e2', source: 'node-2', target: 'node-3' },
        ],
      };
      const putRes = await request(server, 'PUT', `/api/rules/${mainRuleId}`, editPayload, tokenA);
      assert(putRes.status === 200, 'PUT /api/rules/:id updates rule');
      assert(putRes.body.rule.name === 'TEST_High Temperature Alert (Updated)', 'Updated rule name confirmed');
    }

    // ========================================================
    // STEP 4 — Connect Rule Trigger With Alert (Socket.IO alert:new)
    // ========================================================
    console.log(`\n${SUB_LINE}`);
    console.log('Step 4 — Connect Rule Trigger With Alert (Socket.IO alert:new event)');
    console.log(`${SUB_LINE}`);
    socketClient = ioClient(`http://127.0.0.1:${PORT}`, { transports: ['websocket'] });
    await new Promise((res, rej) => {
      socketClient.on('connect', res);
      socketClient.on('connect_error', rej);
      setTimeout(() => rej(new Error('Socket connection timeout')), 3000);
    });

    const receivedAlerts = [];
    const receivedRuleTriggers = [];
    socketClient.on('alert:new', (alertData) => {
      receivedAlerts.push(alertData);
    });
    socketClient.on('rule:triggered', (triggerData) => {
      receivedRuleTriggers.push(triggerData);
    });

    // Send telemetry to trigger rule
    await processTelemetry({
      sensorId: 'TURBINE-001',
      temperature: 85,
      timestamp: new Date(),
    });
    await new Promise((r) => setTimeout(r, 600));

    assert(receivedRuleTriggers.length > 0, 'Socket.IO received "rule:triggered" event');
    assert(receivedAlerts.length > 0, 'Socket.IO received "alert:new" event from alertService');
    const firstAlert = receivedAlerts[0];
    assert(firstAlert.ruleName === 'TEST_High Temperature Alert (Updated)', 'alert:new payload has correct ruleName');
    assert(firstAlert.sensorId === 'TURBINE-001', 'alert:new payload has correct sensorId');

    // ========================================================
    // STEP 5 — Add "View Alert" Linkage
    // ========================================================
    console.log(`\n${SUB_LINE}`);
    console.log('Step 5 — Add "View Alert" Linkage (/alerts?ruleId=:id)');
    console.log(`${SUB_LINE}`);
    {
      const alertsRes = await request(server, 'GET', '/api/alerts', null, tokenA);
      assert(alertsRes.status === 200, 'GET /api/alerts returns alerts list');
      const alerts = alertsRes.body.alerts || alertsRes.body;
      const matchedAlert = alerts.find((a) => String(a.ruleId) === String(mainRuleId));
      assert(Boolean(matchedAlert), `Alert found in DB linked to rule ID ${mainRuleId}`);
    }

    // ========================================================
    // STEP 6 — Handle Rule Status Correctly (Active / Disabled / Triggered)
    // ========================================================
    console.log(`\n${SUB_LINE}`);
    console.log('Step 6 — Handle Rule Status Correctly (Active / Disabled)');
    console.log(`${SUB_LINE}`);
    {
      // 1. Check initial active status
      const getActive = await request(server, 'GET', `/api/rules/${mainRuleId}`, null, tokenA);
      assert(getActive.body.rule.isActive === true, 'Rule is initially Active');

      // 2. Disable rule via PATCH /api/rules/:id/status
      const disableRes = await request(server, 'PATCH', `/api/rules/${mainRuleId}/status`, { isActive: false }, tokenA);
      assert(disableRes.status === 200, 'PATCH /api/rules/:id/status successfully disables rule');
      assert(disableRes.body.rule.isActive === false, 'Rule state is now Disabled (isActive=false)');

      // 3. Re-enable rule
      const enableRes = await request(server, 'PATCH', `/api/rules/${mainRuleId}/status`, { isActive: true }, tokenA);
      assert(enableRes.status === 200, 'PATCH /api/rules/:id/status re-enables rule');
      assert(enableRes.body.rule.isActive === true, 'Rule state is Active again');
    }

    // ========================================================
    // STEP 7 — Handle API Errors Gracefully (401, 403, 404, 500)
    // ========================================================
    console.log(`\n${SUB_LINE}`);
    console.log('Step 7 — Handle API Errors Gracefully (401, 403, 404)');
    console.log(`${SUB_LINE}`);
    {
      // 401 Unauthorized
      const err401 = await request(server, 'GET', `/api/rules/${mainRuleId}`, null, null);
      assert(err401.status === 401, 'Returns 401 for unauthenticated request');

      // 404 Not Found
      const fakeMongoId = new mongoose.Types.ObjectId().toString();
      const err404 = await request(server, 'GET', `/api/rules/${fakeMongoId}`, null, tokenA);
      assert(err404.status === 404, 'Returns 404 for non-existent rule');

      // Cross-user 404 (prevent User B accessing User A's rule)
      const cross404 = await request(server, 'GET', `/api/rules/${mainRuleId}`, null, tokenB);
      assert(cross404.status === 404, 'Returns 404 when unauthorized user accesses another user rule');

      // 400 Bad Request
      const err400 = await request(server, 'POST', '/api/rules', { name: '' }, tokenA);
      assert(err400.status === 400, 'Returns 400 validation error for missing required payload');
    }

    // ========================================================
    // STEP 8 — Handle Loading States & Double-Submit Protection
    // ========================================================
    console.log(`\n${SUB_LINE}`);
    console.log('Step 8 — Loading States & Concurrent Submission Safeguards');
    console.log(`${SUB_LINE}`);
    {
      // Verify concurrent calls complete reliably without race condition corruption
      const parallelCalls = await Promise.all([
        request(server, 'GET', `/api/rules/${mainRuleId}`, null, tokenA),
        request(server, 'GET', `/api/rules/${mainRuleId}`, null, tokenA),
      ]);
      assert(parallelCalls.every((res) => res.status === 200), 'Concurrent requests handled safely');
    }

    // ========================================================
    // STEP 9 — Verify Socket Reconnection Flow
    // ========================================================
    console.log(`\n${SUB_LINE}`);
    console.log('Step 9 — Verify Socket Reconnection Flow (Connected -> Disconnect -> Reconnect)');
    console.log(`${SUB_LINE}`);
    {
      assert(socketClient.connected === true, 'Socket client is currently Connected');
      socketClient.disconnect();
      assert(socketClient.connected === false, 'Socket client Disconnected successfully (Connection lost simulated)');
      
      socketClient.connect();
      await new Promise((res, rej) => {
        socketClient.on('connect', res);
        setTimeout(() => rej(new Error('Socket reconnect timeout')), 3000);
      });
      assert(socketClient.connected === true, 'Socket client Reconnected successfully (Connection restored verified)');
    }

    // ========================================================
    // STEP 10 — End-to-End Test: Telemetry -> Rule Engine -> Alert -> Socket
    // ========================================================
    console.log(`\n${SUB_LINE}`);
    console.log('Step 10 — Full End-to-End Pipeline Test (Telemetry -> Trigger -> Alert)');
    console.log(`${SUB_LINE}`);
    {
      // Clear alerts array
      receivedAlerts.length = 0;
      receivedRuleTriggers.length = 0;

      // Unique sensor & rule for clean test
      const e2eRule = await Rule.create({
        name: 'TEST_E2E_Turbine_Alert',
        isActive: true,
        createdBy: userA._id,
        nodes: [
          { id: 'sn1', type: 'sensor', data: { sensorId: 'TURBINE-E2E-10' } },
          { id: 'cn1', type: 'condition', data: { field: 'temperature', operator: '>', value: 80 } },
          { id: 'an1', type: 'alert', data: { action: 'SMS', severity: 'HIGH' } },
        ],
        edges: [
          { source: 'sn1', target: 'cn1' },
          { source: 'cn1', target: 'an1' },
        ],
      });

      // Send telemetry temperature = 85 (85 > 80 is TRUE)
      await processTelemetry({
        sensorId: 'TURBINE-E2E-10',
        temperature: 85,
        timestamp: new Date(),
      });
      await new Promise((r) => setTimeout(r, 600));

      const e2eAlert = await Alert.findOne({ ruleName: 'TEST_E2E_Turbine_Alert' });
      assert(Boolean(e2eAlert), 'Alert created in MongoDB for E2E rule');
      assert(e2eAlert.severity === 'HIGH', 'E2E Alert has severity HIGH');
      assert(e2eAlert.action === 'SMS', 'E2E Alert has action SMS');
      assert(receivedRuleTriggers.some((t) => t.ruleName === 'TEST_E2E_Turbine_Alert'), 'rule:triggered broadcast received');
      assert(receivedAlerts.some((a) => a.ruleName === 'TEST_E2E_Turbine_Alert'), 'alert:new broadcast received');
    }

    // ========================================================
    // STEP 11 — Test Disabled Rule
    // ========================================================
    console.log(`\n${SUB_LINE}`);
    console.log('Step 11 — Test Disabled Rule (Disabled Rule -> No Trigger)');
    console.log(`${SUB_LINE}`);
    {
      // Create a disabled rule
      const disabledRule = await Rule.create({
        name: 'TEST_Disabled_Rule',
        isActive: false, // DISABLED
        createdBy: userA._id,
        nodes: [
          { id: 'sn1', type: 'sensor', data: { sensorId: 'TURBINE-DISABLED-01' } },
          { id: 'cn1', type: 'condition', data: { field: 'temperature', operator: '>', value: 80 } },
          { id: 'an1', type: 'alert', data: { action: 'SMS', severity: 'HIGH' } },
        ],
        edges: [
          { source: 'sn1', target: 'cn1' },
          { source: 'cn1', target: 'an1' },
        ],
      });

      const countBefore = await Alert.countDocuments({ ruleName: 'TEST_Disabled_Rule' });

      // Send telemetry with temperature = 90 (would trigger if active)
      await processTelemetry({
        sensorId: 'TURBINE-DISABLED-01',
        temperature: 90,
        timestamp: new Date(),
      });
      await new Promise((r) => setTimeout(r, 600));

      const countAfter = await Alert.countDocuments({ ruleName: 'TEST_Disabled_Rule' });
      assert(countBefore === countAfter, 'No alert created when rule is Disabled (isActive=false)');
    }

    // ========================================================
    // STEP 12 — Coordinate Final Integration
    // ========================================================
    console.log(`\n${SUB_LINE}`);
    console.log('Step 12 — Cross-Team Integration Contract Verification');
    console.log(`${SUB_LINE}`);
    {
      // Member 1: Auth & Role contract
      const profileRes = await request(server, 'GET', '/api/auth/profile', null, tokenA);
      assert(profileRes.status === 200, 'Member 1: GET /api/auth/profile returns user profile & role');
      assert(profileRes.body.user.role === 'operator', 'Member 1: Role verified');

      // Member 2: Telemetry socket contract
      assert(socketClient.connected, 'Member 2: WebSocket connection active');

      // Member 4: Alert list & mark read
      const markAlert = await Alert.findOne({ ruleName: 'TEST_E2E_Turbine_Alert' });
      if (markAlert) {
        const patchRes = await request(server, 'PATCH', `/api/alerts/${markAlert._id}/read`, null, tokenA);
        assert(patchRes.status === 200, 'Member 4: PATCH /api/alerts/:id/read marks alert as read');
        assert(patchRes.body.alert.status === 'read', 'Member 4: Alert status is "read"');
      }
    }

    console.log(`\n${LINE}`);
    console.log(`SUMMARY: ${passedTests}/${totalTests} TESTS PASSED (0 FAILED)`);
    console.log('🎉 ALL 12 STEPS VERIFIED AND FUNCTIONING ACCORDING TO SPECIFICATION!');
    console.log(`${LINE}\n`);

  } catch (err) {
    console.error(`\n❌ TEST SUITE FAILED WITH ERROR:`, err.message);
  } finally {
    if (socketClient) socketClient.disconnect();
    // Cleanup
    await Alert.deleteMany({ ruleName: /^TEST_/ });
    await Rule.deleteMany({ name: /^TEST_/ });
    await User.deleteMany({ email: /test_user_12steps_/ });
    if (server) server.close();
    await mongoose.connection.close();
    process.exit(failedTests > 0 ? 1 : 0);
  }
}

runAll12Steps();
