const jwt = require('jsonwebtoken');
const User = require('../models/User');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const path = require('path');

// Create email transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const generateVerificationCode = () => {
  return crypto.randomInt(100000, 999999).toString();
};

const sendVerificationEmail = async (email, code) => {
  const mailOptions = {
    from: process.env.SMTP_FROM,
    to: email,
    subject: 'Your Verification Code',
    html: `
      <h1>Email Verification</h1>
      <p>Your verification code is: <strong>${code}</strong></p>
      <p>This code will expire in 10 minutes.</p>
    `,
  };

  await transporter.sendMail(mailOptions);
};

const generateToken = (userId, role) => {
  return jwt.sign({ userId, role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN
  });
};

const sendPowerhourEmail = async (userEmail) => {
  const calendlyLink = 'https://calendly.com/saswatpattanaik31/power-hour';
  const logoUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/Images/logo.png`;
  const html = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; background: #f8fafc; padding: 40px 0;">
      <div style="max-width: 480px; margin: 0 auto; background: #fff; border-radius: 12px; box-shadow: 0 2px 12px rgba(0,0,0,0.07); padding: 32px 24px; text-align: center;">
        <img src="${logoUrl}" alt="Logo" style="height: 60px; margin-bottom: 24px;" />
        <h2 style="color: #2A3356; margin-bottom: 12px;">Welcome to Powerhour!</h2>
        <p style="color: #444; font-size: 16px; margin-bottom: 28px;">Thank you for joining us. To schedule your exclusive Powerhour session, simply click the button below and pick a time that works for you.</p>
        <a href="${calendlyLink}" style="display: inline-block; background: #2A3356; color: #F0D687; text-decoration: none; font-weight: 600; padding: 14px 32px; border-radius: 8px; font-size: 18px; margin-bottom: 18px;">Book Your Powerhour</a>
        <p style="color: #888; font-size: 13px; margin-top: 24px;">If you have any questions, just reply to this email.<br>We look forward to meeting you!</p>
      </div>
    </div>
  `;
  await transporter.sendMail({
    to: userEmail,
    subject: 'Schedule your Powerhour session',
    html
  });
};

const register = async (req, res) => {
  try {
    const { firstName, lastName, email, password } = req.body;
    
    // Check if user already exists
    const existingUser = await User.findOne({ email });

    if (existingUser) {
      return res.status(400).json({
        status: 'error',
        message: 'Email already registered'
      });
    }

    // Generate verification code

      // Send verification email

      // Create Stripe customer
      const customer = await stripe.customers.create({
        email,
        name: `${firstName} ${lastName}`,
        metadata: {
          firstName,
          lastName
        }
      });

      // Create user with verification code
      const user = new User({
        firstName,
        lastName,
        email,
        password,
        twoFactorAuth: {
          enabled: false
        },
        subscription: {
          stripeCustomerId: customer.id
        }
      });
      
      // Save user to database
      await user.save();
      
      // After successful registration, send the Calendly email
      await sendPowerhourEmail(user.email);

      return res.status(201).json({
        status: 'success',
        message: 'Registration successful. Please check your email for verification code.',
        requiresVerification: false,
        email: user.email,
        redirectTo: '/plans'
      });

  } catch (error) {
    console.error('Registration error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Error creating user',
      details: error.message
    });
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({
        status: 'error',
        message: 'Invalid credentials'
      });
    }

    // Check password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({
        status: 'error',
        message: 'Invalid credentials'
      });
    }

    // Check if user is banned
    if (user.status === 'banned') {
      return res.status(403).json({
        status: 'error',
        message: 'Account has been banned'
      });
    }

    // If user is admin, skip 2FA and return token directly
    if (user.role === 'admin') {
      const token = generateToken(user._id, user.role);
      return res.status(200).json({
        status: 'success',
        message: 'Login successful',
        data: {
          token,
          user: {
            id: user._id,
            email: user.email,
            role: user.role
          }
        },
        redirectTo: '/admin/'
      });
    }

    // For regular users, proceed with 2FA
    const verificationCode = generateVerificationCode();
    const verificationExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    try {
      // Send verification email
      await sendVerificationEmail(email, verificationCode);

      // Update user with new verification code
      user.verificationCode = verificationCode;
      user.verificationExpiry = verificationExpiry;
      await user.save();
      
      return res.status(200).json({
        status: 'success',
        message: 'Please check your email for verification code.',
        requiresVerification: true,
        email: user.email,
        isLogin: true,
        role: user.role,
        redirectTo: '/verification'
      });
    } catch (emailError) {
      console.error('Email error:', emailError);
      return res.status(500).json({
        status: 'error',
        message: 'Failed to send verification email. Please try again later.',
        details: emailError.message
      });
    }
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error during login'
    });
  }
};

