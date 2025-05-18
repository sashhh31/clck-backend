const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { auth } = require('../middleware/auth');
const {
  updateProfile,
  changePassword,
  initiateEmailChange,
  verifyAndChangeEmail,
  updateProfilePicture
} = require('../controllers/profileController');

// Configure multer for file upload
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/profile-pictures');
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG and GIF are allowed.'));
    }
  }
});

// Profile routes
router.put('/update', auth, updateProfile);
router.put('/change-password', auth, changePassword);
router.post('/initiate-email-change', auth, initiateEmailChange);
router.post('/verify-and-change-email', auth, verifyAndChangeEmail);
router.post('/update-picture', auth, upload.single('profilePicture'), updateProfilePicture);

module.exports = router; 