const mongoose = require('mongoose');

const emailSchema = new mongoose.Schema({
  to: [{
    type: String,
    required: true
  }],
  cc: [{
    type: String,
    required: false
  }],
  subject: {
    type: String,
    required: true
  },
  message: {
    type: String,
    required: true
  },
  attachments: [{
    filename: String,
    path: String
  }],
  sentBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  status: {
    type: String,
    enum: ['sent', 'failed'],
    default: 'sent'
  },
  sentAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Email', emailSchema); 