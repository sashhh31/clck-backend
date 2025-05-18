const jwt = require('jsonwebtoken');
const User = require('../models/User');

const auth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      throw new Error();
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findOne({ _id: decoded.userId, status: 'active' });

    if (!user) {
      throw new Error();
    }

    req.token = token;
    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({
      status: 'error',
      message: 'Please authenticate.'
    });
  }
};

const adminAuth = async (req, res, next) => {
  try {
    await auth(req, res, () => {
      if (req.user.role !== 'admin') {
        return res.status(403).json({
          status: 'error',
          message: 'Access denied. Admin privileges required.'
        });
      }
      next();
    });
  } catch (error) {
    res.status(401).json({
      status: 'error',
      message: 'Please authenticate.'
    });
  }
};

const require2FA = async (req, res, next) => {
  try {
    if (!req.user.twoFactorAuth.enabled) {
      return next();
    }

    const twoFactorToken = req.header('X-2FA-Token');
    if (!twoFactorToken) {
      return res.status(401).json({
        status: 'error',
        message: '2FA token required'
      });
    }

    const isValid = req.user.verify2FACode(twoFactorToken);
    if (!isValid) {
      return res.status(401).json({
        status: 'error',
        message: 'Invalid or expired 2FA token'
      });
    }

    next();
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error verifying 2FA token'
    });
  }
};

module.exports = {
  auth,
  adminAuth,
  require2FA
}; 