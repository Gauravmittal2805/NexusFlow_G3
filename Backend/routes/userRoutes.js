const express = require('express');
const router = express.Router();
const { getUsers, updateUserRole, updateUserStatus, updateUserPreferences } = require('../controllers/userController');
const { protect } = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/roleMiddleware');

// User preferences route (any authenticated user)
router.put('/preferences', protect, updateUserPreferences);

// Admin-only routes
router.use(protect);
router.use(requireRole('admin'));

router.get('/', getUsers);
router.patch('/:id/role', updateUserRole);
router.patch('/:id/status', updateUserStatus);

module.exports = router;
