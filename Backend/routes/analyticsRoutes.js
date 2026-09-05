'use strict';

const express = require('express');
const router  = express.Router();
const {
  getAnalyticsOverview,
  getHistoricalTelemetry,
  getAlertAnalytics,
  getSensorAnalytics,
} = require('../controllers/analyticsController');
const { protect } = require('../middleware/authMiddleware');

// All analytics routes require authentication
router.use(protect);

// GET /api/analytics/overview (or /api/analytics/summary)
router.get('/overview', getAnalyticsOverview);
router.get('/summary',  getAnalyticsOverview);

// GET /api/analytics/telemetry
router.get('/telemetry', getHistoricalTelemetry);

// GET /api/analytics/alerts
router.get('/alerts', getAlertAnalytics);

// GET /api/analytics/sensors
router.get('/sensors', getSensorAnalytics);

module.exports = router;
