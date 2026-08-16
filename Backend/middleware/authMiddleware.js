const jwt = require('jsonwebtoken');

const protect = async (req, res, next) => {
  let token;

  // Check if authorization header exists
  if (!req.headers.authorization) {
    return res.status(401).json({
      success: false,
      message: 'Missing token'
    });
  }

  // Check if authorization header starts with Bearer
  if (!req.headers.authorization.startsWith('Bearer')) {
    return res.status(401).json({
      success: false,
      message: 'Invalid token'
    });
  }

  // Extract token
  token = req.headers.authorization.split(' ')[1];

  if (!token || token === 'null' || token === 'undefined') {
    return res.status(401).json({
      success: false,
      message: 'Missing token'
    });
  }

  try {
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret');

    // Store user ID in request (decoded contains userId payload from sign)
    req.user = { id: decoded.userId };

    return next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Expired token'
      });
    }
    return res.status(401).json({
      success: false,
      message: 'Invalid token'
    });
  }
};

module.exports = { protect };
