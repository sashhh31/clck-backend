const Stripe = require('stripe')
const axios = require('axios');
const User = require('../models/User');


const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2025-04-30.basil',
});

const PRICE_IDS = {
  Basic: 'price_1RPdG7BZO6T3Rh80XaFMJ0mZ',
  Professional: 'price_1RPdWOBZO6T3Rh807XqUKcVC',
  Enterprise: 'price_1RPdWdBZO6T3Rh80zMc2axCG'
};

const checkoutSession=async (req,res)=> {
  try {
    const { planName, email } = req.body;
    console.log('Received request for plan:', planName, 'email:', email);

    const priceId = PRICE_IDS[planName];
    if (!priceId) {
      console.error('Invalid plan selected:', planName);
      return res.status(400).json({ error: 'Invalid plan selected' });
    }

    // Get user's Stripe customer ID from backend
    const userResponse= await User.findOne({email})

    const customerId = userResponse.subscription?.stripeCustomerId;

    if (!customerId) {
      console.error('No Stripe customer ID found for user');
      return res.status(400).json({ error: 'No Stripe customer ID found for this user' });
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${process.env.FRONTEND_URL}/plans?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/plans`,
      metadata: {
        plan: planName
      },
    });

    console.log('Created checkout session:', session.id);
    res.json({ sessionId: session.id });
  } catch (error) {
    console.error('Error creating checkout session:', error);

    const status = error.response?.status || 500;
    const message = error.response?.data || error.message || 'Failed to create checkout session';

    res.status(status).json({ error: message });
  }
};

module.exports= {checkoutSession};
