const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const { sendPowerhourEmail } = require('./authController');
const generateToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN
  });
};
const PRICE_IDS = {
  Basic: 'price_1RPdG7BZO6T3Rh80XaFMJ0mZ',     // 🔁 replace with real ID
  Professional: 'price_1RPdWOBZO6T3Rh807XqUKcVC',
  Enterprise: 'price_1RPdWdBZO6T3Rh80zMc2axCG'
};

const createSubscription = async (req, res) => {
  try {
    const { planName, email } = req.body; // Instead of priceId, accept `plan` like 'basic'

    console.log("Email received:", email);
    console.log("Plan received:", planName);

    const priceId = PRICE_IDS[planName];
    console.log(priceId);
    if (!priceId) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid plan selected',
      });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found',
      });
    }

    if (!user.subscription?.stripeCustomerId) {
      return res.status(400).json({
        status: 'error',
        message: 'No Stripe customer ID found for this user',
      });
    }


    const customer = await stripe.customers.retrieve(user.subscription.stripeCustomerId);
    console.log("Stripe customer retrieved:", customer.id);

    const session = await stripe.checkout.sessions.create({
      customer: customer.id,
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${process.env.FRONTEND_URL}/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/subscription/cancel`,
      metadata: {
        userId: user._id.toString(),
        plan: planName
      },
    });

    console.log("Stripe session created:", session.id);

    res.status(200).json({
      status: 'success',
      data: {
        sessionId: session.id,
        url: session.url,
      },
    });
  } catch (error) {
    console.error("Stripe Session Error:", error);
    res.status(500).json({
      status: 'error',
      message: 'Error creating subscription',
    });
  }
};



const getSubscriptionStatus = async (req, res) => {
  try {
    const user = req.user;
    if (!user.subscription.stripeCustomerId) {
      return res.status(200).json({
        status: 'success',
        data: {
          subscription: null
        }
      });
    }
    res.status(200).json({
      status: 'success',
      data: {
        subscription: {
          plan: user.subscription.plan,
          status: user.subscription.status,
          currentPeriodEnd: user.subscription.currentPeriodEnd
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error fetching subscription status'
    });
  }
};

const cancelSubscription = async (req, res) => {
  try {
    const user = req.user;

    if (!user.stripeCustomerId) {
      return res.status(400).json({
        status: 'error',
        message: 'No active subscription found'
      });
    }

    // Get customer's active subscription
    const subscriptions = await stripe.subscriptions.list({
      customer: user.stripeCustomerId,
      status: 'active',
      limit: 1
    });

    if (subscriptions.data.length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'No active subscription found'
      });
    }

    // Cancel subscription at period end
    await stripe.subscriptions.update(subscriptions.data[0].id, {
      cancel_at_period_end: true
    });

    // Update user's subscription status
    user.subscription.status = 'canceled';
    await user.save();

    res.status(200).json({
      status: 'success',
      message: 'Subscription will be canceled at the end of the billing period'
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error canceling subscription'
    });
  }
};

const handleWebhook = async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
    console.log('Webhook event received:', event.type);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      console.log('Processing checkout.session.completed:', session.id);
      
      try {
        // Get the user from the customer ID
        const user = await User.findOne({ 'subscription.stripeCustomerId': session.customer });
        if (!user) {
          console.error('User not found for customer:', session.customer);
          return res.status(404).json({ error: 'User not found' });
        }

        // Get the subscription details
        const subscription = await stripe.subscriptions.retrieve(session.subscription);
        console.log('Retrieved subscription:', subscription.id);

        // Update user's subscription status
        user.subscription = {
          status: 'active',
          plan: session.metadata.plan,
          currentPeriodEnd: new Date(subscription.current_period_end * 1000),
          stripeSubscriptionId: subscription.id,
          stripeCustomerId: session.customer
        };

        console.log('Updating user subscription:', {
          userId: user._id,
          plan: session.metadata.plan,
          status: 'active',
          currentPeriodEnd: new Date(subscription.current_period_end * 1000)
        });

        await user.save();
        console.log('User subscription updated successfully');

        await sendPowerhourEmail(user.email);

        return res.status(200).json({ received: true });
      } catch (error) {
        console.error('Error processing webhook:', error);
        return res.status(500).json({ error: 'Error processing webhook' });
      }
    }

    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const subscription = event.data.object;
      console.log(`Processing ${event.type}:`, subscription.id);
      
      try {
        const user = await User.findOne({ 'subscription.stripeCustomerId': subscription.customer });
        if (!user) {
          console.error('User not found for customer:', subscription.customer);
          return res.status(404).json({ error: 'User not found' });
        }

        // Update subscription status
        user.subscription = {
          status: subscription.status,
          plan: subscription.metadata.plan,
          currentPeriodEnd: new Date(subscription.current_period_end * 1000),
          stripeSubscriptionId: subscription.id,
          stripeCustomerId: subscription.customer
        };

        console.log('Updating user subscription:', {
          userId: user._id,
          plan: subscription.metadata.plan,
          status: subscription.status,
          currentPeriodEnd: new Date(subscription.current_period_end * 1000)
        });

        await user.save();
        console.log('User subscription updated successfully');

        return res.status(200).json({ received: true });
      } catch (error) {
        console.error('Error processing webhook:', error);
        return res.status(500).json({ error: 'Error processing webhook' });
      }
    }

    default:
      console.log(`Unhandled event type ${event.type}`);
      return res.status(200).json({ received: true });
  }
};

const verifySubscription = async (req, res) => {
  try {
    const { sessionId } = req.body;
    console.log("sessionId",sessionId);
    // Retrieve the session from Stripe
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (!session) {
      return res.status(404).json({
        status: 'error',
        message: 'Session not found'
      });
    }

    // Get the user from the customer ID
    const user = await User.findOne({ 'subscription.stripeCustomerId': session.customer });
    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    // Get the subscription details
    const subscription = await stripe.subscriptions.retrieve(session.subscription);
    // Update user's subscription status
    user.subscription = {
      stripeCustomerId:session.customer,
      status: 'active',
      plan: session.metadata.plan,
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
    };
    await user.save();

    // Generate token for the user
    const token = generateToken(user._id);

    // Set token in response cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/'
    });

    res.status(200).json({
      status: 'success',
      data: {
        token,
        subscription: user.subscription
      }
    });
  } catch (error) {
    console.error('Error verifying subscription:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error verifying subscription'
    });
  }
};

const getSubscriptionHistory = async (req, res) => {
  try {
    const user = req.user;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 5;
    const search = req.query.search || '';

    // Get all subscriptions for the user from Stripe
    const subscriptions = await stripe.subscriptions.list({
      customer: user.subscription.stripeCustomerId,
      limit: 100, // Get a large number to filter on our side
    });

    // Transform the data to match our frontend format
    const history = subscriptions.data.map(sub => {
      const plan = sub.items.data[0].price.nickname || 'Unknown Plan';
      const duration = sub.items.data[0].price.recurring.interval === 'year' ? 'Yearly' : 'Monthly';
      const charges = `£ ${(sub.items.data[0].price.unit_amount / 100).toFixed(2)}`;
      
      return {
        id: sub.id,
        plan,
        duration,
        charges,
        billingDate: new Date(sub.current_period_start * 1000).toLocaleString(),
        expiryDate: new Date(sub.current_period_end * 1000).toLocaleString(),
        subscriber: {
          name: user.firstName + ' ' + user.lastName,
          email: user.email,
          avatar: user.avatar || null
        }
      };
    });

    // Filter based on search query
    const filteredHistory = history.filter(sub => 
      sub.plan.toLowerCase().includes(search.toLowerCase()) ||
      sub.duration.toLowerCase().includes(search.toLowerCase())
    );

    // Calculate pagination
    const startIndex = (page - 1) * limit;
    const endIndex = page * limit;
    const paginatedHistory = filteredHistory.slice(startIndex, endIndex);

    res.status(200).json({
      status: 'success',
      data: {
        history: paginatedHistory,
        totalPages: Math.ceil(filteredHistory.length / limit),
        currentPage: page,
        totalItems: filteredHistory.length
      }
    });
  } catch (error) {
    console.error('Error fetching subscription history:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error fetching subscription history'
    });
  }
};

module.exports = {
  createSubscription,
  getSubscriptionStatus,
  cancelSubscription,
  handleWebhook,
  verifySubscription,
  getSubscriptionHistory
}; 