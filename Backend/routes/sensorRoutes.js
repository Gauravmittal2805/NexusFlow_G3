const express = require('express');
const router = express.Router();
const { getSensors, createSensor, deleteSensor } = require('../controllers/sensorController');
const { protect } = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/roleMiddleware');

// Protect all routes below
router.use(protect);

router.route('/')
  .get(requireRole('admin', 'operator', 'viewer'), getSensors)
  .post(requireRole('admin', 'operator'), createSensor);

router.route('/:id')
  .delete(requireRole('admin'), deleteSensor);

module.exports = router;
