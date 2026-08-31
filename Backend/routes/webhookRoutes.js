'use strict';

/**
 * webhookRoutes.js
 *
 * Mounts the mock webhook test endpoint.
 * Registered in app.js as: app.use('/api/webhook', webhookRoutes)
 */

const express            = require('express');
const router             = express.Router();
const { receiveWebhook } = require('../controllers/webhookController');

// POST /api/webhook/test  — Mock endpoint that logs the received payload
router.post('/test', receiveWebhook);

module.exports = router;
