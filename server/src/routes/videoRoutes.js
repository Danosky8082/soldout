const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const videoController = require('../controllers/videoController');
// We'll pass multer from server.js – but we need to define it here or import.
// For simplicity, we'll keep multer definition here using memoryStorage.
const multer = require('multer');
const storage = multer.memoryStorage();
const videoUpload = multer({
  storage: storage,
  limits: { fileSize: 2 * 1024 * 1024 * 1024 }
});

// Upload video (available to all authenticated users)
router.post('/',
  authMiddleware,
  videoUpload.fields([
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

// Delete video (user-owned or admin)
router.delete('/:id', authMiddleware, async (req, res) => {
  // ... (your existing delete logic)
});

module.exports = router;