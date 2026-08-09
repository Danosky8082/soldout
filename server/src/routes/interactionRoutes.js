const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { auth } = require('../middleware/auth');

// ===== LIKE / DISLIKE =====
const toggleLike = async (req, res) => {
  try {
    const { userId, videoId, commentId, replyId, isDislike } = req.body;

    if (!userId || (!videoId && !commentId && !replyId)) {
      return res.status(400).json({ error: 'User ID and target ID are required' });
    }

    const type = isDislike ? 'DISLIKE' : 'LIKE';
    let targetType = 'video';
    let targetId = videoId;

    if (commentId) {
      targetType = 'comment';
      targetId = commentId;
    } else if (replyId) {
      targetType = 'reply';
      targetId = replyId;
    }

    // Check if like exists
    const existing = await prisma.like.findFirst({
      where: {
        userId: parseInt(userId),
        ...(targetType === 'video' && { videoId: parseInt(targetId) }),
        ...(targetType === 'comment' && { commentId: parseInt(targetId) }),
        ...(targetType === 'reply' && { replyId: parseInt(targetId) })
      }
    });

    if (existing) {
      // If same type, remove it (toggle off)
      if (existing.type === type) {
        await prisma.like.delete({ where: { id: existing.id } });
        // Get updated counts
        let likeCount, dislikeCount;
        if (targetType === 'video') {
          likeCount = await prisma.like.count({ where: { videoId: parseInt(targetId), type: 'LIKE' } });
          dislikeCount = await prisma.like.count({ where: { videoId: parseInt(targetId), type: 'DISLIKE' } });
        } else if (targetType === 'comment') {
          likeCount = await prisma.like.count({ where: { commentId: parseInt(targetId), type: 'LIKE' } });
          dislikeCount = await prisma.like.count({ where: { commentId: parseInt(targetId), type: 'DISLIKE' } });
        } else {
          likeCount = await prisma.like.count({ where: { replyId: parseInt(targetId), type: 'LIKE' } });
          dislikeCount = await prisma.like.count({ where: { replyId: parseInt(targetId), type: 'DISLIKE' } });
        }
        return res.json({ likes: likeCount, dislikes: dislikeCount, likeCount, action: 'removed' });
      } else {
        // Different type - update
        await prisma.like.update({
          where: { id: existing.id },
          data: { type }
        });
      }
    } else {
      // Create new like
      await prisma.like.create({
        data: {
          type,
          userId: parseInt(userId),
          ...(targetType === 'video' && { videoId: parseInt(targetId) }),
          ...(targetType === 'comment' && { commentId: parseInt(targetId) }),
          ...(targetType === 'reply' && { replyId: parseInt(targetId) })
        }
      });
    }

    // Get updated counts
    let likeCount, dislikeCount;
    if (targetType === 'video') {
      likeCount = await prisma.like.count({ where: { videoId: parseInt(targetId), type: 'LIKE' } });
      dislikeCount = await prisma.like.count({ where: { videoId: parseInt(targetId), type: 'DISLIKE' } });
    } else if (targetType === 'comment') {
      likeCount = await prisma.like.count({ where: { commentId: parseInt(targetId), type: 'LIKE' } });
      dislikeCount = await prisma.like.count({ where: { commentId: parseInt(targetId), type: 'DISLIKE' } });
    } else {
      likeCount = await prisma.like.count({ where: { replyId: parseInt(targetId), type: 'LIKE' } });
      dislikeCount = await prisma.like.count({ where: { replyId: parseInt(targetId), type: 'DISLIKE' } });
    }

    res.json({ likes: likeCount, dislikes: dislikeCount, likeCount, action: 'updated' });
  } catch (error) {
    console.error('Like error:', error);
    res.status(500).json({ error: error.message });
  }
};

// ===== SUBSCRIBE =====
const toggleSubscribe = async (req, res) => {
  try {
    const { userId, videoId } = req.body;

    if (!userId || !videoId) {
      return res.status(400).json({ error: 'User ID and Video ID are required' });
    }

    // Get the video to find the creator
    const video = await prisma.video.findUnique({
      where: { id: parseInt(videoId) },
      select: { userId: true }
    });

    if (!video) {
      return res.status(404).json({ error: 'Video not found' });
    }

    const creatorId = video.userId;

    // Check if already subscribed
    const existing = await prisma.subscription.findFirst({
      where: {
        userId: parseInt(userId),
        creatorId: creatorId
      }
    });

    let subscribed = false;
    if (existing) {
      // Unsubscribe
      await prisma.subscription.delete({ where: { id: existing.id } });
      subscribed = false;
    } else {
      // Subscribe
      await prisma.subscription.create({
        data: {
          userId: parseInt(userId),
          creatorId: creatorId
        }
      });
      subscribed = true;
    }

    // Get updated count
    const count = await prisma.subscription.count({
      where: { creatorId: creatorId }
    });

    res.json({ subscribed, count });
  } catch (error) {
    console.error('Subscribe error:', error);
    res.status(500).json({ error: error.message });
  }
};

// ===== SAVE VIDEO =====
const toggleSave = async (req, res) => {
  try {
    const { userId, videoId } = req.body;

    if (!userId || !videoId) {
      return res.status(400).json({ error: 'User ID and Video ID are required' });
    }

    // Check if already saved
    const existing = await prisma.savedVideo.findFirst({
      where: {
        userId: parseInt(userId),
        videoId: parseInt(videoId)
      }
    });

    let action;
    if (existing) {
      await prisma.savedVideo.delete({ where: { id: existing.id } });
      action = 'unsaved';
    } else {
      await prisma.savedVideo.create({
        data: {
          userId: parseInt(userId),
          videoId: parseInt(videoId)
        }
      });
      action = 'saved';
    }

    res.json({ action });
  } catch (error) {
    console.error('Save error:', error);
    res.status(500).json({ error: error.message });
  }
};

