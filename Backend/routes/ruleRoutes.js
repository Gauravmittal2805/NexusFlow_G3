const express = require('express');
const router = express.Router();
const {
  createRule,
  getRules,
  getRuleById,
  toggleRuleStatus,
} = require('../controllers/ruleController');
const { protect } = require('../middleware/authMiddleware');

// All rule routes are protected and linked to the authenticated user
router.use(protect);

// POST /api/rules - Create rule
router.post('/', createRule);

// GET /api/rules - Get all rules for current user
router.get('/', getRules);

// GET /api/rules/:id - Get single rule by ID
router.get('/:id', getRuleById);

// PATCH /api/rules/:id/toggle - Toggle rule active status
router.patch('/:id/toggle', toggleRuleStatus);

module.exports = router;
