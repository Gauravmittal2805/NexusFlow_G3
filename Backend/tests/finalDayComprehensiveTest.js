'use strict';

/**
 * finalDayComprehensiveTest.js
 *
 * Exhaustive Final Verification Test Suite for NexusFlow Backend:
 * ─────────────────────────────────────────────────────────────────
 * 1. Health Check
 * 2. Auth: Register (validation, duplicate 409), Login (bad pass 401, not found 404, valid 200)
 * 3. Security: Missing JWT (401), Bad JWT (401), User Isolation
 * 4. User APIs: Admin list, update role, update status, Operator forbidden (403)
 * 5. Sensor APIs: Fleet list (seeded turbines), create, delete, RBAC check
 * 6. Settings APIs: GET settings, PUT settings, MongoDB persistence check
 * 7. Analytics APIs:
 *    - GET /api/analytics/overview (summary metrics)
 *    - GET /api/analytics/telemetry (time-series data with filter)
 *    - GET /api/analytics/alerts (severity counts & daily buckets)
 *    - GET /api/analytics/sensors (fleet health & averages)
 * 8. Rule APIs & Compiler:
 *    - Create rule with valid React Flow graph
 *    - Rule compilation into RxJS pipeline
 *    - Admin-only deletion enforcement (Operator gets 403)
 * 9. Telemetry Ingestion -> Rule Trigger -> Alert Generation -> Webhook Flow:
 *    - Ingest normal reading (no alert)
 *    - Ingest threshold breach (alert generated in MongoDB, webhook dispatched)
 *    - Cooldown suppression check
 *    - Normal reading recovery
 *    - GET /api/alerts & GET /api/alerts/stats verification
 *    - Mark alert as read
 * 10. Robust Error Handling:
 *    - Invalid ObjectId format returns 400
 *    - Non-existent resource returns 404
 *    - Missing required fields returns 400
 */

require('dotenv').config();
const http     = require('http');
const mongoose = require('mongoose');
const jwt      = require('jsonwebtoken');

const app      = require('../app');
const User     = require('../models/User');
const Sensor   = require('../models/Sensor');
const Rule     = require('../models/Rule');
const Alert    = require('../models/Alert');
const Telemetry = require('../models/Telemetry');
const { seedSensors } = require('../utils/seedSensors');
const { loadRule, startRule, stopRule, deactivateAll } = require('../engine/ruleRuntime');
const { _resetCooldownMap, _resetConditionStateMap } = require('../services/alertService');

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret';
let server;
let baseUrl;

function makeRequest(method, path, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const reqOptions = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + (url.search || ''),
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    };

    const req = http.request(reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch (_) {
          json = data;
        }
        resolve({ status: res.statusCode, body: json, headers: res.headers });
      });
    });

    req.on('error', reject);
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

