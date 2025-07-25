const User = require('../models/User');
const { sendVerificationCode, verifyCode } = require('../services/twilioService');
const { sendEmail } = require('../services/resendService');

const updateProfile = async (req, res) => {
  try {
    const { firstName, lastName } = req.body;
    const user = req.user;

    // Update user profile
    user.firstName = firstName;
    user.lastName = lastName;
    await user.save();

    res.status(200).json({
      status: 'success',
      message: 'Profile updated successfully',
      data: {
        user: {
          id: user._id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role
        }
      }
    });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error updating profile'
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
    console.error('Password change error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error changing password'
    });
  }
};

const initiateEmailChange = async (req, res) => {
  try {
    const user = req.user;
    const { newEmail } = req.body;
    if (!newEmail) {
      return res.status(400).json({ status: 'error', message: 'New email is required' });
    }
    // Check if new email is already taken
    const existingUser = await User.findOne({ email: newEmail });
    if (existingUser) {
      return res.status(400).json({ status: 'error', message: 'Email already in use' });
    }
    // Generate a 6-digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    user.pendingNewEmail = newEmail;
    user.emailVerificationCode = code;
    user.emailVerificationExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 min expiry
    await user.save();
    // Send code to new email
    await sendEmail({
      to: newEmail,
      subject: 'Your Email Change Verification Code',
      text: `Your verification code is: ${code}`,
      html: `<p>Your verification code is: <b>${code}</b></p>`
    });
    res.status(200).json({ status: 'success', message: 'Verification code sent to new email' });
  } catch (error) {
    console.error('Email change initiation error:', error);
    res.status(500).json({ status: 'error', message: 'Error initiating email change' });
  }
};

const verifyAndChangeEmail = async (req, res) => {
  try {
    const { newEmail, verificationCode } = req.body;
    const user = req.user;
    // Check code and expiry
    if (
      !user.pendingNewEmail ||
      user.pendingNewEmail !== newEmail ||
      user.emailVerificationCode !== verificationCode ||
      !user.emailVerificationExpiry ||
      user.emailVerificationExpiry < new Date()
    ) {
      return res.status(401).json({ status: 'error', message: 'Invalid or expired verification code' });
    }
    // Update email
    user.email = newEmail;
    user.pendingNewEmail = null;
    user.emailVerificationCode = null;
    user.emailVerificationExpiry = null;
    await user.save();
    res.status(200).json({
      status: 'success',
      message: 'Email updated successfully',
      data: {
        user: {
          id: user._id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role
        }
      }
    });
  } catch (error) {
    console.error('Email change error:', error);
    res.status(500).json({ status: 'error', message: 'Error changing email' });
  }
};

const updateProfilePicture = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        status: 'error',
        message: 'No file uploaded'
      });
    }

    const user = req.user;
    user.profilePicture = req.file.path;
    await user.save();

    res.status(200).json({
      status: 'success',
      message: 'Profile picture updated successfully',
      data: {
        profilePicture: user.profilePicture
      }
    });
  } catch (error) {
    console.error('Profile picture update error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error updating profile picture'
    });
  }
};

const toggleTwoFactorAuth = async (req, res) => {
  try {
    const { enable } = req.body;
    const user = req.user;
    user.twoFactorAuth.enabled = !!enable;
    await user.save();
    res.status(200).json({
      status: 'success',
      message: enable ? 'Two-factor authentication enabled' : 'Two-factor authentication disabled',
      data: { enabled: user.twoFactorAuth.enabled }
    });
  } catch (error) {
    console.error('2FA toggle error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error toggling two-factor authentication'
    });
  }
};

module.exports = {
  updateProfile,
  changePassword,
  initiateEmailChange,
  verifyAndChangeEmail,
  updateProfilePicture,
  toggleTwoFactorAuth
}; 