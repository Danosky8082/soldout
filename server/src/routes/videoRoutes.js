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

module.exports = router;