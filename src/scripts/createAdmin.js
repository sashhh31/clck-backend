require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const createAdminUser = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Check if admin user already exists
    const existingAdmin = await User.findOne({ email: 'admin@gmail.com' });
    if (existingAdmin) {
      console.log('Admin user already exists');
      process.exit(0);
    }

    // Create Stripe customer for admin
    const customer = await stripe.customers.create({
      email: 'admin@gmail.com',
      name: 'Admin Admin',
      metadata: {
        firstName: 'Admin',
        lastName: 'Admin'
      }
    });

    // Create admin user
    const adminUser = new User({
      firstName: 'Admin',
      lastName: 'Admin',
      email: 'admin@gmail.com',
      password: 'admin',
      role: 'admin',
      twoFactorAuth: {
        enabled: false // Disable 2FA for admin
      },
      subscription: {
        stripeCustomerId: customer.id,
        plan: 'premium',
        status: 'active'
      }
    });

    await adminUser.save();
    console.log('Admin user created successfully');
    process.exit(0);
  } catch (error) {
    console.error('Error creating admin user:', error);
    process.exit(1);
  }
};

createAdminUser(); 