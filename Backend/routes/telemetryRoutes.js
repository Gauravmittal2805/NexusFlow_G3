const express = require('express');
const router = express.Router();
const telemetryController = require('../controllers/telemetryController');
const { protect } = require('../middleware/authMiddleware');

// All telemetry routes require authentication
router.use(protect);

// GET /api/telemetry/summary (analytics aggregation)
router.get('/summary', telemetryController.getTelemetrySummary);

// POST /api/telemetry (create new telemetry record)
router.post('/', telemetryController.createTelemetry);

// GET /api/telemetry (get records with filters: sensorId, metric, timeRange, startTime, endTime, limit, sort)
router.get('/', telemetryController.getAllTelemetry);

// GET /api/telemetry/:sensorId (get records for specific sensor with filters: metric, timeRange, limit, sort)
router.get('/:sensorId', telemetryController.getTelemetryBySensorId);

module.exports = router;