const verify2FA = async (req, res) => {
  try {
    const { email, code, isLogin } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({
        status: 'error',
        message: 'Invalid credentials'
      });
    }

    // Check if verification code is valid and not expired
    if (user.verificationCode !== code || user.verificationExpiry < new Date()) {
      return res.status(401).json({
        status: 'error',
        message: 'Invalid or expired verification code'
      });
    }

    // Clear verification code after successful verification
    user.verificationCode = undefined;
    user.verificationExpiry = undefined;
    await user.save();

    // Generate token
    const token = generateToken(user._id, user.role);

    // If this is a login attempt, redirect to user dashboard
    // If this is a registration, redirect to plans page
    const redirectTo = isLogin ? '/user' : '/plans';

    return res.status(200).json({
      status: 'success',
      message: 'Verification successful',
      data: {
        token,
        user: {
          id: user._id,
          email: user.email,
          role: user.role
        },
      },
      redirectTo
    });
  } catch (error) {
    console.error('Verification error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Error verifying code'
    });
  }
};

const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = req.user;

    // Verify current password
    const isPasswordValid = await user.comparePassword(currentPassword);
    if (!isPasswordValid) {
      return res.status(401).json({
        status: 'error',
        message: 'Current password is incorrect'
      });
    }

    // Update password
    user.password = newPassword;
    await user.save();

    res.status(200).json({
      status: 'success',
      message: 'Password updated successfully'
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error changing password'
    });
  }
};

const changeEmail = async (req, res) => {
  try {
    const { newEmail, password } = req.body;
    const user = req.user;

    // Verify password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({
        status: 'error',
        message: 'Password is incorrect'
      });
    }

    // Check if new email is already taken
    const existingUser = await User.findOne({ email: newEmail });
    if (existingUser) {
      return res.status(400).json({
        status: 'error',
        message: 'Email already in use'
      });
    }

    // Update email
    user.email = newEmail;
    await user.save();

    res.status(200).json({
      status: 'success',
      message: 'Email updated successfully'
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error changing email'
    });
  }
};

// Forgot Password: send reset code to email
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ status: 'error', message: 'User not found' });
    }
    const resetCode = generateVerificationCode();
    const resetExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 min
    user.verificationCode = resetCode;
    user.verificationExpiry = resetExpiry;
    await user.save();
    await sendVerificationEmail(email, resetCode);
    return res.status(200).json({ status: 'success', message: 'Reset code sent to email.' });
  } catch (error) {
    console.error('Forgot password error:', error);
    return res.status(500).json({ status: 'error', message: 'Error sending reset code' });
  }
};

// Reset Password: verify code and set new password
const resetPassword = async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ status: 'error', message: 'User not found' });
    }
    if (user.verificationCode !== code || user.verificationExpiry < new Date()) {
      return res.status(400).json({ status: 'error', message: 'Invalid or expired code' });
    }
    user.password = newPassword;
    user.verificationCode = undefined;
    user.verificationExpiry = undefined;
    await user.save();
    return res.status(200).json({ status: 'success', message: 'Password reset successful' });
  } catch (error) {
    console.error('Reset password error:', error);
    return res.status(500).json({ status: 'error', message: 'Error resetting password' });
  }
};

module.exports = {
  register,
  login,
  verify2FA,
  changePassword,
  changeEmail,
  forgotPassword,
  resetPassword,
}; 