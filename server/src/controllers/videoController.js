const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const path = require('path');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

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

    const thumbnailUrl = await uploadToSupabase(thumbnailFile, 'thumbnails');
    const videoUrl = await uploadToSupabase(videoFile, 'videos');

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

// ============================================================
//  getVideoById – FIXED: remove 'dislikes' and invalid fields
// ============================================================
const getVideoById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user ? parseInt(req.user.id) : null;

    // 1. Fetch video with user info (only valid fields) and counts
    const video = await prisma.video.findUnique({
      where: { id: parseInt(id) },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            profilePicture: true,
          }
        },
        _count: {
          select: {
            likes: true,      // valid
            comments: true,   // valid
            // dislikes does NOT exist – removed
            // subscribers may or may not exist – we'll handle below
          }
        }
      }
    });

    if (!video) {
      return res.status(404).json({ message: 'Video not found' });
    }

    // 2. Fetch ratings separately to compute average and user's rating
    const ratings = await prisma.rating.findMany({
      where: { videoId: parseInt(id) },
      select: { value: true, userId: true }
    });

    const avgRating = ratings.length > 0
      ? (ratings.reduce((sum, r) => sum + r.value, 0) / ratings.length).toFixed(1)
      : null;

    const userRating = userId
      ? ratings.find(r => r.userId === userId)?.value || null
      : null;

    // 3. Try to get subscriber count if the relation exists (maybe via a separate query)
    let subscriberCount = 0;
    try {
      // If your Video model has a subscribers relation, count it
      const count = await prisma.video.findUnique({
        where: { id: parseInt(id) },
        select: { _count: { select: { subscribers: true } } }
      });
      if (count) subscriberCount = count._count.subscribers;
    } catch (e) {
      // If 'subscribers' doesn't exist, keep 0
      subscriberCount = 0;
    }

    // 4. Build response
    const response = {
      ...video,
      averageRating: avgRating,
      userRating: userRating,
      likeCount: video._count.likes,
      dislikeCount: 0,                         // no dislikes table – set to 0
      commentCount: video._count.comments,
      subscriberCount: subscriberCount,        // from the separate query
      isLiked: false,                          // you can fetch this from a separate query if needed
      isDisliked: false,
      isSubscribed: false,
    };

    // Add subscriberCount to the user object for frontend compatibility
    if (response.user) {
      response.user.subscriberCount = subscriberCount;
    }

    // Clean up internal fields
    delete response._count;

    res.json(response);
  } catch (error) {
    console.error('Error fetching video:', error);
    res.status(500).json({
      message: 'Failed to fetch video',
      error: error.message
    });
  }
};

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
  getVideoById,
  getPendingVideos,
  approveVideo,
  rejectVideo
};