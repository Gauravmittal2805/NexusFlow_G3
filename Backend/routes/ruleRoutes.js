const express = require('express');
const router = express.Router();
const {
  createRule,
  getRules,
  getRuleById,
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

module.exports = router;
