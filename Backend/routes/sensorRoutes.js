const express = require('express');
const router = express.Router();
const { getSensors, createSensor, deleteSensor } = require('../controllers/sensorController');
const { protect } = require('../middleware/authMiddleware');
const authorize = require('../middleware/authorize');

// Protect all routes below
router.use(protect);

router.route('/')
  .get(authorize('admin', 'operator', 'viewer'), getSensors)
  .post(authorize('admin', 'operator'), createSensor);

router.route('/:id')
  .delete(authorize('admin'), deleteSensor);

module.exports = router;
