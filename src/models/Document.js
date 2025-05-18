const mongoose = require('mongoose');

const documentSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  fileName: {
    type: String,
    required: true
  },
  fileType: {
    type: String,
    required: true,
    enum: ['application/pdf', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'] // PDF and XLSX only
  },
  fileSize: {
    type: Number,
    required: true,
    max: 20 * 1024 * 1024 // 20MB max
  },
  cloudinaryId: {
    type: String,
    required: true,
    unique: true // Add unique constraint here
  },
  cloudinaryUrl: {
    type: String,
    required: true
  },
  downloaded: {
    type: Boolean,
    default: false
  },
  status: {
    type: String,
    enum: ['processing', 'completed', 'failed'],
    default: 'processing'
  },
  metadata: {
    type: Map,
    of: String
  },
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Index for faster queries
documentSchema.index({ userId: 1, createdAt: -1 });

// Drop any existing indexes before creating new ones
documentSchema.pre('save', async function(next) {
  try {
    await this.collection.dropIndexes();
    next();
  } catch (error) {
    next();
  }
});

module.exports = mongoose.model('Document', documentSchema); 