const User = require('../models/User');
const { sendVerificationCode, verifyCode } = require('../services/twilioService');

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
    
    // Send verification code to current phone number
    const verificationResult = await sendVerificationCode(user.phoneNumber);
    
    if (!verificationResult.success) {
      return res.status(500).json({
        status: 'error',
        message: 'Failed to send verification code',
        details: verificationResult.status
      });
    }

    res.status(200).json({
      status: 'success',
      message: 'Verification code sent successfully'
    });
  } catch (error) {
    console.error('Email change initiation error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error initiating email change'
    });
  }
};

const verifyAndChangeEmail = async (req, res) => {
  try {
    const { newEmail, verificationCode } = req.body;
    const user = req.user;

    // Verify the code using Twilio Verify
    const verificationResult = await verifyCode(user.phoneNumber, verificationCode);
    
    if (!verificationResult.success) {
      return res.status(401).json({
        status: 'error',
        message: 'Invalid or expired verification code'
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
    res.status(500).json({
      status: 'error',
      message: 'Error changing email'
    });
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

module.exports = {
  updateProfile,
  changePassword,
  initiateEmailChange,
  verifyAndChangeEmail,
  updateProfilePicture
}; 