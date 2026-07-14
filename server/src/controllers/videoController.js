const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const path = require('path');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Helper to upload to Supabase
async function uploadToSupabase(file, folder) {
  const fileExt = path.extname(file.originalname);
  const fileName = `${folder}/${Date.now()}-${Math.round(Math.random() * 1E9)}${fileExt}`;
  const { data, error } = await supabase.storage
    .from('uploads')
    .upload(fileName, file.buffer, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.mimetype,
    });
  if (error) throw new Error(`Supabase upload error: ${error.message}`);
  const { data: { publicUrl } } = supabase.storage.from('uploads').getPublicUrl(fileName);
  return publicUrl;
}

const uploadVideo = async (req, res) => {
  try {
    console.log('Upload request received');
    console.log('Files:', req.files);
    console.log('Body:', req.body);

    if (!req.files || !req.files.thumbnail || !req.files.video) {
      return res.status(400).json({ message: 'Both thumbnail and video files are required' });
    }

    const { title, description, genre, releaseDate } = req.body;
    const userId = req.user.id;

    const releaseYear = new Date(releaseDate).getFullYear();
    if (isNaN(releaseYear)) {
      return res.status(400).json({ message: 'Invalid release date format' });
    }

    const thumbnailFile = req.files.thumbnail[0];
    const videoFile = req.files.video[0];

    // Upload to Supabase
    const thumbnailUrl = await uploadToSupabase(thumbnailFile, 'thumbnails');
    const videoUrl = await uploadToSupabase(videoFile, 'videos');

    // Create video record
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
    res.status(201).json({
      message: 'Video uploaded successfully and pending approval',
      video: {
        id: video.id,
        title: video.title,
        thumbnail: video.thumbnail,
        videoUrl: video.videoUrl,
        year: video.year,
        genre: video.genre,
        status: video.status
      }
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({
      message: 'Video upload failed',
      error: error.message
    });
  }
};

// Get premium videos (recent 30 days, approved)
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
      },
      orderBy: { createdAt: 'desc' },
      take: 20
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

// Get trending videos (older than 30 days, approved)
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
      },
      orderBy: { views: 'desc' },
      take: 20
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

// ==================== NEW: Get a single video by ID ====================
const getVideoById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user ? parseInt(req.user.id) : null;

    const video = await prisma.video.findUnique({
      where: { id: parseInt(id) },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            profilePicture: true,
            subscriberCount: true,
          }
        },
        likes: {
          where: { userId: userId || undefined },
          select: { id: true }
        },
        dislikes: {
          where: { userId: userId || undefined },
          select: { id: true }
        },
        ratings: {
          select: { value: true, userId: true }
        },
        _count: {
          select: {
            likes: true,
            dislikes: true,
            comments: true,
            subscribers: true
          }
        }
      }
    });

    if (!video) {
      return res.status(404).json({ message: 'Video not found' });
    }

    // Increment view count (optional – do it asynchronously)
    // We'll increment after sending the response to avoid blocking
    // await prisma.video.update({ where: { id: parseInt(id) }, data: { views: { increment: 1 } } });

    // Compute average rating
    const ratings = video.ratings || [];
    const avgRating = ratings.length > 0
      ? (ratings.reduce((sum, r) => sum + r.value, 0) / ratings.length).toFixed(1)
      : null;

    // Determine user's rating (if logged in)
    const userRating = userId
      ? ratings.find(r => r.userId === userId)?.value || null
      : null;

    const response = {
      ...video,
      averageRating: avgRating,
      userRating: userRating,
      likeCount: video._count.likes,
      dislikeCount: video._count.dislikes,
      commentCount: video._count.comments,
      subscriberCount: video._count.subscribers,
      isLiked: video.likes.length > 0,
      isDisliked: video.dislikes.length > 0,
      // Add subscription status if you have a subscription table – here we just leave as false
      isSubscribed: false,
    };

    // Remove internal _count and raw arrays to clean the response
    delete response._count;
    delete response.likes;
    delete response.dislikes;
    delete response.ratings;

    res.json(response);
  } catch (error) {
    console.error('Error fetching video:', error);
    res.status(500).json({
      message: 'Failed to fetch video',
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
      },
      orderBy: { createdAt: 'desc' }
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

// Approve video
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

// Reject video
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
  getVideoById,          // <-- NEW
  getPendingVideos,
  approveVideo,
  rejectVideo
};