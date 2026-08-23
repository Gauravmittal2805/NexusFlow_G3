const jwt = require('jsonwebtoken');

const protect = async (req, res, next) => {
  // Check if authorization header exists
  if (!req.headers.authorization) {
    return res.status(401).json({
      success: false,
      message: 'No token provided'
    });
  }

  // Check if authorization header starts with Bearer
  if (!req.headers.authorization.startsWith('Bearer')) {
    return res.status(401).json({
      success: false,
      message: 'No token provided'
    });
  }

  // Extract token
  const token = req.headers.authorization.split(' ')[1];

  if (!token || token === 'null' || token === 'undefined') {
    return res.status(401).json({
      success: false,
      message: 'No token provided'
    });
  }

  try {
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret');

    // Attach id and role to request (decoded contains userId and role from sign)
    req.user = {
      id: decoded.userId,
      role: decoded.role
    };

    return next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expired'
      });
    }
    return res.status(401).json({
      success: false,
      message: 'Invalid token'
    });
  }
};

module.exports = { protect };
