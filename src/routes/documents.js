const express = require('express');
const router = express.Router();
const multer = require('multer');
const { auth } = require('../middleware/auth');
const {
  uploadDocument,
  downloadDocument,
  listDocuments,
  deleteDocument,
  getDownloadedDocuments,
  softDeleteDocument
} = require('../controllers/documentController');

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024 // 20MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept only PDF and XLSX files
    if (file.mimetype === 'application/pdf' || 
        file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF and XLSX files are allowed.'));
    }
  }
});

// Protected routes
router.post('/upload', auth, upload.single('file'), uploadDocument);
router.get('/download/:id', auth, downloadDocument);
router.get('/downloaded', auth, getDownloadedDocuments);
router.get('/', auth, listDocuments);
router.delete('/:id', auth, deleteDocument);
router.put('/soft-delete/:id', auth, softDeleteDocument);

module.exports = router; 