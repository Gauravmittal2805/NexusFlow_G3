const express = require('express');
const router  = express.Router();
const {
  getAlerts,
  getAlertStats,
  getAlertById,
  markAlertAsRead,
} = require('../controllers/alertController');
const { protect } = require('../middleware/authMiddleware');

// All alert routes require authentication
router.use(protect);

// GET /api/alerts — Fetch all alerts (newest first, with query filters)
router.get('/', getAlerts);

// GET /api/alerts/stats — Fetch alert statistics
router.get('/stats', getAlertStats);

// GET /api/alerts/:id — Fetch single alert by ID
router.get('/:id', getAlertById);

// PATCH /api/alerts/:id/read — Mark alert as read
router.patch('/:id/read', markAlertAsRead);

module.exports = router;