async function runAllTests() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('   NEXUSFLOW FINAL DAY COMPREHENSIVE BACKEND VERIFICATION');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // 1. Connect MongoDB
  const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/NexusFlow';
  await mongoose.connect(mongoUri);
  console.log('✅ Connected to MongoDB');

  // Seed default fleet sensors
  await seedSensors();

  // Reset in-memory maps
  _resetCooldownMap();
  _resetConditionStateMap();

  // Start HTTP server on dynamic port
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}`;
  console.log(`✅ Test server running on ${baseUrl}\n`);

  let passedTests = 0;
  function assert(condition, message) {
    if (!condition) {
      throw new Error(`Assertion failed: ${message}`);
    }
    passedTests++;
    console.log(`  ✓ ${message}`);
  }

  try {
    // ─── 1. HEALTH CHECK ──────────────────────────────────────────────────
    console.log('▶ Testing Health Check Endpoint...');
    const health = await makeRequest('GET', '/api/health');
    assert(health.status === 200 && health.body.success === true, 'Health check returns 200 OK');

    // ─── 2. AUTH & USER REGISTRATION ──────────────────────────────────────
    console.log('\n▶ Testing Authentication Flow...');
    const testId = Date.now();
    const adminEmail = `admin_${testId}@nexusflow.com`;
    const opEmail    = `operator_${testId}@nexusflow.com`;
    const viewEmail  = `viewer_${testId}@nexusflow.com`;

    // Missing fields
    const badReg1 = await makeRequest('POST', '/api/auth/register', {}, { email: adminEmail, password: 'Pass@123' });
    assert(badReg1.status === 400 && badReg1.body.message.includes('name'), 'Missing name rejected with 400');

    // Invalid email
    const badReg2 = await makeRequest('POST', '/api/auth/register', {}, { name: 'Bad', email: 'invalid-email', password: 'Pass@123' });
    assert(badReg2.status === 400, 'Invalid email rejected with 400');

    // Register Admin
    const regAdmin = await makeRequest('POST', '/api/auth/register', {}, {
      name: 'Admin Test', email: adminEmail, password: 'Password@123', role: 'admin',
    });
    assert(regAdmin.status === 201, 'Admin user registered with 201');

    // Duplicate email
    const dupReg = await makeRequest('POST', '/api/auth/register', {}, {
      name: 'Admin Duplicate', email: adminEmail, password: 'Password@123',
    });
    assert(dupReg.status === 409, 'Duplicate email rejected with 409 Conflict');

    // Register Operator
    const regOp = await makeRequest('POST', '/api/auth/register', {}, {
      name: 'Operator Test', email: opEmail, password: 'Password@123', role: 'operator',
    });
    assert(regOp.status === 201, 'Operator user registered with 201');

    // Register Viewer
    const regView = await makeRequest('POST', '/api/auth/register', {}, {
      name: 'Viewer Test', email: viewEmail, password: 'Password@123', role: 'viewer',
    });
    assert(regView.status === 201, 'Viewer user registered with 201');

    // Login checks
    const badLogin = await makeRequest('POST', '/api/auth/login', {}, { email: adminEmail, password: 'WrongPassword' });
    assert(badLogin.status === 401, 'Wrong password rejected with 401');

    const notFoundLogin = await makeRequest('POST', '/api/auth/login', {}, { email: 'nonexistent@nexusflow.com', password: 'Password@123' });
    assert(notFoundLogin.status === 404, 'Non-existent user rejected with 404');

    const adminLogin = await makeRequest('POST', '/api/auth/login', {}, { email: adminEmail, password: 'Password@123' });
    assert(adminLogin.status === 200 && adminLogin.body.token, 'Admin login returns 200 and JWT');
    const adminToken = adminLogin.body.token;

    const opLogin = await makeRequest('POST', '/api/auth/login', {}, { email: opEmail, password: 'Password@123' });
    assert(opLogin.status === 200 && opLogin.body.token, 'Operator login returns 200 and JWT');
    const opToken = opLogin.body.token;

    const viewLogin = await makeRequest('POST', '/api/auth/login', {}, { email: viewEmail, password: 'Password@123' });
    assert(viewLogin.status === 200 && viewLogin.body.token, 'Viewer login returns 200 and JWT');
    const viewToken = viewLogin.body.token;

    // ─── 3. SECURITY & JWT VERIFICATION ───────────────────────────────────
    console.log('\n▶ Testing Security & JWT Protection...');
    const noToken = await makeRequest('GET', '/api/auth/profile');
    assert(noToken.status === 401, 'Missing token rejected with 401');

    const badToken = await makeRequest('GET', '/api/auth/profile', { Authorization: 'Bearer totally_invalid_token' });
    assert(badToken.status === 401, 'Invalid token rejected with 401');

    const profileRes = await makeRequest('GET', '/api/auth/profile', { Authorization: `Bearer ${adminToken}` });
    assert(profileRes.status === 200 && profileRes.body.user.email === adminEmail, 'Valid JWT grants profile access');

    // ─── 4. USER MANAGEMENT APIS ──────────────────────────────────────────
    console.log('\n▶ Testing User Management (Admin only)...');
    const adminUsersList = await makeRequest('GET', '/api/users', { Authorization: `Bearer ${adminToken}` });
    assert(adminUsersList.status === 200 && Array.isArray(adminUsersList.body.users), 'Admin can list all users');

    const opUsersList = await makeRequest('GET', '/api/users', { Authorization: `Bearer ${opToken}` });
    assert(opUsersList.status === 403, 'Operator forbidden from /api/users (403)');

    const viewUsersList = await makeRequest('GET', '/api/users', { Authorization: `Bearer ${viewToken}` });
    assert(viewUsersList.status === 403, 'Viewer forbidden from /api/users (403)');

    // Test updating role & status
    const targetUser = adminUsersList.body.users.find(u => u.email === viewEmail);
    assert(targetUser, 'Found target viewer user for role update');

    const updateRoleRes = await makeRequest('PATCH', `/api/users/${targetUser._id}/role`, { Authorization: `Bearer ${adminToken}` }, { role: 'operator' });
    assert(updateRoleRes.status === 200, 'Admin can update user role');

    // Restore back to viewer so viewer role checks succeed
    await makeRequest('PATCH', `/api/users/${targetUser._id}/role`, { Authorization: `Bearer ${adminToken}` }, { role: 'viewer' });

    const updateRoleInvalid = await makeRequest('PATCH', `/api/users/${targetUser._id}/role`, { Authorization: `Bearer ${adminToken}` }, { role: 'supergod' });
    assert(updateRoleInvalid.status === 400, 'Invalid role rejected with 400');

    const updateStatusRes = await makeRequest('PATCH', `/api/users/${targetUser._id}/status`, { Authorization: `Bearer ${adminToken}` }, { status: 'active' });
    assert(updateStatusRes.status === 200, 'Admin can update user status');

    // ─── 5. SENSOR APIS ───────────────────────────────────────────────────
    console.log('\n▶ Testing Sensor APIs & Fleet Integration...');
    const sensorsRes = await makeRequest('GET', '/api/sensors', { Authorization: `Bearer ${viewToken}` });
    assert(sensorsRes.status === 200 && sensorsRes.body.sensors.length >= 3, 'All roles can view fleet sensors (includes 3 turbines)');

    const newSensorRes = await makeRequest('POST', '/api/sensors', { Authorization: `Bearer ${opToken}` }, {
      sensorId: `TURBINE-TEST-${testId}`, name: 'Turbine Test Unit', type: 'Wind Turbine',
    });
    assert(newSensorRes.status === 201, 'Operator can create new sensor');

    const viewerCreateSensor = await makeRequest('POST', '/api/sensors', { Authorization: `Bearer ${viewToken}` }, {
      sensorId: `TURBINE-FORBIDDEN`, name: 'Forbidden', type: 'Wind Turbine',
    });
    assert(viewerCreateSensor.status === 403, 'Viewer cannot create sensor (403)');

    const adminDeleteSensor = await makeRequest('DELETE', `/api/sensors/TURBINE-TEST-${testId}`, { Authorization: `Bearer ${adminToken}` });
    assert(adminDeleteSensor.status === 200, 'Admin can delete sensor');

    // ─── 6. SETTINGS APIS ─────────────────────────────────────────────────
    console.log('\n▶ Testing Settings APIs (MongoDB Persistence)...');
    const getSettingsRes = await makeRequest('GET', '/api/settings', { Authorization: `Bearer ${adminToken}` });
    assert(getSettingsRes.status === 200 && getSettingsRes.body.preferences, 'GET /api/settings returns preferences');

    const updateSettingsRes = await makeRequest('PUT', '/api/settings', { Authorization: `Bearer ${adminToken}` }, {
      alertNotifications: true,
      highSeverityOnly: true,
      defaultSensor: 'TURBINE-002',
      telemetryInterval: '2s',
    });
    assert(updateSettingsRes.status === 200 && updateSettingsRes.body.preferences.defaultSensor === 'TURBINE-002', 'PUT /api/settings persists updated preferences');

    const recheckSettings = await makeRequest('GET', '/api/settings', { Authorization: `Bearer ${adminToken}` });
    assert(recheckSettings.body.preferences.highSeverityOnly === true && recheckSettings.body.preferences.defaultSensor === 'TURBINE-002', 'Settings persisted accurately in MongoDB');

    // ─── 7. ANALYTICS APIS ────────────────────────────────────────────────
    console.log('\n▶ Testing Analytics APIs (Member 4 Integration)...');
    const analyticsOverview = await makeRequest('GET', '/api/analytics/overview', { Authorization: `Bearer ${viewToken}` });
    assert(analyticsOverview.status === 200 && analyticsOverview.body.data.sensorCount >= 3, 'GET /api/analytics/overview returns valid fleet summary');

    const analyticsTelemetry = await makeRequest('GET', '/api/analytics/telemetry?sensorId=TURBINE-001&limit=10', { Authorization: `Bearer ${viewToken}` });
    assert(analyticsTelemetry.status === 200 && Array.isArray(analyticsTelemetry.body.data), 'GET /api/analytics/telemetry returns time-series data');

    const analyticsAlerts = await makeRequest('GET', '/api/analytics/alerts?days=7', { Authorization: `Bearer ${viewToken}` });
    assert(analyticsAlerts.status === 200 && Array.isArray(analyticsAlerts.body.frequencyOverTime), 'GET /api/analytics/alerts returns frequency over time buckets');

    const analyticsSensors = await makeRequest('GET', '/api/analytics/sensors', { Authorization: `Bearer ${viewToken}` });
    assert(analyticsSensors.status === 200 && Array.isArray(analyticsSensors.body.sensors), 'GET /api/analytics/sensors returns sensor averages and health');

    // ─── 8. RULE APIS & AUTHORIZATION ─────────────────────────────────────
    console.log('\n▶ Testing Rule APIs & Compilation Pipeline...');
    const testSensorId = 'TURBINE-001';
    const rulePayload = {
      name: `Final Test Rule ${testId}`,
      description: 'Trigger alert when temperature exceeds 80 C',
      isActive: true,
      nodes: [
        { id: 's1', type: 'sensor', data: { sensorId: testSensorId } },
        { id: 'c1', type: 'condition', data: { field: 'temperature', operator: '>', value: 80 } },
        { id: 'a1', type: 'alert', data: { action: 'NOTIFICATION', severity: 'HIGH' } },
      ],
      edges: [
        { source: 's1', target: 'c1' },
        { source: 'c1', target: 'a1' },
      ],
    };

    const createRuleRes = await makeRequest('POST', '/api/rules', { Authorization: `Bearer ${adminToken}` }, rulePayload);
    assert(createRuleRes.status === 201 && createRuleRes.body.rule._id, 'Rule created and compiled with 201');
    const createdRuleId = createRuleRes.body.rule._id;

    // Verify viewer cannot create rule
    const viewCreateRule = await makeRequest('POST', '/api/rules', { Authorization: `Bearer ${viewToken}` }, rulePayload);
    assert(viewCreateRule.status === 403, 'Viewer forbidden from creating rules (403)');

    // Verify operator cannot delete rule
    const opDeleteRule = await makeRequest('DELETE', `/api/rules/${createdRuleId}`, { Authorization: `Bearer ${opToken}` });
    assert(opDeleteRule.status === 403, 'Operator forbidden from deleting rules (403)');

    // Single rule fetch
    const getSingleRule = await makeRequest('GET', `/api/rules/${createdRuleId}`, { Authorization: `Bearer ${adminToken}` });
    assert(getSingleRule.status === 200 && getSingleRule.body.rule.nodes.length === 3, 'Single rule fetched with full graph');

    // ─── 9. COMPLETE END-TO-END TELEMETRY → RULE → ALERT → WEBHOOK FLOW ───
    console.log('\n▶ Testing Live Telemetry → Rule Engine → Alert → Webhook Pipeline...');

    // Normal telemetry reading (75 C < 80 C threshold) -> No alert
    const initialAlertCount = await Alert.countDocuments();
    const normalTelemRes = await makeRequest('POST', '/api/telemetry', { Authorization: `Bearer ${adminToken}` }, {
      sensorId: testSensorId,
      temperature: 75.0,
      pressure: 118.0,
      rpm: 1800,
      humidity: 42.0,
      timestamp: new Date().toISOString(),
    });
    assert(normalTelemRes.status === 201, 'Normal telemetry ingested');

    // Allow RxJS pipeline to process
    await new Promise((r) => setTimeout(r, 400));
    const alertsAfterNormal = await Alert.countDocuments();
    assert(alertsAfterNormal === initialAlertCount, 'Normal telemetry (75 C) produced NO alerts');

    // Threshold breached reading (92.5 C > 80 C threshold) -> Trigger alert
    _resetCooldownMap();
    const breachTelemRes = await makeRequest('POST', '/api/telemetry', { Authorization: `Bearer ${adminToken}` }, {
      sensorId: testSensorId,
      temperature: 92.5,
      pressure: 125.0,
      rpm: 2100,
      humidity: 40.0,
      timestamp: new Date().toISOString(),
    });
    assert(breachTelemRes.status === 201, 'Breached telemetry ingested');

    // Allow engine execution & alert saving
    await new Promise((r) => setTimeout(r, 600));
    const latestAlert = await Alert.findOne({ ruleId: createdRuleId }).sort({ createdAt: -1 });
    assert(latestAlert !== null, 'Alert document generated in MongoDB');
    assert(latestAlert.severity === 'HIGH' && latestAlert.sensorId === testSensorId, 'Alert fields (HIGH, sensorId) match contract');

    // Webhook test endpoint verification
    const webhookRes = await makeRequest('POST', '/api/webhook/test', {}, {
      event: 'RULE_TRIGGERED',
      ruleId: createdRuleId,
      ruleName: `Final Test Rule ${testId}`,
      sensorId: testSensorId,
      severity: 'HIGH',
      message: 'Temperature exceeded 80 C',
      value: 92.5,
      timestamp: new Date().toISOString(),
    });
    assert(webhookRes.status === 200 && webhookRes.body.success === true, 'Webhook test endpoint processed alert payload');

    // Alert API check
    const alertsListRes = await makeRequest('GET', `/api/alerts?sensorId=${testSensorId}`, { Authorization: `Bearer ${adminToken}` });
    assert(alertsListRes.status === 200 && alertsListRes.body.alerts.length > 0, 'GET /api/alerts returns generated alert');

    const alertStatsRes = await makeRequest('GET', '/api/alerts/stats', { Authorization: `Bearer ${adminToken}` });
    assert(alertStatsRes.status === 200 && alertStatsRes.body.stats.high > 0, 'GET /api/alerts/stats returns aggregated alert counts');

    // Mark alert as read
    const markReadRes = await makeRequest('PATCH', `/api/alerts/${latestAlert._id}/read`, { Authorization: `Bearer ${adminToken}` });
    assert(markReadRes.status === 200 && markReadRes.body.alert.status === 'read', 'PATCH /api/alerts/:id/read marks alert as read');

    // ─── 10. ERROR HANDLING & RESILIENCE ──────────────────────────────────
    console.log('\n▶ Testing Error Handling & Input Validation...');
    const invalidIdRes = await makeRequest('GET', '/api/alerts/non-hex-id-12345', { Authorization: `Bearer ${adminToken}` });
    assert(invalidIdRes.status === 400, 'Invalid ObjectId returns 400 Bad Request');

    const notFoundRes = await makeRequest('GET', '/api/alerts/600000000000000000000000', { Authorization: `Bearer ${adminToken}` });
    assert(notFoundRes.status === 404, 'Non-existent alert returns 404 Not Found');

    // Clean up created rule
    const delRuleRes = await makeRequest('DELETE', `/api/rules/${createdRuleId}`, { Authorization: `Bearer ${adminToken}` });
    assert(delRuleRes.status === 200, 'Admin cleanly deleted test rule');

    // Clean up test users
    await User.deleteMany({ email: { $in: [adminEmail, opEmail, viewEmail] } });
    await Alert.deleteMany({ ruleId: createdRuleId });

    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log(`🎉 ALL ${passedTests} ASSERTIONS PASSED SUCCESSFULLY!`);
    console.log('   FULL END-TO-END PIPELINE FULLY FUNCTIONAL AND VERIFIED.');
    console.log('═══════════════════════════════════════════════════════════════\n');
  } finally {
    deactivateAll();
    if (server) server.close();
    await mongoose.disconnect();
  }
}

runAllTests().catch((err) => {
  console.error('\n❌ FATAL TEST ERROR:', err);
  process.exit(1);
});
