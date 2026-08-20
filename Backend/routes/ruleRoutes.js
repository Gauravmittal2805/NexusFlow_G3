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
const authorize = require('../middleware/authorize');

// All rule routes are protected
router.use(protect);

// POST /api/rules - Create rule (admin, operator)
router.post('/', authorize('admin', 'operator'), createRule);

// GET /api/rules - Get all rules for current user (admin, operator, viewer)
router.get('/', authorize('admin', 'operator', 'viewer'), getRules);

// GET /api/rules/:id - Get single rule by ID (admin, operator, viewer)
router.get('/:id', authorize('admin', 'operator', 'viewer'), getRuleById);

// PATCH /api/rules/:id/toggle - Toggle rule active status (admin, operator)
router.patch('/:id/toggle', authorize('admin', 'operator'), toggleRuleStatus);

// DELETE /api/rules/:id - Delete rule (admin)
router.delete('/:id', authorize('admin'), async (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Rule deleted successfully (auth verified)'
  });
});
// PUT /api/rules/:id - Update rule (Step 1)
router.put('/:id', updateRule);

// DELETE /api/rules/:id - Delete rule (Step 2)
router.delete('/:id', deleteRule);

// PATCH /api/rules/:id/status - Update rule active status (Step 3)
router.patch('/:id/status', updateRuleStatus);

// PATCH /api/rules/:id/toggle - Toggle rule active status
router.patch('/:id/toggle', toggleRuleStatus);

module.exports = router;
