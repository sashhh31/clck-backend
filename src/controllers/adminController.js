const User = require('../models/User');
const Document = require('../models/Document');
const Video = require('../models/Video');
const cloudinary = require('cloudinary').v2;
const { v4: uuidv4 } = require('uuid');
const Email = require('../models/Email');
const { sendEmail: sendResendEmail } = require('../services/resendService');
const path = require('path');
const streamifier = require('streamifier');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const getAllUsers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    const users = await User.find()
      .select('-password -twoFactorAuth.secret')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const total = await User.countDocuments();

    res.status(200).json({
      status: 'success',
      data: {
        users: users.map(user => ({
          id: user._id,
          email: user.email,
          phoneNumber: user.phoneNumber,
          role: user.role,
          status: user.status,
          subscription: user.subscription,
          createdAt: user.createdAt
        })),
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error fetching users'
    });
  }
};

const banUser = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    user.status = 'banned';
    await user.save();

    res.status(200).json({
      status: 'success',
      message: 'User banned successfully'
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error banning user'
    });
  }
};

const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    // Delete user's documents from Cloudinary
    const documents = await Document.find({ userId: id });
    for (const doc of documents) {
      await cloudinary.uploader.destroy(doc.cloudinaryId);
    }

    // Delete user's videos from Vimeo
    const videos = await Video.find({ userId: id });
    for (const video of videos) {
      await vimeoClient.request({
        method: 'DELETE',
        path: video.vimeoUri
      });
    }

    // Delete user's records from database
    await Document.deleteMany({ userId: id });
    await Video.deleteMany({ userId: id });
    await user.deleteOne();

    res.status(200).json({
      status: 'success',
      message: 'User and all associated data deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error deleting user'
    });
  }
};

const sendEmail = async (req, res) => {
  try {
    const { userId, subject, message } = req.body;
    console.log('Request body:', req.body);
    
    const to = Array.isArray(req.body.to) ? req.body.to : [req.body.to];
    const cc = Array.isArray(req.body.cc) ? req.body.cc : req.body.cc ? [req.body.cc] : [];
   
    // Only try to find user if userId is provided and not empty
    let user = null;
    if (userId && userId.trim() !== '') {
      user = await User.findById(userId);
      console.log('Found user:', user);
      
      if (!user) {
        return res.status(404).json({
          status: 'error',
          message: 'User not found'
        });
      }
    }

    // Handle file attachments
    const attachments = [];

    if (req.files && req.files.length > 0) {
      attachments.push(...req.files.map(file => ({
        filename: file.originalname,
        content: file.buffer
      })));
    }

    const userid = req.user._id;
    // Create email record in database
    const emailRecord = new Email({
      to,
      cc,
      subject,
      message,
      attachments: attachments.map(att => ({
        filename: att.filename
      })),
      sentBy: userid // Use the admin's ID who is sending the email
    });

    try {
      // Send email using Resend
      await sendResendEmail({
        to,
        cc,
        subject,
        text: message,
        attachments
      });

      // Save email record to DB
      await emailRecord.save();

      res.status(200).json({
        status: 'success',
        message: 'Email sent successfully',
        data: emailRecord
      });
    } catch (emailError) {
      console.error('Error in email sending process:', emailError);
      throw emailError; // Re-throw to be caught by outer catch
    }

  } catch (error) {
    console.error('Error sending email:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error sending email',
      error: error.message
    });
  }
};

const uploadDocumentForUser = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        status: 'error',
        message: 'No file uploaded'
      });
    }

    const { userId } = req.params;
    const ext = path.extname(req.file.originalname);

    // Check if user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    // Use buffer with Cloudinary's upload_stream
    const uploadPromise = new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          resource_type: 'raw',
          folder: `documents/${userId}`,
          public_id: `${uuidv4()}${ext}`,
          overwrite: true
        },
        (error, result) => {
          if (error) {
            reject(error);
            return;
          }
          resolve(result);
        }
      );
      
      // Convert buffer to stream and pipe to uploadStream
      streamifier.createReadStream(req.file.buffer).pipe(uploadStream);
    });
    
    const result = await uploadPromise;
    const extension = req.file.originalname.split('.').pop();
    const downloadUrl = `https://res.cloudinary.com/${result.cloud_name}/raw/upload/v${result.version}/${result.public_id}.${extension}`;

    // Create document record
    const document = new Document({
      userId,
      fileName: req.file.originalname,
      fileType: req.file.mimetype,
      fileSize: req.file.size,
      cloudinaryId: result.public_id,
      cloudinaryUrl: downloadUrl,
      uploadedBy: req.user._id // Admin's ID
    });

    await document.save();

    res.status(201).json({
      status: 'success',
      data: {
        document: {
          id: document._id,
          fileName: document.fileName,
          fileType: document.fileType,
          fileSize: document.fileSize,
          url: document.cloudinaryUrl,
          createdAt: document.createdAt
        }
      }
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error uploading document: ' + error.message
    });
  }
};

const getAllDownloadedDocuments = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    const documents = await Document.find({ downloaded: true })
      .populate('userId', 'email')
      .populate('uploadedBy', 'email')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const total = await Document.countDocuments({ downloaded: true });

    res.status(200).json({
      status: 'success',
      data: {
        documents: documents.map(doc => ({
          id: doc._id,
          fileName: doc.fileName,
          fileType: doc.fileType,
          fileSize: doc.fileSize,
          url: doc.cloudinaryUrl,
          downloaded: doc.downloaded,
          createdAt: doc.createdAt,
          downloadedBy: {
            name: doc.userId.email.split('@')[0],
            email: doc.userId.email
          }
        })),
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error fetching downloaded documents'
    });
  }
};

