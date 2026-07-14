const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// ========== LIKE / DISLIKE (for videos) ==========
const toggleLike = async (req, res) => {
  try {
    const { userId, videoId, isDislike } = req.body;
    const parsedUserId = parseInt(userId);
    const parsedVideoId = parseInt(videoId);

    if (!userId || !videoId) {
      return res.status(400).json({ message: 'userId and videoId are required' });
    }

    // Check if video exists
    const video = await prisma.video.findUnique({
      where: { id: parsedVideoId }
    });
    if (!video) {
      return res.status(404).json({ message: 'Video not found' });
    }

    // Determine the LikeType
    const type = isDislike ? 'DISLIKE' : 'LIKE';

    // Check if user already has a like on this video
    const existing = await prisma.like.findFirst({
      where: {
        userId: parsedUserId,
        videoId: parsedVideoId,
        type: { in: ['LIKE', 'DISLIKE'] }
      }
    });

    if (existing) {
      // If same type, remove (toggle off)
      if (existing.type === type) {
        await prisma.like.delete({ where: { id: existing.id } });
      } else {
        // Change type (update)
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
          userId: parsedUserId,
          videoId: parsedVideoId
        }
      });
    }

    // Get updated counts
    const likes = await prisma.like.count({
      where: { videoId: parsedVideoId, type: 'LIKE' }
    });
    const dislikes = await prisma.like.count({
      where: { videoId: parsedVideoId, type: 'DISLIKE' }
    });

    res.json({ likes, dislikes });
  } catch (error) {
    console.error('Like error:', error);
    res.status(500).json({ message: 'Failed to process like', error: error.message });
  }
};

// ========== SUBSCRIBE / UNSUBSCRIBE (to video uploader) ==========
const toggleSubscribe = async (req, res) => {
  try {
    const { userId, videoId } = req.body;
    const parsedUserId = parseInt(userId);
    const parsedVideoId = parseInt(videoId);

    if (!userId || !videoId) {
      return res.status(400).json({ message: 'userId and videoId are required' });
    }

    // Get the video's uploader
    const video = await prisma.video.findUnique({
      where: { id: parsedVideoId },
      select: { userId: true }
    });
    if (!video) {
      return res.status(404).json({ message: 'Video not found' });
    }
    const creatorId = video.userId;

    // Check if subscription exists
    const existing = await prisma.subscription.findFirst({
      where: {
        userId: parsedUserId,
        creatorId: creatorId
      }
    });

    if (existing) {
      // Unsubscribe
      await prisma.subscription.delete({ where: { id: existing.id } });
      const count = await prisma.subscription.count({
        where: { creatorId }
      });
      return res.json({ subscribed: false, count });
    } else {
      // Subscribe (no videoId needed because it's channel-level)
      await prisma.subscription.create({
        data: {
          userId: parsedUserId,
          creatorId
        }
      });
      const count = await prisma.subscription.count({
        where: { creatorId }
      });
      return res.json({ subscribed: true, count });
    }
  } catch (error) {
    console.error('Subscribe error:', error);
    res.status(500).json({ message: 'Failed to process subscription', error: error.message });
  }
};

// ========== ADD COMMENT ==========
const addComment = async (req, res) => {
  try {
    const { text, userId, videoId } = req.body;
    if (!text || !userId || !videoId) {
      return res.status(400).json({ message: 'text, userId, videoId are required' });
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
    res.status(500).json({ message: 'Failed to add comment', error: error.message });
  }
};

// ========== ADD REPLY (to a comment or another reply) ==========
const addReply = async (req, res) => {
  try {
    const { text, userId, commentId, videoId, parentReplyId } = req.body;
    if (!text || !userId || !commentId || !videoId) {
      return res.status(400).json({ message: 'text, userId, commentId, videoId are required' });
    }

    // parentReplyId can be null for reply to a comment
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
        }
      }
    });

    res.status(201).json(reply);
  } catch (error) {
    console.error('Reply error:', error);
    res.status(500).json({ message: 'Failed to add reply', error: error.message });
  }
};

// ========== TRIVIA ==========
const addTrivia = async (req, res) => {
  try {
    const { text, userId, videoId } = req.body;
    if (!text || !userId || !videoId) {
      return res.status(400).json({ message: 'text, userId, videoId are required' });
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
            lastName: true,
            profilePicture: true
          }
        }
      }
    });

    res.status(201).json(trivia);
  } catch (error) {
    console.error('Trivia error:', error);
    res.status(500).json({ message: 'Failed to add trivia', error: error.message });
  }
};

const deleteTrivia = async (req, res) => {
  try {
    const { id } = req.params;
    const trivia = await prisma.trivia.findUnique({
      where: { id: parseInt(id) }
    });
    if (!trivia) {
      return res.status(404).json({ message: 'Trivia not found' });
    }
    await prisma.trivia.delete({ where: { id: parseInt(id) } });
    res.json({ message: 'Trivia deleted' });
  } catch (error) {
    console.error('Delete trivia error:', error);
    res.status(500).json({ message: 'Failed to delete trivia', error: error.message });
  }
};

// ========== RATING ==========
const rateVideo = async (req, res) => {
  try {
    const { userId, videoId, value } = req.body;
    if (!userId || !videoId || !value) {
      return res.status(400).json({ message: 'userId, videoId, value are required' });
    }

    const parsedUserId = parseInt(userId);
    const parsedVideoId = parseInt(videoId);

    // Check if rating exists
    const existing = await prisma.rating.findFirst({
      where: {
        userId: parsedUserId,
        videoId: parsedVideoId
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
          userId: parsedUserId,
          videoId: parsedVideoId,
          value: parseInt(value)
        }
      });
    }

    // Get average and count
    const result = await prisma.rating.aggregate({
      where: { videoId: parsedVideoId },
      _avg: { value: true },
      _count: { value: true }
    });

    res.json({
      average: result._avg.value ? result._avg.value.toFixed(1) : 0,
      count: result._count.value
    });
  } catch (error) {
    console.error('Rating error:', error);
    res.status(500).json({ message: 'Failed to rate video', error: error.message });
  }
};

module.exports = {
  toggleLike,
  toggleSubscribe,
  addComment,
  addReply,
  addTrivia,
  deleteTrivia,
  rateVideo
};