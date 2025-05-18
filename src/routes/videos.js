const express = require('express');
const router = express.Router();
const multer = require('multer');
const { auth } = require('../middleware/auth');
const {
  uploadVideo,
  getVideoStatus,
  listVideos,
  deleteVideo,
  updateVideo
} = require('../controllers/videoController');

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 500 * 1024 * 1024 // 500MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.fieldname === 'video') {
      // Accept only video files for video field
      if (file.mimetype.startsWith('video/')) {
        cb(null, true);
      } else {
        cb(new Error('Invalid file type. Only video files are allowed.'));
      }
    } else if (file.fieldname === 'caption') {
      // Accept only VTT files for caption field
      if (file.mimetype === 'text/vtt' || file.originalname.endsWith('.vtt')) {
        cb(null, true);
      } else {
        cb(new Error('Invalid file type. Only VTT files are allowed for captions.'));
      }
    } else {
      cb(new Error('Unexpected field'));
    }
  }
});

// Protected routes
router.post('/upload', auth, upload.fields([
  { name: 'video', maxCount: 1 },
  { name: 'caption', maxCount: 1 }
]), uploadVideo);
router.get('/status/:id', auth, getVideoStatus);
router.get('/', auth, listVideos);
router.delete('/:id', auth, deleteVideo);
router.patch('/:id', auth, updateVideo);

module.exports = router; 