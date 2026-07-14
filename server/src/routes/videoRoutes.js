const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const videoController = require('../controllers/videoController');
const multer = require('multer');
const storage = multer.memoryStorage();
const videoUpload = multer({
  storage: storage,
  limits: { fileSize: 2 * 1024 * 1024 * 1024 } // 2GB limit
});

// Upload video (authenticated)
router.post('/',
  authMiddleware,
  videoUpload.fields([
    { name: 'thumbnail', maxCount: 1 },
    { name: 'video', maxCount: 1 }
  ]),
  videoController.uploadVideo
);

// Get premium videos (approved, last 30 days)
router.get('/premium', videoController.getPremiumVideos);

// Get trending videos (approved, older than 30 days)
router.get('/trending', videoController.getTrendingVideos);

// ==================== NEW: Get single video by ID ====================
// MUST be placed AFTER the specific routes like /premium and /trending
router.get('/:id', videoController.getVideoById);

// Admin-only routes
router.get('/pending', authMiddleware, videoController.getPendingVideos);
router.patch('/:videoId/approve', authMiddleware, videoController.approveVideo);
router.patch('/:videoId/reject', authMiddleware, videoController.rejectVideo);

// Delete video (user-owned or admin)
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const videoId = parseInt(req.params.id);
    const userId = req.user.id;

    const video = await prisma.video.findUnique({
      where: { id: videoId },
      select: { userId: true }
    });

    if (!video) {
      return res.status(404).json({ message: 'Video not found' });
    }

    // Allow deletion if user owns the video or is admin (canApprove)
    if (video.userId !== userId && !req.user.canApprove) {
      return res.status(403).json({ message: 'Unauthorized to delete this video' });
    }

    await prisma.video.delete({
      where: { id: videoId }
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