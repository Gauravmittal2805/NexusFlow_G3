const User = require('../models/User');

// @desc    Get all users
// @route   GET /api/users
// @access  Private (Admin only)
const getUsers = async (req, res) => {
  try {
    const users = await User.find().select('-password').sort({ createdAt: -1 });
    res.status(200).json({
      success: true,
      users
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// @desc    Update user role
// @route   PATCH /api/users/:id/role
// @access  Private (Admin only)
const updateUserRole = async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body || {};

    // Validate role input
    if (!role) {
      return res.status(400).json({
        success: false,
        message: 'Role is required'
      });
    }

    if (!['admin', 'operator', 'viewer'].includes(role)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid role'
      });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Prevent removing the last admin
    if (user.role === 'admin' && role !== 'admin') {
      const adminCount = await User.countDocuments({ role: 'admin' });
      if (adminCount <= 1) {
        return res.status(400).json({
          success: false,
          message: 'At least one admin must remain'
        });
      }
    }

    user.role = role;
    await user.save();

    res.status(200).json({
      success: true,
      message: 'User role updated successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// @desc    Update user status (Enable/Disable)
// @route   PATCH /api/users/:id/status
// @access  Private (Admin only)
const updateUserStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body || {};

    if (!status) {
      return res.status(400).json({
        success: false,
        message: 'Status is required'
      });
    }

    if (!['active', 'inactive'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status'
      });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Prevent disabling the last admin
    if (user.role === 'admin' && status === 'inactive') {
      const activeAdminCount = await User.countDocuments({ role: 'admin', status: 'active' });
      if (activeAdminCount <= 1) {
        return res.status(400).json({
          success: false,
          message: 'At least one admin must remain'
        });
      }
    }

    user.status = status;
    await user.save();

    res.status(200).json({
      success: true,
      message: `User status updated to ${status} successfully`
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

module.exports = {
  getUsers,
  updateUserRole,
  updateUserStatus
};
