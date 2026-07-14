const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const multer = require('multer');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

// ===== Supabase =====
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// ===== Multer (memory storage) =====
const storage = multer.memoryStorage();
const videoUpload = multer({
  storage: storage,
  limits: { fileSize: 2 * 1024 * 1024 * 1024 } // 2GB
});

// ===== Helper: Upload to Supabase =====
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

// ===== UPLOAD VIDEO =====
router.post('/',
  videoUpload.fields([
    { name: 'thumbnail', maxCount: 1 },
    { name: 'video', maxCount: 1 }
  ]),
  async (req, res) => {
    try {
      console.log('Upload request received');
      console.log('Files:', req.files);
      console.log('Body:', req.body);

      if (!req.files || !req.files.thumbnail || !req.files.video) {
        return res.status(400).json({ message: 'Both thumbnail and video files are required' });
      }

      const { title, description, genre, releaseDate } = req.body;
      const userId = req.user.id; // Must have auth middleware (we'll assume it's set)

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
            connect: { id: parseInt(userId) }
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
  }
);

// ===== GET PREMIUM VIDEOS (last 30 days, approved) =====
router.get('/premium', async (req, res) => {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const videos = await prisma.video.findMany({
      where: {
        createdAt: { gte: thirtyDaysAgo },
        status: 'APPROVED'
      },
      include: {
        user: {
          select: { firstName: true, lastName: true }
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
});

// ===== GET TRENDING VIDEOS (older than 30 days, approved) =====
router.get('/trending', async (req, res) => {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const videos = await prisma.video.findMany({
      where: {
        createdAt: { lt: thirtyDaysAgo },
        status: 'APPROVED'
      },
      include: {
        user: {
          select: { firstName: true, lastName: true }
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
});

// ============================================================
//  GET VIDEO BY ID – ENHANCED (with comments, replies, likes, subscriptions)
// ============================================================
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user ? parseInt(req.user.id) : null;

    // 1. Fetch video with user info and basic counts
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
          select: { comments: true }
        }
      }
    });

    if (!video) {
      return res.status(404).json({ message: 'Video not found' });
    }

    // 2. Count likes and dislikes
    const likeCount = await prisma.like.count({
      where: { videoId: parseInt(id), type: 'LIKE' }
    });
    const dislikeCount = await prisma.like.count({
      where: { videoId: parseInt(id), type: 'DISLIKE' }
    });

    // 3. Get ratings
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

    // 4. Get subscriber count for the uploader
    const subscriberCount = await prisma.subscription.count({
      where: { creatorId: video.userId }
    });

    // 5. Check if current user liked/disliked/subscribed
    let isLiked = false;
    let isDisliked = false;
    let isSubscribed = false;

    if (userId) {
      const userLike = await prisma.like.findFirst({
        where: {
          userId,
          videoId: parseInt(id),
          type: { in: ['LIKE', 'DISLIKE'] }
        }
      });
      if (userLike) {
        if (userLike.type === 'LIKE') isLiked = true;
        else isDisliked = true;
      }

      const subscription = await prisma.subscription.findFirst({
        where: {
          userId,
          creatorId: video.userId
        }
      });
      if (subscription) isSubscribed = true;
    }

    // 6. Fetch comments with replies and likes (for the frontend)
    const comments = await prisma.comment.findMany({
      where: { videoId: parseInt(id) },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            profilePicture: true
          }
        },
        likes: true,
        replies: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                profilePicture: true
              }
            },
            likes: true,
            replies: {
              include: {
                user: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    profilePicture: true
                  }
                },
                likes: true
              }
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Format comments to match frontend expectations
    const formattedComments = comments.map(comment => {
      // Format likes count for comment
      const commentLikes = comment.likes.filter(l => l.type === 'LIKE').length;
      // Format replies recursively (2 levels deep)
      const formatReplies = (replies) => {
        return replies.map(reply => ({
          id: reply.id,
          text: reply.text,
          createdAt: reply.createdAt,
          user: reply.user,
          _count: {
            likes: reply.likes.filter(l => l.type === 'LIKE').length
          },
          replies: reply.replies ? formatReplies(reply.replies) : []
        }));
      };

      return {
        id: comment.id,
        text: comment.text,
        createdAt: comment.createdAt,
        user: comment.user,
        _count: {
          likes: commentLikes
        },
        replies: formatReplies(comment.replies)
      };
    });

    // 7. Build response
    const response = {
      ...video,
      averageRating: avgRating,
      userRating: userRating,
      likeCount,
      dislikeCount,
      commentCount: video._count.comments,
      subscriberCount,
      isLiked,
      isDisliked,
      isSubscribed,
      comments: formattedComments,
      // Ensure user has subscriberCount for frontend
      user: {
        ...video.user,
        subscriberCount
      }
    };

    // Remove internal fields
    delete response._count;

    res.json(response);
  } catch (error) {
    console.error('Error fetching video:', error);
    res.status(500).json({
      message: 'Failed to fetch video',
      error: error.message
    });
  }
});

// ===== DELETE VIDEO (with cascade and ownership check) =====
router.delete('/:id', async (req, res) => {
  try {
    const videoId = parseInt(req.params.id);
    if (isNaN(videoId)) {
      return res.status(400).json({ message: 'Invalid video ID' });
    }

    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ message: 'Invalid token' });
    }

    const userId = decoded.id || decoded.userId;
    if (!userId) {
      return res.status(400).json({ message: 'User ID missing from token' });
    }

    const video = await prisma.video.findUnique({
      where: { id: videoId },
      select: { userId: true }
    });
    if (!video) {
      return res.status(404).json({ message: 'Video not found' });
    }

    const isAdmin = decoded.role === 'ADMIN' || decoded.role === 'SUPER_ADMIN';
    if (video.userId !== userId && !isAdmin) {
      return res.status(403).json({ message: 'Permission denied' });
    }

    // Transaction to delete all related records
    await prisma.$transaction(async (prisma) => {
      await prisma.reply.deleteMany({ where: { videoId } });
      await prisma.comment.deleteMany({ where: { videoId } });
      await prisma.like.deleteMany({ where: { videoId } });
      await prisma.rating.deleteMany({ where: { videoId } });
      await prisma.trivia.deleteMany({ where: { videoId } });
      await prisma.subscription.deleteMany({ where: { videoId } });
      await prisma.video.delete({ where: { id: videoId } });
    });

    res.json({ message: 'Video deleted successfully' });
  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({
      message: 'Failed to delete video',
      error: error.message
    });
  }
});

module.exports = router;