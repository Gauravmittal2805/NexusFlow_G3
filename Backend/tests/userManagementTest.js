require('dotenv').config();
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const app = require('../app');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'supersecretjwtkey123';

async function runUserManagementTests() {
  console.log('🧪 Starting User Management & Status Flow Integration Tests...\n');

  // Connect to MongoDB
  const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/NexusFlow';
  try {
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000 });
    console.log('✅ Connected to MongoDB for testing');
  } catch (err) {
    console.error('❌ Could not connect to local MongoDB for live integration test:', err.message);
    process.exit(1);
  }

  try {
    // Clean test users
    await User.deleteMany({ email: /test_user_mgmt_/ });

    // Create the test users
    const adminUser = await User.create({
      name: 'Test Mgmt Admin',
      email: `test_user_mgmt_admin@example.com`,
      password: 'password123',
      role: 'admin'
    });
    const adminToken = jwt.sign({ userId: adminUser._id.toString() }, JWT_SECRET);

    const operatorUser = await User.create({
      name: 'Test Mgmt Operator',
      email: `test_user_mgmt_operator@example.com`,
      password: 'password123',
      role: 'operator'
    });
    const operatorToken = jwt.sign({ userId: operatorUser._id.toString() }, JWT_SECRET);

    const viewerUser = await User.create({
      name: 'Test Mgmt Viewer',
      email: `test_user_mgmt_viewer@example.com`,
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

    // --- TEST 1: GET /api/users (List users, protect, no passwords) ---
    console.log('\n--- Test 1: GET /api/users ---');
    
    // Viewer should be forbidden
    const getViewerRes = await makeRequest(server, 'GET', '/api/users', viewerToken);
    if (getViewerRes.status !== 403) {
      throw new Error(`Viewer expected 403 Forbidden for GET /api/users, got ${getViewerRes.status}`);
    }
    console.log('✅ Viewer GET /api/users: Forbidden (403)');

    // Operator should be forbidden
    const getOperatorRes = await makeRequest(server, 'GET', '/api/users', operatorToken);
    if (getOperatorRes.status !== 403) {
      throw new Error(`Operator expected 403 Forbidden for GET /api/users, got ${getOperatorRes.status}`);
    }
    console.log('✅ Operator GET /api/users: Forbidden (403)');

    // Admin should succeed
    const getAdminRes = await makeRequest(server, 'GET', '/api/users', adminToken);
    if (getAdminRes.status !== 200 || !getAdminRes.body.success) {
      throw new Error(`Admin GET /api/users failed with status ${getAdminRes.status}`);
    }
    
    // Check password field is omitted
    const usersList = getAdminRes.body.users;
    if (!usersList || usersList.length === 0) {
      throw new Error('Admin GET /api/users returned empty user list');
    }
    usersList.forEach(u => {
      if (u.password) {
        throw new Error(`Security Leak: Password returned in user list for user ${u.email}`);
      }
    });
    console.log(`✅ Admin GET /api/users: Allowed (200 OK), password fields omitted.`);

    // --- TEST 2: PATCH /api/users/:id/role (Update user role, prevent removing last admin) ---
    console.log('\n--- Test 2: PATCH /api/users/:id/role ---');

    // Admin updates Operator to Viewer
    const updateRoleRes = await makeRequest(server, 'PATCH', `/api/users/${operatorUser._id}/role`, adminToken, {
      role: 'viewer'
    });
    if (updateRoleRes.status !== 200 || !updateRoleRes.body.success) {
      throw new Error(`Admin updating operator role failed: ${JSON.stringify(updateRoleRes.body)}`);
    }
    console.log('✅ Admin updated Operator role to Viewer successfully');

    // Operator updates Viewer (Should be forbidden because only admin can change roles)
    const updateRoleOpRes = await makeRequest(server, 'PATCH', `/api/users/${viewerUser._id}/role`, operatorToken, {
      role: 'admin'
    });
    if (updateRoleOpRes.status !== 403) {
      throw new Error(`Non-admin role update expected 403 Forbidden, got ${updateRoleOpRes.status}`);
    }
    console.log('✅ Non-admin role update blocked (403)');

    // Validate role input: Invalid role 'superuser'
    const updateInvalidRoleRes = await makeRequest(server, 'PATCH', `/api/users/${operatorUser._id}/role`, adminToken, {
      role: 'superuser'
    });
    if (updateInvalidRoleRes.status !== 400 || updateInvalidRoleRes.body.success !== false) {
      throw new Error(`Invalid role update expected 400 Bad Request, got ${updateInvalidRoleRes.status}`);
    }
    if (updateInvalidRoleRes.body.message !== 'Invalid role') {
      throw new Error(`Expected message 'Invalid role', got '${updateInvalidRoleRes.body.message}'`);
    }
    console.log('✅ Invalid role "superuser" rejected with 400 Bad Request');

    // Prevent removing last admin: Admin attempts to change their own role to Viewer
    const updateSelfRoleRes = await makeRequest(server, 'PATCH', `/api/users/${adminUser._id}/role`, adminToken, {
      role: 'viewer'
    });
    if (updateSelfRoleRes.status !== 400 || updateSelfRoleRes.body.success !== false) {
      throw new Error(`Preventing last admin change expected 400 Bad Request, got ${updateSelfRoleRes.status}`);
    }
    if (updateSelfRoleRes.body.message !== 'At least one admin must remain') {
      throw new Error(`Expected message 'At least one admin must remain', got '${updateSelfRoleRes.body.message}'`);
    }
    console.log('✅ Prevented removing the last admin from the system (400 Bad Request)');

    // --- TEST 3: PATCH /api/users/:id/status (Enable/Disable user) ---
    console.log('\n--- Test 3: PATCH /api/users/:id/status ---');

    // Admin updates Viewer to inactive
    const disableViewerRes = await makeRequest(server, 'PATCH', `/api/users/${viewerUser._id}/status`, adminToken, {
      status: 'inactive'
    });
    if (disableViewerRes.status !== 200 || !disableViewerRes.body.success) {
      throw new Error(`Admin disabling user failed: ${JSON.stringify(disableViewerRes.body)}`);
    }
    console.log('✅ Admin successfully deactivated Viewer user account.');

    // Viewer tries to login (Should be rejected as account is inactive)
    const inactiveLoginRes = await makeRequest(server, 'POST', '/api/auth/login', null, {
      email: viewerUser.email,
      password: 'password123'
    });
    if (inactiveLoginRes.status !== 403 || inactiveLoginRes.body.success !== false) {
      throw new Error(`Inactive user login expected 403 Forbidden, got ${inactiveLoginRes.status}`);
    }
    if (inactiveLoginRes.body.message !== 'Account is inactive') {
      throw new Error(`Expected message 'Account is inactive', got '${inactiveLoginRes.body.message}'`);
    }
    console.log('✅ Inactive user login rejected with 403 (Account is inactive)');

    // Prevent deactivating the last active admin
    const disableAdminRes = await makeRequest(server, 'PATCH', `/api/users/${adminUser._id}/status`, adminToken, {
      status: 'inactive'
    });
    if (disableAdminRes.status !== 400 || disableAdminRes.body.success !== false) {
      throw new Error(`Deactivating last active admin expected 400 Bad Request, got ${disableAdminRes.status}`);
    }
    console.log('✅ Prevented deactivating the last active admin (400)');

    // --- TEST 4: Profile Response & Login Activity Information ---
    console.log('\n--- Test 4: Profile Response & Login Activity Information ---');

    // Verify active user login updates lastLoginAt
    const adminLoginRes = await makeRequest(server, 'POST', '/api/auth/login', null, {
      email: adminUser.email,
      password: 'password123'
    });
    if (adminLoginRes.status !== 200 || !adminLoginRes.body.success) {
      throw new Error(`Active admin login failed: ${JSON.stringify(adminLoginRes.body)}`);
    }
    const { user: loggedInUser } = adminLoginRes.body;
    if (!loggedInUser.lastLoginAt) {
      throw new Error('Login response missing lastLoginAt timestamp');
    }
    if (loggedInUser.status !== 'active') {
      throw new Error('Login response status is not active');
    }
    console.log(`✅ Login response contains lastLoginAt: ${loggedInUser.lastLoginAt} and status: ${loggedInUser.status}`);

    // GET /api/auth/profile should return name, email, role, status
    const profileRes = await makeRequest(server, 'GET', '/api/auth/profile', adminToken);
    if (profileRes.status !== 200 || !profileRes.body.success) {
      throw new Error(`Profile retrieval failed: ${JSON.stringify(profileRes.body)}`);
    }
    const profileUser = profileRes.body.user;
    if (profileUser.password) {
      throw new Error('Profile response leak: contains password');
    }
    if (!profileUser.role || !profileUser.status) {
      throw new Error('Profile response missing role or status field');
    }
    console.log('✅ Profile response matches expected structure:', JSON.stringify(profileUser));

    // Clean up test users
    await User.deleteMany({ email: /test_user_mgmt_/ });

    server.close();
    await mongoose.connection.close();
    console.log('\n🎉 ALL USER MANAGEMENT & STATUS FLOW TESTS PASSED SUCCESSFULLY!');
    process.exit(0);
  } catch (err) {
    console.error('❌ User management tests failed with exception:', err);
    process.exit(1);
  }
}

runUserManagementTests();
