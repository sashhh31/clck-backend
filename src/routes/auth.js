const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const {
  register,
  login,
  verify2FA,
  changePassword,
  changeEmail
} = require('../controllers/authController');

// Public routes
router.post('/register', register);
router.post('/login', login);
router.post('/verify-2fa', verify2FA);

// Protected routes
router.put('/change-password', auth, changePassword);
router.put('/change-email', auth, changeEmail);

module.exports = router; 