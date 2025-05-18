const express = require('express');
const router = express.Router();
const multer = require('multer');
const { adminAuth } = require('../middleware/auth');
const {
  getAllUsers,
  getUserDetails,
  banUser,
  deleteUser,
  sendEmail,
  uploadDocumentForUser,
  getAllDownloadedDocuments,
  getAllDocuments,
  getEmailHistory,
  getDashboardStats
} = require('../controllers/adminController');
const User = require('../models/User');

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept common file types
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'image/jpeg',
      'image/png',
      'text/plain'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF, DOC, DOCX, XLS, XLSX, JPG, PNG, and TXT files are allowed.'));
    }
  }
});

// Admin routes
router.get('/users', adminAuth, getAllUsers);
router.get('/users/:userId', adminAuth, getUserDetails);
router.put('/users/:id/ban', adminAuth, banUser);
router.delete('/users/:id', adminAuth, deleteUser);
router.post('/send-email',adminAuth, upload.array('attachments', 5), sendEmail);
router.get('/emails', adminAuth, getEmailHistory);
router.post('/users/:userId/upload-document', adminAuth, upload.single('document'), uploadDocumentForUser);
router.get('/downloads',adminAuth, getAllDownloadedDocuments);
router.get('/documents',adminAuth, getAllDocuments);
router.get('/stats', adminAuth, getDashboardStats);

// Protected admin routes
router.get('/admin/', adminAuth, (req, res) => {
  res.json({
    status: 'success',
    message: 'Welcome to admin dashboard',
    data: {
      user: {
        id: req.user._id,
        email: req.user.email,
        role: req.user.role
      }
    }
  });
});

// Add more admin routes here
router.get('/users', adminAuth, async (req, res) => {
  try {
    const users = await User.find({ role: 'user' }).select('-password');
    res.json({
      status: 'success',
      data: { users }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error fetching users'
    });
  }
});

module.exports = router; 