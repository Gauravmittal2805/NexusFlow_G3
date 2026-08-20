const express = require('express');
const router = express.Router();
const { getUsers, updateUserRole, updateUserStatus } = require('../controllers/userController');
const { protect } = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/roleMiddleware');

// Protect all routes - Admin only
router.use(protect);
router.use(requireRole('admin'));

router.get('/', getUsers);
router.patch('/:id/role', updateUserRole);
router.patch('/:id/status', updateUserStatus);

module.exports = router;
