const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const {
  createSubscription,
  getSubscriptionStatus,
  cancelSubscription,
  handleWebhook,
  verifySubscription,
  getSubscriptionHistory
} = require('../controllers/subscriptionController');

// Protected routes
router.post('/create', createSubscription);
router.get('/status', auth, getSubscriptionStatus);
router.post('/cancel', auth, cancelSubscription);
router.post('/verify', verifySubscription);
router.get('/history', auth, getSubscriptionHistory);

// Webhook route is now handled in index.js

module.exports = router; 