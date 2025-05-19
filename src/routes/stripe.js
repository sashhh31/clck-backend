const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const {checkoutSession}= require('../controllers/stripeController')

router.post('/checkoutSession',checkoutSession);

module.exports=router