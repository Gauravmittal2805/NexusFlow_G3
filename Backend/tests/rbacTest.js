require('dotenv').config();
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const app = require('../app');
const User = require('../models/User');
const Sensor = require('../models/Sensor');
const Rule = require('../models/Rule');

const JWT_SECRET = process.env.JWT_SECRET || 'supersecretjwtkey123';

async function runRbacTests() {
  console.log('🧪 Starting RBAC (Role-Based Access Control) Integration Tests...\n');

  // Connect to MongoDB
  const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/NexusFlow';
  try {
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000 });
    console.log('✅ Connected to MongoDB for testing');
  } catch (err) {
    console.error('❌ Could not connect to local MongoDB for live RBAC test:', err.message);
    process.exit(1);
  }

  try {
    // Clean test users & sensors
    await User.deleteMany({ email: /test_rbac_/ });
    await Sensor.deleteMany({ sensorId: /^TEST_RBAC_/ });

    // Create the three roles
    const adminUser = await User.create({
      name: 'Test Admin',
      email: `test_rbac_admin@example.com`,
      password: 'password123',
      role: 'admin'
    });
    const adminToken = jwt.sign({ userId: adminUser._id.toString() }, JWT_SECRET);

    const operatorUser = await User.create({
      name: 'Test Operator',
      email: `test_rbac_operator@example.com`,
      password: 'password123',
      role: 'operator'
    });
    const operatorToken = jwt.sign({ userId: operatorUser._id.toString() }, JWT_SECRET);

    const viewerUser = await User.create({
      name: 'Test Viewer',
      email: `test_rbac_viewer@example.com`,
      password: 'password123',
      role: 'viewer'
    });
    const viewerToken = jwt.sign({ userId: viewerUser._id.toString() }, JWT_SECRET);

    // Helper for making requests
    const makeRequest = (server, method, path, token, body = null) => {
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
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
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

    // Listen on random port
    const server = app.listen(0);
    const port = server.address().port;
    console.log(`📡 Test server running on port ${port}`);

    // --- TEST 1: GET /api/sensors (Should be allowed for all three roles) ---
    console.log('\n--- Test 1: GET /api/sensors (All roles allowed) ---');
    const getAdminRes = await makeRequest(server, 'GET', '/api/sensors', adminToken);
    const getOperatorRes = await makeRequest(server, 'GET', '/api/sensors', operatorToken);
    const getViewerRes = await makeRequest(server, 'GET', '/api/sensors', viewerToken);

    if (getAdminRes.status !== 200 || !getAdminRes.body.success) {
      throw new Error(`Admin GET /api/sensors failed with status ${getAdminRes.status}`);
    }
    if (getOperatorRes.status !== 200 || !getOperatorRes.body.success) {
      throw new Error(`Operator GET /api/sensors failed with status ${getOperatorRes.status}`);
    }
    if (getViewerRes.status !== 200 || !getViewerRes.body.success) {
      throw new Error(`Viewer GET /api/sensors failed with status ${getViewerRes.status}`);
    }
    console.log('✅ Test 1 Passed: Admin, Operator, and Viewer can view sensors.');

    // --- TEST 2: POST /api/sensors (Allowed for Admin & Operator, Forbidden for Viewer) ---
    console.log('\n--- Test 2: POST /api/sensors (Admin/Operator allowed, Viewer forbidden) ---');
    const sensorPayload = {
      sensorId: 'TEST_RBAC_SENSOR_01',
      name: 'Test Sensor 01',
      type: 'temperature'
    };

    // Admin should succeed
    const postAdminRes = await makeRequest(server, 'POST', '/api/sensors', adminToken, sensorPayload);
    if (postAdminRes.status !== 201 || !postAdminRes.body.success) {
      throw new Error(`Admin POST /api/sensors failed with status ${postAdminRes.status}`);
    }
    console.log('✅ Admin POST sensor: Allowed (201 Created)');

    // Operator should succeed
    const sensorPayloadOp = {
      sensorId: 'TEST_RBAC_SENSOR_02',
      name: 'Test Sensor 02',
      type: 'pressure'
    };
    const postOperatorRes = await makeRequest(server, 'POST', '/api/sensors', operatorToken, sensorPayloadOp);
    if (postOperatorRes.status !== 201 || !postOperatorRes.body.success) {
      throw new Error(`Operator POST /api/sensors failed with status ${postOperatorRes.status}`);
    }
    console.log('✅ Operator POST sensor: Allowed (201 Created)');

    // Viewer should fail with 403 Forbidden
    const sensorPayloadView = {
      sensorId: 'TEST_RBAC_SENSOR_03',
      name: 'Test Sensor 03',
      type: 'humidity'
    };
    const postViewerRes = await makeRequest(server, 'POST', '/api/sensors', viewerToken, sensorPayloadView);
    if (postViewerRes.status !== 403 || postViewerRes.body.success !== false) {
      throw new Error(`Viewer POST /api/sensors expected 403 Forbidden, got ${postViewerRes.status}`);
    }
    if (postViewerRes.body.message !== 'Access denied') {
      throw new Error(`Viewer POST expected 'Access denied' message, got '${postViewerRes.body.message}'`);
    }
    console.log('✅ Viewer POST sensor: Forbidden (403 Access denied)');

    // --- TEST 3: DELETE /api/sensors/:id (Allowed for Admin, Forbidden for Operator and Viewer) ---
    console.log('\n--- Test 3: DELETE /api/sensors/:id (Admin allowed, Operator/Viewer forbidden) ---');
    
    // Viewer DELETE sensor -> Forbidden (403)
    const deleteViewerRes = await makeRequest(server, 'DELETE', '/api/sensors/TEST_RBAC_SENSOR_01', viewerToken);
    if (deleteViewerRes.status !== 403 || deleteViewerRes.body.success !== false) {
      throw new Error(`Viewer DELETE /api/sensors expected 403 Forbidden, got ${deleteViewerRes.status}`);
    }
    if (deleteViewerRes.body.message !== 'Access denied') {
      throw new Error(`Viewer DELETE expected 'Access denied' message, got '${deleteViewerRes.body.message}'`);
    }
    console.log('✅ Viewer DELETE sensor: Forbidden (403 Access denied)');

    // Operator DELETE sensor -> Forbidden (403)
    const deleteOperatorRes = await makeRequest(server, 'DELETE', '/api/sensors/TEST_RBAC_SENSOR_01', operatorToken);
    if (deleteOperatorRes.status !== 403 || deleteOperatorRes.body.success !== false) {
      throw new Error(`Operator DELETE /api/sensors expected 403 Forbidden, got ${deleteOperatorRes.status}`);
    }
    console.log('✅ Operator DELETE sensor: Forbidden (403 Access denied)');

    // Admin DELETE sensor -> Allowed (200)
    const deleteAdminRes1 = await makeRequest(server, 'DELETE', '/api/sensors/TEST_RBAC_SENSOR_01', adminToken);
    if (deleteAdminRes1.status !== 200 || !deleteAdminRes1.body.success) {
      throw new Error(`Admin DELETE sensor 01 failed with status ${deleteAdminRes1.status}`);
    }
    console.log('✅ Admin DELETE sensor 01: Allowed (200 OK)');

    const deleteAdminRes2 = await makeRequest(server, 'DELETE', '/api/sensors/TEST_RBAC_SENSOR_02', adminToken);
    if (deleteAdminRes2.status !== 200 || !deleteAdminRes2.body.success) {
      throw new Error(`Admin DELETE sensor 02 failed with status ${deleteAdminRes2.status}`);
    }
    console.log('✅ Admin DELETE sensor 02: Allowed (200 OK)');


    // --- TEST 4: DELETE /api/rules/:id (Allowed for Admin, Forbidden for Operator and Viewer) ---
    console.log('\n--- Test 4: DELETE /api/rules/:id (Admin allowed, Operator/Viewer forbidden) ---');

    // Create a real rule in the DB owned by admin so it can be deleted
    const testRule = await Rule.create({
      name: 'RBAC Test Rule',
      nodes: [{ id: 'n1', type: 'sensor', data: {} }],
      edges: [],
      createdBy: adminUser._id,
      isActive: true
    });
    const testRuleId = testRule._id.toString();

    const deleteRuleViewerRes = await makeRequest(server, 'DELETE', `/api/rules/${testRuleId}`, viewerToken);
    if (deleteRuleViewerRes.status !== 403) {
      throw new Error(`Viewer DELETE /api/rules expected 403 Forbidden, got ${deleteRuleViewerRes.status}`);
    }
    console.log('✅ Viewer DELETE rule: Forbidden (403)');

    const deleteRuleOperatorRes = await makeRequest(server, 'DELETE', `/api/rules/${testRuleId}`, operatorToken);
    if (deleteRuleOperatorRes.status !== 403) {
      throw new Error(`Operator DELETE /api/rules expected 403 Forbidden, got ${deleteRuleOperatorRes.status}`);
    }
    console.log('✅ Operator DELETE rule: Forbidden (403)');

    const deleteRuleAdminRes = await makeRequest(server, 'DELETE', `/api/rules/${testRuleId}`, adminToken);
    if (deleteRuleAdminRes.status !== 200 || !deleteRuleAdminRes.body.success) {
      throw new Error(`Admin DELETE /api/rules expected 200 OK, got ${deleteRuleAdminRes.status}`);
    }
    console.log('✅ Admin DELETE rule: Allowed (200 OK)');


    // Clean up test data
    await User.deleteMany({ email: /test_rbac_/ });
    await Sensor.deleteMany({ sensorId: /^TEST_RBAC_/ });
    await Rule.deleteMany({ name: 'RBAC Test Rule' });

    server.close();
    await mongoose.connection.close();
    console.log('\n🎉 ALL RBAC INTEGRATION TESTS PASSED SUCCESSFULLY!');
    process.exit(0);
  } catch (err) {
    console.error('❌ RBAC Test failed with exception:', err);
    process.exit(1);
  }
}

runRbacTests();
