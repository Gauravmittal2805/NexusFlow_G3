const express = require('express');
const router = express.Router();
const telemetryController = require('../controllers/telemetryController');

// POST /api/telemetry (create new telemetry record)
router.post('/', telemetryController.createTelemetry);

// GET /api/telemetry (get all telemetry records)
router.get('/', telemetryController.getAllTelemetry);

// GET /api/telemetry/:sensorId (get records for a specific sensor)
router.get('/:sensorId', telemetryController.getTelemetryBySensorId);

module.exports = router;
