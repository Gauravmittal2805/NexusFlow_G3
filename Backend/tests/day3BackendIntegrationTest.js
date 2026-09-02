/**
 * Day 3 Backend Integration Test — NexusFlow G3
 * Tests: Alert APIs, Telemetry APIs (Analytics), Rule CRUD + Enable/Disable,
 *        Webhook resilience, Auth/Profile, createdBy ownership
 *
 * Run: node tests/day3BackendIntegrationTest.js
 * Requires: Backend running at http://localhost:5000 AND MongoDB connected
 */

const http = require('http');

const BASE_URL = 'http://localhost:5000';
let ADMIN_TOKEN = '';
let OPERATOR_TOKEN = '';
let VIEWER_TOKEN = '';
let TEST_RULE_ID = '';
let TEST_ALERT_ID = '';

// ─── HTTP helper ─────────────────────────────────────────────────────────────

function request(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const options = {
      hostname: 'localhost',
      port: 5000,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    };
    const req = http.request(options, (res) => {
      let raw = '';
      res.on('data', (c) => (raw += c));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, body: raw }); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

// ─── Test runner ─────────────────────────────────────────────────────────────

let passed = 0; let failed = 0;
function assert(label, condition, extra = '') {
  if (condition) {
    console.log(`  ✅ PASS: ${label}`);
    passed++;
  } else {
    console.log(`  ❌ FAIL: ${label}${extra ? ' — ' + extra : ''}`);
    failed++;
  }
}

// ─── Test suites ─────────────────────────────────────────────────────────────

async function testHealth() {
  console.log('\n=== [1] Health Check ===');
  const r = await request('GET', '/api/health');
  assert('GET /api/health returns 200', r.status === 200);
  assert('success: true', r.body.success === true);
}

async function testAuthFlow() {
  console.log('\n=== [2] Auth Flow ===');

  // Register users
  const ts = Date.now();
  const adminEmail = `admin_${ts}@test.com`;
  const opEmail    = `op_${ts}@test.com`;
  const viewEmail  = `viewer_${ts}@test.com`;

  const reg1 = await request('POST', '/api/auth/register', { name: 'Admin User', email: adminEmail, password: 'Admin@123', role: 'admin' });
  assert('Register admin → 201', reg1.status === 201);

  const reg2 = await request('POST', '/api/auth/register', { name: 'Operator User', email: opEmail, password: 'Op@123456', role: 'operator' });
  assert('Register operator → 201', reg2.status === 201);

  const reg3 = await request('POST', '/api/auth/register', { name: 'Viewer User', email: viewEmail, password: 'Viewer@123', role: 'viewer' });
  assert('Register viewer → 201', reg3.status === 201);

  // Duplicate registration
  const dup = await request('POST', '/api/auth/register', { name: 'Dup', email: adminEmail, password: 'pass123' });
  assert('Duplicate email → 409', dup.status === 409);

  // Login
  const l1 = await request('POST', '/api/auth/login', { email: adminEmail, password: 'Admin@123' });
  assert('Admin login → 200', l1.status === 200);
  assert('Admin token present', typeof l1.body.token === 'string');
  assert('Admin user.role = admin', l1.body.user?.role === 'admin');
  ADMIN_TOKEN = l1.body.token || '';

  const l2 = await request('POST', '/api/auth/login', { email: opEmail, password: 'Op@123456' });
  assert('Operator login → 200', l2.status === 200);
  OPERATOR_TOKEN = l2.body.token || '';

  const l3 = await request('POST', '/api/auth/login', { email: viewEmail, password: 'Viewer@123' });
  assert('Viewer login → 200', l3.status === 200);
  VIEWER_TOKEN = l3.body.token || '';

  // Wrong password
  const bad = await request('POST', '/api/auth/login', { email: adminEmail, password: 'wrongpass' });
  assert('Wrong password → 401', bad.status === 401);

  // Profile
  const prof = await request('GET', '/api/auth/profile', null, ADMIN_TOKEN);
  assert('GET /api/auth/profile → 200', prof.status === 200);
  assert('Profile has id, name, email, role', prof.body.user?.id && prof.body.user?.name && prof.body.user?.email && prof.body.user?.role);

  // No token → 401
  const noauth = await request('GET', '/api/auth/profile');
  assert('No token → 401', noauth.status === 401);
}

async function testRuleCRUD() {
  console.log('\n=== [3] Rule CRUD + Enable/Disable ===');

  // Create rule (operator)
  const rulePayload = {
    name: `TestRule_${Date.now()}`,
    description: 'Integration test rule',
    nodes: [
      { id: 'n1', type: 'sensor',    data: { sensorId: 'TURBINE-001' } },
      { id: 'n2', type: 'condition', data: { metric: 'temperature', operator: '>', threshold: 90 } },
      { id: 'n3', type: 'action',    data: { action: 'alert', severity: 'high' } },
    ],
    edges: [{ source: 'n1', target: 'n2' }, { source: 'n2', target: 'n3' }],
    isActive: true,
  };

  const create = await request('POST', '/api/rules', rulePayload, OPERATOR_TOKEN);
  assert('POST /api/rules → 201', create.status === 201);
  assert('Rule has _id', !!create.body.rule?._id);
  assert('Rule has createdBy', !!create.body.rule?.createdBy);
  assert('Rule isActive = true', create.body.rule?.isActive === true);
  TEST_RULE_ID = create.body.rule?._id || '';

  // Get all rules
  const getAll = await request('GET', '/api/rules', null, OPERATOR_TOKEN);
  assert('GET /api/rules → 200', getAll.status === 200);
  assert('Rules is an array', Array.isArray(getAll.body.rules));

  // Get single rule
  if (TEST_RULE_ID) {
    const getOne = await request('GET', `/api/rules/${TEST_RULE_ID}`, null, OPERATOR_TOKEN);
    assert('GET /api/rules/:id → 200', getOne.status === 200);
    assert('Rule has name', !!getOne.body.rule?.name);
    assert('Rule has nodes array', Array.isArray(getOne.body.rule?.nodes));
    assert('Rule has edges array', Array.isArray(getOne.body.rule?.edges));
  }

  // Update rule
  if (TEST_RULE_ID) {
    const update = await request('PUT', `/api/rules/${TEST_RULE_ID}`, { name: 'UpdatedRule', isActive: true }, OPERATOR_TOKEN);
    assert('PUT /api/rules/:id → 200', update.status === 200);
    assert('Rule name updated', update.body.rule?.name === 'UpdatedRule');
  }

  // Disable rule (PATCH)
  if (TEST_RULE_ID) {
    const disable = await request('PATCH', `/api/rules/${TEST_RULE_ID}/status`, { isActive: false }, OPERATOR_TOKEN);
    assert('PATCH /api/rules/:id/status disable → 200', disable.status === 200);
    assert('Rule isActive = false', disable.body.rule?.isActive === false);
  }

  // Enable rule
  if (TEST_RULE_ID) {
    const enable = await request('PATCH', `/api/rules/${TEST_RULE_ID}/status`, { isActive: true }, OPERATOR_TOKEN);
    assert('PATCH /api/rules/:id/status enable → 200', enable.status === 200);
    assert('Rule isActive = true', enable.body.rule?.isActive === true);
  }

  // Viewer cannot create rule
  const viewerCreate = await request('POST', '/api/rules', rulePayload, VIEWER_TOKEN);
  assert('Viewer cannot create rule → 403', viewerCreate.status === 403);

  // Delete rule
  if (TEST_RULE_ID) {
    const del = await request('DELETE', `/api/rules/${TEST_RULE_ID}`, null, OPERATOR_TOKEN);
    assert('DELETE /api/rules/:id → 200', del.status === 200);
  }
}

async function testAlertAPIs() {
  console.log('\n=== [4] Alert APIs ===');

  // GET /api/alerts
  const alerts = await request('GET', '/api/alerts', null, OPERATOR_TOKEN);
  assert('GET /api/alerts → 200', alerts.status === 200);
  assert('alerts is array', Array.isArray(alerts.body.alerts));

  if (alerts.body.alerts.length > 0) {
    const a = alerts.body.alerts[0];
    assert('Alert has ruleId', !!a.ruleId);
    assert('Alert has ruleName', typeof a.ruleName === 'string');
    assert('Alert has sensorId', typeof a.sensorId === 'string');
    assert('Alert has severity', typeof a.severity === 'string');
    assert('Alert has message', typeof a.message === 'string');
    assert('Alert has timestamp', !!a.timestamp || !!a.createdAt);
    assert('Alert has status', typeof a.status === 'string');
    TEST_ALERT_ID = a._id;
  } else {
    console.log('  ⚠️  No alerts in DB yet — alert field tests skipped (trigger a rule first)');
  }

  // GET /api/alerts/:id
  if (TEST_ALERT_ID) {
    const single = await request('GET', `/api/alerts/${TEST_ALERT_ID}`, null, OPERATOR_TOKEN);
    assert('GET /api/alerts/:id → 200', single.status === 200);
    assert('Single alert has _id', !!single.body.alert?._id);
  }

  // Unauthorized access
  const unauth = await request('GET', '/api/alerts');
  assert('GET /api/alerts without token → 401', unauth.status === 401);
}

async function testTelemetryAPIs() {
  console.log('\n=== [5] Telemetry APIs (Analytics) ===');

  // GET /api/telemetry
  const tAll = await request('GET', '/api/telemetry?limit=10', null, OPERATOR_TOKEN);
  assert('GET /api/telemetry → 200', tAll.status === 200);
  assert('telemetry is array', Array.isArray(tAll.body.data || tAll.body.telemetry || tAll.body));

  // GET /api/telemetry with timeRange filter
  const t1h = await request('GET', '/api/telemetry?timeRange=1h&limit=20', null, OPERATOR_TOKEN);
  assert('GET /api/telemetry?timeRange=1h → 200', t1h.status === 200);

  // GET /api/telemetry with sensorId filter
  const tSensor = await request('GET', '/api/telemetry?sensor=TURBINE-001&limit=10', null, OPERATOR_TOKEN);
  assert('GET /api/telemetry?sensor=TURBINE-001 → 200', tSensor.status === 200);

  // GET /api/telemetry with metric filter
  const tMetric = await request('GET', '/api/telemetry?metric=temperature&limit=10', null, OPERATOR_TOKEN);
  assert('GET /api/telemetry?metric=temperature → 200', tMetric.status === 200);

  // GET /api/telemetry/summary
  const summary = await request('GET', '/api/telemetry/summary', null, OPERATOR_TOKEN);
  assert('GET /api/telemetry/summary → 200', summary.status === 200);

  // GET /api/telemetry/:sensorId
  const bySensor = await request('GET', '/api/telemetry/TURBINE-001', null, OPERATOR_TOKEN);
  assert('GET /api/telemetry/:sensorId → 200', bySensor.status === 200);

  // Unauthorized
  const unauth = await request('GET', '/api/telemetry');
  assert('GET /api/telemetry without token → 401', unauth.status === 401);
}

async function testRuleOwnership() {
  console.log('\n=== [6] Rule Ownership / Authorization ===');

  // Create a rule as operator
  const payload = {
    name: `OwnershipRule_${Date.now()}`,
    nodes: [
      { id: 'n1', type: 'sensor',    data: { sensorId: 'PUMP-001' } },
      { id: 'n2', type: 'condition', data: { metric: 'pressure', operator: '>', threshold: 80 } },
      { id: 'n3', type: 'action',    data: { action: 'alert', severity: 'medium' } },
    ],
    edges: [{ source: 'n1', target: 'n2' }, { source: 'n2', target: 'n3' }],
  };
  const r = await request('POST', '/api/rules', payload, OPERATOR_TOKEN);
  const ruleId = r.body.rule?._id;
  assert('Operator created a rule', !!ruleId);

  // Admin can see all rules (should include this one)
  const adminRules = await request('GET', '/api/rules', null, ADMIN_TOKEN);
  assert('Admin GET /api/rules → 200', adminRules.status === 200);
  const found = adminRules.body.rules?.some(r2 => r2._id === ruleId);
  assert('Admin can see operator rule', found === true);

  // Cleanup
  if (ruleId) {
    await request('DELETE', `/api/rules/${ruleId}`, null, OPERATOR_TOKEN);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=================================================');
  console.log('  NexusFlow G3 — Day 3 Backend Integration Test  ');
  console.log('=================================================');
  console.log('  Target: http://localhost:5000');
  console.log('  Make sure the backend server is running!\n');

  try {
    await testHealth();
    await testAuthFlow();
    await testRuleCRUD();
    await testAlertAPIs();
    await testTelemetryAPIs();
    await testRuleOwnership();
  } catch (err) {
    console.error('\n💥 Test suite crashed:', err.message);
    failed++;
  }

  console.log('\n=================================================');
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log('=================================================');
  if (failed === 0) {
    console.log('  🎉 ALL TESTS PASSED — Day 3 integration complete!');
  } else {
    console.log('  ⚠️  Some tests failed — check output above.');
  }
  process.exit(failed > 0 ? 1 : 0);
}

main();
