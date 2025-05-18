const Video = require('../models/Video');
const cloudinary = require('../config/cloudinary');
const { v4: uuidv4 } = require('uuid');
const { Readable } = require('stream');

// Upload video to Cloudinary
const uploadVideo = async (req, res) => {
  try {
    const { title, description } = req.body;
    
    if (!req.files || !req.files.video || !req.files.video[0]) {
      return res.status(400).json({ error: 'No video file provided' });
    }

    const videoFile = req.files.video[0];
    const captionFile = req.files.caption ? req.files.caption[0] : null;
    // Convert buffer to stream for Cloudinary
    const videoStream = Readable.from(videoFile.buffer);

    // Upload video to Cloudinary
    const result = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          resource_type: "video",
          folder: "videos",
          public_id: `video_${uuidv4()}`,
          chunk_size: 6000000, // 6MB chunks
          eager: [
            { format: "mp4", quality: "auto" },
            { format: "webm", quality: "auto" }
          ],
          eager_async: true
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );

      videoStream.pipe(uploadStream);
    });

    // Create video record in database
    const video = new Video({
      title,
      description,
      cloudinaryId: result.public_id,
      videoUrl: result.secure_url,
      thumbnailUrl: result.secure_url.replace(/\.[^/.]+$/, ".jpg"),
      status: "ready",
      duration: result.duration,
      userId: req.user.id,
      uploadedBy: req.user.id
    });

    await video.save();

    // If caption file is provided, upload it to Cloudinary
    if (captionFile) {
      try {
        const captionStream = Readable.from(captionFile.buffer);
        await new Promise((resolve, reject) => {
          const uploadStream = cloudinary.uploader.upload_stream(
            {
              resource_type: "raw",
              folder: "captions",
              public_id: `${result.public_id}_caption`,
              format: "vtt"
            },
            (error, result) => {
              if (error) reject(error);
              else resolve(result);
            }
          );

          captionStream.pipe(uploadStream);
        });
      } catch (error) {
        console.error('Error uploading caption:', error);
        // Don't fail the whole request if caption upload fails
      }
    }

    res.status(201).json({
      message: 'Video uploaded successfully',
      video: {
        id: video._id,
        title: video.title,
        description: video.description,
        videoUrl: video.videoUrl,
        thumbnailUrl: video.thumbnailUrl,
        status: video.status,
        duration: video.duration
      }
    });
  } catch (error) {
    console.error('Error uploading video:', error);
    res.status(500).json({ error: 'Failed to upload video' });
  }
};

// Get video status
const getVideoStatus = async (req, res) => {
  try {
    console.log('Getting video status for ID:', req.params.id);
    console.log('User ID:', req.user.id);

    const video = await Video.findOne({
      _id: req.params.id,
      userId: req.user.id
    });

    if (!video) {
      console.log('Video not found');
      return res.status(404).json({ error: 'Video not found' });
    }

    console.log('Video found:', {
      id: video._id,
      status: video.status,
      videoUrl: video.videoUrl
    });

    res.json({
      video: {
        id: video._id,
        status: video.status,
        videoUrl: video.videoUrl,
        thumbnailUrl: video.thumbnailUrl,
        title: video.title,
        description: video.description,
        duration: video.duration
      }
    });
  } catch (error) {
    console.error('Error getting video status:', error);
    // Send more detailed error information
    res.status(500).json({ 
      error: 'Failed to get video status',
      details: error.message
    });
  }
};

// List videos
const listVideos = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const videos = await Video.find({})
    .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);


    const total = await Video.countDocuments({ userId: req.user.id });

    res.json({
      videos: videos.map(video => ({
        id: video._id,
        title: video.title,
        description: video.description,
        videoUrl: video.videoUrl,
        thumbnailUrl: video.thumbnailUrl,
        status: video.status,
        duration: video.duration,
        createdAt: video.createdAt
      })),
      pagination: {
        total,
        pages: Math.ceil(total / limit),
        current: page
      }
    });
  } catch (error) {
    console.error('Error listing videos:', error);
    res.status(500).json({ error: 'Failed to list videos' });
  }
};

// Delete video
const deleteVideo = async (req, res) => {
  try {
    const video = await Video.findOne({
      _id: req.params.id,
      userId: req.user.id
    });

    if (!video) {
      return res.status(404).json({ error: 'Video not found' });
    }

    // Delete video from Cloudinary
    await cloudinary.uploader.destroy(video.cloudinaryId, {
      resource_type: "video"
    });

    // Delete video record from database
    await Video.deleteOne({ _id: video._id });

    res.json({ message: 'Video deleted successfully' });
  } catch (error) {
    console.error('Error deleting video:', error);
    res.status(500).json({ error: 'Failed to delete video' });
  }
};

// Update video
const updateVideo = async (req, res) => {
  try {
    const { title, description } = req.body;
    const video = await Video.findOne({
      _id: req.params.id,
      userId: req.user.id
    });

    if (!video) {
      return res.status(404).json({ error: 'Video not found' });
    }

    // Update video metadata in Cloudinary
    await cloudinary.uploader.rename(video.cloudinaryId, `videos/${title}`, {
      resource_type: "video"
    });

    // Update video record in database
    video.title = title;
    video.description = description;
    await video.save();

    res.json({
      message: 'Video updated successfully',
      video: {
        id: video._id,
        title: video.title,
        description: video.description,
        videoUrl: video.videoUrl,
        thumbnailUrl: video.thumbnailUrl,
        status: video.status
      }
    });
  } catch (error) {
    console.error('Error updating video:', error);
    res.status(500).json({ error: 'Failed to update video' });
  }
};

module.exports = {
  uploadVideo,
  getVideoStatus,
  listVideos,
  deleteVideo,
  updateVideo
}; 