// ===== COMMENT =====
const addComment = async (req, res) => {
  try {
    const { text, userId, videoId } = req.body;

    if (!text || !userId || !videoId) {
      return res.status(400).json({ error: 'Text, User ID and Video ID are required' });
    }

    const comment = await prisma.comment.create({
      data: {
        text,
        userId: parseInt(userId),
        videoId: parseInt(videoId)
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            profilePicture: true
          }
        }
      }
    });

    res.status(201).json(comment);
  } catch (error) {
    console.error('Comment error:', error);
    res.status(500).json({ error: error.message });
  }
};

// ===== REPLY =====
const addReply = async (req, res) => {
  try {
    const { text, userId, commentId, videoId, parentReplyId } = req.body;

    if (!text || !userId || !commentId || !videoId) {
      return res.status(400).json({ error: 'Text, User ID, Comment ID and Video ID are required' });
    }

    const reply = await prisma.reply.create({
      data: {
        text,
        userId: parseInt(userId),
        commentId: parseInt(commentId),
        videoId: parseInt(videoId),
        parentReplyId: parentReplyId ? parseInt(parentReplyId) : null
      },
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
    });

    // Format the reply to match frontend expectations
    const formattedReply = {
      id: reply.id,
      text: reply.text,
      createdAt: reply.createdAt,
      userId: reply.userId,
      commentId: reply.commentId,
      videoId: reply.videoId,
      parentReplyId: reply.parentReplyId,
      user: reply.user,
      _count: {
        likes: reply.likes.filter(l => l.type === 'LIKE').length
      },
      replies: []
    };

    res.status(201).json(formattedReply);
  } catch (error) {
    console.error('Reply error:', error);
    res.status(500).json({ error: error.message });
  }
};

// ===== RATE VIDEO =====
const rateVideo = async (req, res) => {
  try {
    const { userId, videoId, value } = req.body;

    if (!userId || !videoId || value === undefined) {
      return res.status(400).json({ error: 'User ID, Video ID and value are required' });
    }

    if (value < 1 || value > 10) {
      return res.status(400).json({ error: 'Rating must be between 1 and 10' });
    }

    // Check if rating exists
    const existing = await prisma.rating.findFirst({
      where: {
        userId: parseInt(userId),
        videoId: parseInt(videoId)
      }
    });

    if (existing) {
      await prisma.rating.update({
        where: { id: existing.id },
        data: { value: parseInt(value) }
      });
    } else {
      await prisma.rating.create({
        data: {
          value: parseInt(value),
          userId: parseInt(userId),
          videoId: parseInt(videoId)
        }
      });
    }

    // Get updated average
    const ratings = await prisma.rating.findMany({
      where: { videoId: parseInt(videoId) },
      select: { value: true }
    });

    const average = ratings.length > 0
      ? (ratings.reduce((sum, r) => sum + r.value, 0) / ratings.length).toFixed(1)
      : 0;

    res.json({ average, count: ratings.length });
  } catch (error) {
    console.error('Rating error:', error);
    res.status(500).json({ error: error.message });
  }
};

// ===== TRIVIA - ADD =====
const addTrivia = async (req, res) => {
  try {
    const { text, userId, videoId } = req.body;

    if (!text || !userId || !videoId) {
      return res.status(400).json({ error: 'Text, User ID and Video ID are required' });
    }

    // Verify video exists
    const video = await prisma.video.findUnique({
      where: { id: parseInt(videoId) }
    });

    if (!video) {
      return res.status(404).json({ error: 'Video not found' });
    }

    const trivia = await prisma.trivia.create({
      data: {
        text,
        userId: parseInt(userId),
        videoId: parseInt(videoId)
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true
          }
        }
      }
    });

    res.status(201).json(trivia);
  } catch (error) {
    console.error('Trivia creation error:', error);
    res.status(500).json({ error: 'Failed to add trivia' });
  }
};

// ===== TRIVIA - DELETE =====
const deleteTrivia = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const trivia = await prisma.trivia.findUnique({
      where: { id: parseInt(id) }
    });

    if (!trivia) {
      return res.status(404).json({ error: 'Trivia not found' });
    }

    if (trivia.userId !== userId && req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    await prisma.trivia.delete({
      where: { id: parseInt(id) }
    });

    res.json({ message: 'Trivia deleted successfully' });
  } catch (error) {
    console.error('Trivia delete error:', error);
    res.status(500).json({ error: 'Failed to delete trivia' });
  }
};

// ===== TRIVIA - GET FOR VIDEO =====
const getTriviaForVideo = async (req, res) => {
  try {
    const { videoId } = req.params;

    if (!videoId) {
      return res.status(400).json({ error: 'Video ID is required' });
    }

    const trivia = await prisma.trivia.findMany({
      where: { videoId: parseInt(videoId) },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(trivia);
  } catch (error) {
    console.error('Get trivia error:', error);
    res.status(500).json({ error: 'Failed to fetch trivia' });
  }
};

// ============================================================
// ROUTES
// ============================================================

// All interaction endpoints require authentication (except get trivia)
router.post('/like', auth, toggleLike);
router.post('/subscribe', auth, toggleSubscribe);
router.post('/save', auth, toggleSave); // Added save endpoint
router.post('/comment', auth, addComment);
router.post('/reply', auth, addReply);
router.post('/trivia', auth, addTrivia);
router.delete('/trivia/:id', auth, deleteTrivia);
router.post('/rate', auth, rateVideo);

// GET trivia - can be public or authenticated
router.get('/trivia/:videoId', getTriviaForVideo);

module.exports = router;