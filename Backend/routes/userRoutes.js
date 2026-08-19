const express = require('express');
const router = express.Router();
const { getUsers, updateUserRole, updateUserStatus } = require('../controllers/userController');
const { protect } = require('../middleware/authMiddleware');
const authorize = require('../middleware/authorize');

// Protect all routes - Admin only
router.use(protect);
router.use(authorize('admin'));

router.get('/', getUsers);
router.patch('/:id/role', updateUserRole);
router.patch('/:id/status', updateUserStatus);

module.exports = router;
