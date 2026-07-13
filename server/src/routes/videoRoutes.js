// server/src/routes/videoRoutes.js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const videoController = require('../controllers/videoController');
const upload = require('../utils/storage');

// ====== IMPORT PRISMA FOR DELETE ======
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Upload video (available to all authenticated users)
router.post('/',
  authMiddleware,
  upload.fields([
    { name: 'thumbnail', maxCount: 1 },
    { name: 'video', maxCount: 1 }
  ]),
  videoController.uploadVideo
);

// Get premium videos (approved videos from last 30 days)
router.get('/premium', videoController.getPremiumVideos);

// Get trending videos (approved videos older than 30 days)
router.get('/trending', videoController.getTrendingVideos);

// Admin-only routes
router.get('/pending', authMiddleware, videoController.getPendingVideos);
router.patch('/:videoId/approve', authMiddleware, videoController.approveVideo);
router.patch('/:videoId/reject', authMiddleware, videoController.rejectVideo);

// ====== DELETE VIDEO – with transaction and Prisma ======
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const videoId = parseInt(req.params.id);
    if (isNaN(videoId)) {
      return res.status(400).json({ message: 'Invalid video ID' });
    }

    // `req.user` is set by authMiddleware
    const userId = req.user.id;
    const isAdmin = req.user.role === 'ADMIN' || req.user.role === 'SUPER_ADMIN';

    // Check if video exists and get its owner
    const video = await prisma.video.findUnique({
      where: { id: videoId },
      select: { userId: true }
    });

    if (!video) {
      return res.status(404).json({ message: 'Video not found' });
    }

    // Ownership check
    if (video.userId !== userId && !isAdmin) {
      return res.status(403).json({ message: 'You do not have permission to delete this video' });
    }

    // Use a transaction to delete all related records
    await prisma.$transaction(async (prisma) => {
      // Delete replies (they belong to comments, but we delete them first)
      await prisma.reply.deleteMany({
        where: { videoId: videoId }
      });

      // Delete comments
      await prisma.comment.deleteMany({
        where: { videoId: videoId }
      });

      // Delete likes on the video
      await prisma.like.deleteMany({
        where: { videoId: videoId }
      });

      // Delete ratings
      await prisma.rating.deleteMany({
        where: { videoId: videoId }
      });

      // Delete trivia
      await prisma.trivia.deleteMany({
        where: { videoId: videoId }
      });

      // Delete subscriptions (if any)
      await prisma.subscription.deleteMany({
        where: { videoId: videoId }
      });

      // Finally, delete the video itself
      await prisma.video.delete({
        where: { id: videoId }
      });
    });

    res.json({ message: 'Video deleted successfully' });
  } catch (error) {
    console.error('Delete video error:', error);
    res.status(500).json({
      message: 'Failed to delete video',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

module.exports = router;