const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// ========== LIKE / DISLIKE (supports video, comment, reply) ==========
const toggleLike = async (req, res) => {
  try {
    const { userId, videoId, commentId, replyId, isDislike } = req.body;
    const parsedUserId = parseInt(userId);

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    // Determine target type and validate
    let targetId, targetType, targetModel;

    if (videoId) {
      targetId = parseInt(videoId);
      targetType = 'video';
      targetModel = prisma.video;
    } else if (commentId) {
      targetId = parseInt(commentId);
      targetType = 'comment';
      targetModel = prisma.comment;
    } else if (replyId) {
      targetId = parseInt(replyId);
      targetType = 'reply';
      targetModel = prisma.reply;
    } else {
      return res.status(400).json({ error: 'Missing target (videoId, commentId, or replyId required)' });
    }

    // Check if target exists
    const target = await targetModel.findUnique({
      where: { id: targetId }
    });
    if (!target) {
      return res.status(404).json({ error: `${targetType} not found` });
    }

    const type = isDislike ? 'DISLIKE' : 'LIKE';

    // Build where clause for existing like
    const whereClause = { userId: parsedUserId };
    if (targetType === 'video') whereClause.videoId = targetId;
    else if (targetType === 'comment') whereClause.commentId = targetId;
    else if (targetType === 'reply') whereClause.replyId = targetId;

    // Check if user already has a like on this target
    const existing = await prisma.like.findFirst({
      where: whereClause
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
      const createData = {
        type,
        userId: parsedUserId
      };
      if (targetType === 'video') createData.videoId = targetId;
      else if (targetType === 'comment') createData.commentId = targetId;
      else if (targetType === 'reply') createData.replyId = targetId;

      await prisma.like.create({ data: createData });
    }

    // Return updated counts based on target type
    if (targetType === 'video') {
      const likes = await prisma.like.count({
        where: { videoId: targetId, type: 'LIKE' }
      });
      const dislikes = await prisma.like.count({
        where: { videoId: targetId, type: 'DISLIKE' }
      });
      return res.json({ likes, dislikes });
    } else {
      const likeCount = await prisma.like.count({
        where: { 
          [targetType === 'comment' ? 'commentId' : 'replyId']: targetId,
          type: 'LIKE' 
        }
      });
      return res.json({ likeCount });
    }
  } catch (error) {
    console.error('Like error:', error);
    res.status(500).json({ error: 'Failed to process like', message: error.message });
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

    // Verify video exists
    const video = await prisma.video.findUnique({
      where: { id: parseInt(videoId) }
    });
    if (!video) {
      return res.status(404).json({ message: 'Video not found' });
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

// ========== ADD REPLY (with full validation) ==========
const addReply = async (req, res) => {
  try {
    const { text, userId, commentId, videoId, parentReplyId } = req.body;
    if (!text || !userId || !commentId || !videoId) {
      return res.status(400).json({ 
        error: 'MISSING_FIELDS',
        message: 'text, userId, commentId, videoId are required' 
      });
    }

    // 1. Check that the comment exists
    const comment = await prisma.comment.findUnique({
      where: { id: parseInt(commentId) }
    });
    if (!comment) {
      return res.status(404).json({
        error: 'COMMENT_NOT_FOUND',
        message: 'The comment you are replying to does not exist'
      });
    }

    // 2. Verify the comment belongs to the video
    if (comment.videoId !== parseInt(videoId)) {
      return res.status(400).json({
        error: 'VIDEO_MISMATCH',
        message: 'The comment does not belong to this video'
      });
    }

    // 3. If replying to a reply, verify that parent reply exists and belongs to the same comment
    if (parentReplyId) {
      const parentReply = await prisma.reply.findUnique({
        where: { id: parseInt(parentReplyId) },
        select: { commentId: true, videoId: true }
      });
      if (!parentReply) {
        return res.status(404).json({
          error: 'PARENT_REPLY_NOT_FOUND',
          message: 'The reply you are responding to does not exist'
        });
      }
      if (parentReply.commentId !== parseInt(commentId) || parentReply.videoId !== parseInt(videoId)) {
        return res.status(400).json({
          error: 'PARENT_MISMATCH',
          message: 'The parent reply does not belong to this comment or video'
        });
      }
    }

    // 4. Create the reply
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

    // Verify video exists
    const video = await prisma.video.findUnique({
      where: { id: parseInt(videoId) }
    });
    if (!video) {
      return res.status(404).json({ message: 'Video not found' });
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

    // Check if video exists
    const video = await prisma.video.findUnique({
      where: { id: parsedVideoId }
    });
    if (!video) {
      return res.status(404).json({ message: 'Video not found' });
    }

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

// ========== GET TRIVIA FOR VIDEO ==========
const getTriviaForVideo = async (req, res) => {
  try {
    const { videoId } = req.params;
    const trivia = await prisma.trivia.findMany({
      where: { videoId: parseInt(videoId) },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            profilePicture: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json(trivia);
  } catch (error) {
    console.error('Get trivia error:', error);
    res.status(500).json({ message: 'Failed to fetch trivia', error: error.message });
  }
};

module.exports = {
  toggleLike,
  toggleSubscribe,
  addComment,
  addReply,
  addTrivia,
  deleteTrivia,
  rateVideo,
  getTriviaForVideo
};