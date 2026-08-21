const User = require('../models/User');

/**
 * Middleware to check if the authenticated user's role matches the required roles.
 * Assumes req.user is already set by the protect middleware.
 * 
 * @param  {...string} allowedRoles - The roles allowed to access the route
 */
const requireRole = (...allowedRoles) => {
  return async (req, res, next) => {
    try {
      if (!req.user || !req.user.id) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      // Fetch user from database to check current role and status
      const user = await User.findById(req.user.id);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Handle inactive accounts
      if (user.status === 'inactive') {
        return res.status(403).json({
          success: false,
          message: 'Account is inactive'
        });
      }

      // Check role
      if (!allowedRoles.includes(user.role)) {
        return res.status(403).json({
          success: false,
          message: 'Access denied'
        });
      }

      // Attach user details to request object
      req.user.role = user.role;
      req.user.user = user;

      next();
    } catch (error) {
      console.error('Role middleware error:', error.message);
      return res.status(500).json({
        success: false,
        message: 'Server error during authorization'
      });
    }
  };
};

module.exports = { requireRole };
