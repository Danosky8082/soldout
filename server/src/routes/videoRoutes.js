const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const videoController = require('../controllers/videoController');
const upload = require('../utils/storage');

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


// In videoRoutes.js
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const videoId = parseInt(req.params.id);
    const userId = req.user.id;

    const video = await prisma.video.findUnique({ where: { id: videoId } });
    if (!video) return res.status(404).json({ message: 'Video not found' });

    // Check if user owns the video or is admin
    if (video.userId !== userId && req.user.role !== 'ADMIN') {
      return res.status(403).json({ message: 'Unauthorized to delete this video' });
    }

    await prisma.video.delete({ where: { id: videoId } });
    res.json({ message: 'Video deleted successfully' });
  } catch (error) {
    console.error('Delete video error:', error);
    res.status(500).json({ message: 'Failed to delete video' });
  }
});

module.exports = router;