// Helper function to format file type
const formatFileType = (mimeType) => {
  const typeMap = {
    'application/pdf': 'PDF',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'XLSX',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
    'application/msword': 'DOC',
    'application/vnd.ms-excel': 'XLS',
    'text/plain': 'TXT',
    'text/csv': 'CSV',
    'image/jpeg': 'JPG',
    'image/png': 'PNG',
    'application/zip': 'ZIP',
    'application/x-zip-compressed': 'ZIP'
  };
  
  return typeMap[mimeType] || mimeType.split('/').pop().toUpperCase();
};

const getAllDocuments = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    const documents = await Document.find()
      .populate('userId', 'email')
      .populate('uploadedBy', 'email')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const total = await Document.countDocuments();

    res.status(200).json({
      status: 'success',
      data: {
        documents: documents.map(doc => ({
          id: doc._id,
          fileName: doc.fileName,
          fileType: formatFileType(doc.fileType),
          fileSize: doc.fileSize,
          url: doc.cloudinaryUrl,
          downloaded: doc.downloaded,
          createdAt: doc.createdAt,
          uploadedBy: {
            name: doc.uploadedBy.email.split('@')[0],
            email: doc.uploadedBy.email
          },
          owner: {
            name: doc.userId.email.split('@')[0],
            email: doc.userId.email
          }
        })),
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error fetching documents'
    });
  }
};

// Add new controller to get email history
const getEmailHistory = async (req, res) => {
  try {
    const { page = 1, limit = 10, search } = req.query;
    const skip = (page - 1) * limit;

    let query = {};
    if (search) {
      query = {
        $or: [
          { to: { $regex: search, $options: 'i' } },
          { cc: { $regex: search, $options: 'i' } },
          { subject: { $regex: search, $options: 'i' } }
        ]
      };
    }

    const emails = await Email.find(query)
      .sort({ sentAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('sentBy', 'name email');

    const total = await Email.countDocuments(query);

    res.status(200).json({
      status: 'success',
      data: {
        emails,
        total,
        page: parseInt(page),
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error fetching email history',
      error: error.message
    });
  }
};

const getDashboardStats = async (req, res) => {
  try {
    // Get all required data
    const [users, documents, downloads, emails] = await Promise.all([
      User.find().select('-password -twoFactorAuth.secret'),
      Document.find(),
      Document.find({ downloaded: true }),
      Email.find()
    ]);

    // Calculate stats
    const stats = {
      totalUsers: users.length,
      totalDownloads: downloads.length,
      totalDocuments: documents.length,
      totalEmails: emails.length,
      userGrowth: 9.1, // These would be calculated based on historical data
      downloadGrowth: 7.2,
      documentGrowth: -2.1,
      emailGrowth: 7.2
    };

    // Calculate subscription stats
    const subscriptionCounts = users.reduce((acc, user) => {
      if (user.subscription?.plan) {
        acc[user.subscription.plan.toLowerCase()] = (acc[user.subscription.plan.toLowerCase()] || 0) + 1;
      }
      return acc;
    }, {});

    const subscriptionStats = {
      total: Object.values(subscriptionCounts).reduce((a, b) => a + b, 0),
      basic: subscriptionCounts.basic || 0,
      professional: subscriptionCounts.professional || 0,
      entrepreneur: subscriptionCounts.entrepreneur || 0
    };

    // Calculate earnings (this would be calculated based on actual subscription data)
    const earnings = {
      total: "120K",
      monthly: [16, 28, 10, 20, 16, 12, 18]
    };

    res.status(200).json({
      status: 'success',
      data: {
        stats,
        subscriptionStats,
        earnings
      }
    });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error fetching dashboard stats'
    });
  }
};

const getUserDetails = async (req, res) => {
  try {
    const { userId } = req.params;

    // Get user details
    const user = await User.findById(userId)
      .select('-password -twoFactorAuth.secret');
    
    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    // Get user's documents
    const documents = await Document.find({ userId })
      .sort({ createdAt: -1 });

    // Get user's downloaded documents
    const downloadedDocuments = await Document.find({ 
      userId,
      downloaded: true 
    }).sort({ createdAt: -1 });

    // Get user's emails
    const emails = await Email.find({ 
      to: user.email 
    }).sort({ sentAt: -1 });

    res.status(200).json({
      status: 'success',
      data: {
        user: {
          id: user._id,
          email: user.email,
          phoneNumber: user.phoneNumber,
          role: user.role,
          status: user.status,
          subscription: user.subscription,
          createdAt: user.createdAt
        },
        documents: documents.map(doc => ({
          id: doc._id,
          fileName: doc.fileName,
          fileType: formatFileType(doc.fileType),
          fileSize: doc.fileSize,
          url: doc.cloudinaryUrl,
          createdAt: doc.createdAt
        })),
        downloadedFiles: downloadedDocuments.map(doc => ({
          id: doc._id,
          fileName: doc.fileName,
          fileType: formatFileType(doc.fileType),
          fileSize: doc.fileSize,
          url: doc.cloudinaryUrl,
          createdAt: doc.createdAt
        })),
        emails: emails.map(email => ({
          id: email._id,
          subject: email.subject,
          message: email.message,
          attachments: email.attachments,
          sentAt: email.sentAt
        }))
      }
    });
  } catch (error) {
    console.error('Error fetching user details:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error fetching user details'
    });
  }
};

module.exports = {
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
}; 