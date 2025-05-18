const User = require('../models/User');
const { cloudinary } = require('../config/cloudinary');

const getMe = async (req, res) => {
  try {
    const userId = req.user._id;

    // req.user is set by the auth middleware
    const user = await User.findOne({ _id: userId });
    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    // If no profile picture, return first letter of first name
    const profilePicture = user.profilePicture || {
      type: 'initial',
      value: user.firstName.charAt(0).toUpperCase()
    };

    res.status(200).json({
      status: 'success',
      data: {
        user: {
          ...user.toObject(),
          profilePicture
        }
      }
    });
  } catch (error) {
    console.error('Error getting user:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error getting user information'
    });
  }
};

const uploadProfilePicture = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        status: 'error',
        message: 'No file uploaded'
      });
    }

    const userId = req.user._id;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    // If user already has a profile picture, delete the old one from Cloudinary
    if (user.profilePicture) {
      const publicId = user.profilePicture.split('/').pop().split('.')[0];
      await cloudinary.uploader.destroy(publicId);
    }

    // Update user's profile picture URL
    user.profilePicture = req.file.path;
    await user.save();

    res.status(200).json({
      status: 'success',
      data: {
        profilePicture: user.profilePicture
      }
    });
  } catch (error) {
    console.error('Error uploading profile picture:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error uploading profile picture'
    });
  }
};

module.exports = {
  getMe,
  uploadProfilePicture
}; 