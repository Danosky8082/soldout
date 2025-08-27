const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const path = require('path');
const fs = require('fs');

const uploadVideo = async (req, res) => {
  try {
    console.log('Upload request received');
    console.log('Files:', req.files);
    console.log('Body:', req.body);
    
    // Validate required files
    if (!req.files || !req.files.thumbnail || !req.files.video) {
      return res.status(400).json({ message: 'Both thumbnail and video files are required' });
    }

    const { title, description, genre, releaseDate } = req.body;
    const userId = req.user.id;

    // Parse release date to get year
    const releaseYear = new Date(releaseDate).getFullYear();
    if (isNaN(releaseYear)) {
      return res.status(400).json({ message: 'Invalid release date format' });
    }

    // Get uploaded files
    const thumbnailFile = req.files.thumbnail[0];
    const videoFile = req.files.video[0];
    
    // Create relative paths for database storage
    const thumbnailUrl = `/uploads/${thumbnailFile.filename}`;
    const videoUrl = `/uploads/${videoFile.filename}`;

    // Create video in database using userId for relation
    const video = await prisma.video.create({
      data: {
        title,
        description,
        genre,
        year: releaseYear,
        thumbnail: thumbnailUrl,
        videoUrl: videoUrl,
        user: {
          connect: {
            id: parseInt(userId)
          }
        },
        status: 'PENDING'
      }
    });

    console.log('Video created:', video);

    // Respond with created video
    res.status(201).json({
      message: 'Video uploaded successfully and pending approval',
      video: {
        id: video.id,
        title: video.title,
        thumbnail: thumbnailUrl,
        videoUrl: videoUrl,
        year: video.year,
        genre: video.genre,
        status: video.status
      }
    });
  } catch (error) {
    console.error('Upload error:', error);
    
    // Clean up uploaded files if database operation failed
    if (req.files) {
      req.files.thumbnail?.forEach(f => {
        if (fs.existsSync(f.path)) fs.unlinkSync(f.path);
      });
      req.files.video?.forEach(f => {
        if (fs.existsSync(f.path)) fs.unlinkSync(f.path);
      });
    }
    
    res.status(500).json({ 
      message: 'Video upload failed',
      error: error.message
    });
  }
};

// Get premium videos (recent 30 days)
const getPremiumVideos = async (req, res) => {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const videos = await prisma.video.findMany({
      where: {
        createdAt: {
          gte: thirtyDaysAgo
        },
        status: 'APPROVED'
      },
      include: {
        user: {
          select: {
            firstName: true,
            lastName: true
          }
        }
      }
    });

    const formattedVideos = videos.map(video => ({
      ...video,
      uploaderName: `${video.user.firstName} ${video.user.lastName}`
    }));

    res.json(formattedVideos);
  } catch (error) {
    console.error('Premium videos error:', error);
    res.status(500).json({ 
      message: 'Failed to fetch videos',
      error: error.message
    });
  }
};

// Get trending videos (older than 30 days)
const getTrendingVideos = async (req, res) => {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const videos = await prisma.video.findMany({
      where: {
        createdAt: {
          lt: thirtyDaysAgo
        },
        status: 'APPROVED'
      },
      include: {
        user: {
          select: {
            firstName: true,
            lastName: true
          }
        }
      }
    });

    const formattedVideos = videos.map(video => ({
      ...video,
      uploaderName: `${video.user.firstName} ${video.user.lastName}`
    }));

    res.json(formattedVideos);
  } catch (error) {
    console.error('Trending videos error:', error);
    res.status(500).json({ 
      message: 'Failed to fetch videos',
      error: error.message
    });
  }
};

// Get pending videos (admin only)
const getPendingVideos = async (req, res) => {
  try {
    if (!req.user.canApprove) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized to view pending videos'
      });
    }

    const videos = await prisma.video.findMany({
      where: { status: 'PENDING' },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true
          }
        }
      }
    });

    res.status(200).json({
      success: true,
      videos
    });
  } catch (error) {
    console.error('Error fetching pending videos:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch pending videos',
      error: error.message
    });
  }
};

// Approve video (admin only)
const approveVideo = async (req, res) => {
  try {
    const { videoId } = req.params;

    const video = await prisma.video.update({
      where: { id: parseInt(videoId) },
      data: {
        status: 'APPROVED',
        approvedAt: new Date()
      }
    });

    res.status(200).json({
      success: true,
      message: 'Video approved successfully',
      video
    });
  } catch (error) {
    console.error('Error approving video:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to approve video',
      error: error.message
    });
  }
};

// Reject video (admin only)
const rejectVideo = async (req, res) => {
  try {
    const { videoId } = req.params;
    const { reason } = req.body;

    const video = await prisma.video.update({
      where: { id: parseInt(videoId) },
      data: {
        status: 'REJECTED',
        rejectedAt: new Date(),
        rejectionReason: reason
      }
    });

    res.status(200).json({
      success: true,
      message: 'Video rejected successfully',
      video
    });
  } catch (error) {
    console.error('Error rejecting video:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reject video',
      error: error.message
    });
  }
};

module.exports = {
  uploadVideo,
  getPremiumVideos,
  getTrendingVideos,
  getPendingVideos,
  approveVideo,
  rejectVideo
};