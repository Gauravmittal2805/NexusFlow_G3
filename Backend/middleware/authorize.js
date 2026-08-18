const User = require('../models/User');

/**
 * Authorization middleware to check if user's role is permitted.
 * Assumes req.user is already set by the authentication (protect) middleware.
 * @param  {...string} allowedRoles Roles that are permitted to access the route
 */
const authorize = (...allowedRoles) => {
  return async (req, res, next) => {
    try {
      if (!req.user || !req.user.id) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      // Find user in database to ensure we check the latest role and it exists
      const user = await User.findById(req.user.id);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Check if user's role is in the allowed list
      if (!allowedRoles.includes(user.role)) {
        return res.status(403).json({
          success: false,
          message: 'Access denied'
        });
      }

      // Attach user role and user object to req for future middleware/handlers
      req.user.role = user.role;
      req.user.user = user;

      next();
    } catch (error) {
      console.error('Authorization middleware error:', error.message);
      return res.status(500).json({
        success: false,
        message: 'Server error during authorization'
      });
    }
  };
};

module.exports = authorize;
