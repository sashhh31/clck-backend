const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const { upload } = require('../config/cloudinary');
const { getMe, uploadProfilePicture } = require('../controllers/userController');

// Protected route - get current user
router.get('/me', auth, getMe);
console.log(auth)

// Protected route - upload profile picture
router.post('/me/profile-picture', auth, upload.single('profilePicture'), uploadProfilePicture);

module.exports = router; 