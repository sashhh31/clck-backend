const cloudinary = require('cloudinary').v2;
const Document = require('../models/Document');
const { v4: uuidv4 } = require('uuid');
const streamifier = require('streamifier');
const path = require('path');
// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const uploadDocument = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        status: 'error',
        message: 'No file uploaded'
      });
    }
    const userId = req.user._id;
    const ext = path.extname(req.file.originalname); // e.g., '.xlsx'
    console.log(ext);
    console.log(req.file.originalname);
    // Use buffer with Cloudinary's upload_stream
    const uploadPromise = new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          resource_type: 'raw',
          folder: `documents/${userId}`,
          public_id: `${uuidv4()}${ext}`, // include file extension here!
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
      uploadedBy: userId
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


const downloadDocument = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const document = await Document.findOne({ _id: id, userId });

    if (!document) {
      return res.status(404).json({
        status: 'error',
        message: 'Document not found'
      });
    }

    const fileExtension = path.extname(document.fileName).slice(1); // remove dot

    const signedUrl = cloudinary.utils.private_download_url(
      document.cloudinaryId, // this includes the full public_id WITH extension
      fileExtension,
      {
        type: 'upload',
        resource_type: 'raw',
        expires_at: Math.floor(Date.now() / 1000) + 3600
      }
    );

    document.downloaded = true;
    await document.save();

    res.status(200).json({
      status: 'success',
      data: {
        downloadUrl: signedUrl
      }
    });
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error generating download URL'
    });
  }
};


const listDocuments = async (req, res) => {
  try {
    const userId = req.user._id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    const documents = await Document.find({ userId })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const total = await Document.countDocuments({ userId });
    console.log(documents);
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
          createdAt: doc.createdAt
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

const deleteDocument = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const document = await Document.findOne({
      _id: id,
      userId
    });

    if (!document) {
      return res.status(404).json({
        status: 'error',
        message: 'Document not found'
      });
    }

    // Delete from Cloudinary
    await cloudinary.uploader.destroy(document.cloudinaryId);

    // Delete from database
    await document.deleteOne();

    res.status(200).json({
      status: 'success',
      message: 'Document deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error deleting document'
    });
  }
};

const getDownloadedDocuments = async (req, res) => {
  try {
    const userId = req.user._id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    const documents = await Document.find({ userId, downloaded: true })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const total = await Document.countDocuments({ userId, downloaded: true });

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
          downloadedBy: doc.uploadedBy
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

const softDeleteDocument = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const document = await Document.findOne({
      _id: id,
      userId
    });

    if (!document) {
      return res.status(404).json({
        status: 'error',
        message: 'Document not found'
      });
    }

    // Update the document's downloaded status to false
    document.downloaded = false;
    await document.save();

    res.status(200).json({
      status: 'success',
      message: 'Document removed from downloads successfully'
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error removing document from downloads'
    });
  }
};

module.exports = {
  uploadDocument,
  downloadDocument,
  listDocuments,
  deleteDocument,
  getDownloadedDocuments,
  softDeleteDocument
}; 