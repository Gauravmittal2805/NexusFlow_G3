const express = require('express');
const router = express.Router();
const {
  createRule,
  getRules,
  getRuleById,
  updateRule,
  deleteRule,
  updateRuleStatus,
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

// PUT /api/rules/:id - Update rule (Step 1)
router.put('/:id', updateRule);

// DELETE /api/rules/:id - Delete rule (Step 2)
router.delete('/:id', deleteRule);

// PATCH /api/rules/:id/status - Update rule active status (Step 3)
router.patch('/:id/status', updateRuleStatus);

// PATCH /api/rules/:id/toggle - Toggle rule active status
router.patch('/:id/toggle', toggleRuleStatus);

module.exports = router;
