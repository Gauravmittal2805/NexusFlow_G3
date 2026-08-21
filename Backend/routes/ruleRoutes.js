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
const { requireRole } = require('../middleware/roleMiddleware');

// All rule routes are protected
router.use(protect);

// POST /api/rules - Create rule (admin, operator)
router.post('/', requireRole('admin', 'operator'), createRule);

// GET /api/rules - Get all rules (admin, operator, viewer)
router.get('/', requireRole('admin', 'operator', 'viewer'), getRules);

// GET /api/rules/:id - Get single rule by ID (admin, operator, viewer)
router.get('/:id', requireRole('admin', 'operator', 'viewer'), getRuleById);

// PATCH /api/rules/:id/toggle - Toggle rule active status (admin, operator)
// NOTE: must be declared before /:id/status to avoid Express route ambiguity
router.patch('/:id/toggle', requireRole('admin', 'operator'), toggleRuleStatus);

// PATCH /api/rules/:id/status - Update rule active status (admin, operator)
router.patch('/:id/status', requireRole('admin', 'operator'), updateRuleStatus);

// PUT /api/rules/:id - Update rule (admin, operator)
router.put('/:id', requireRole('admin', 'operator'), updateRule);

// DELETE /api/rules/:id - Delete rule (admin only)
router.delete('/:id', requireRole('admin'), deleteRule);

module.exports = router;
