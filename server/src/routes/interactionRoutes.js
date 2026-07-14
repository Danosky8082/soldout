const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const interactionController = require('../controllers/interactionController');

// All interaction endpoints require authentication
router.post('/like', authMiddleware, interactionController.toggleLike);
router.post('/subscribe', authMiddleware, interactionController.toggleSubscribe);
router.post('/comment', authMiddleware, interactionController.addComment);
router.post('/reply', authMiddleware, interactionController.addReply);
router.post('/trivia', authMiddleware, interactionController.addTrivia);
router.delete('/trivia/:id', authMiddleware, interactionController.deleteTrivia);
router.post('/rate', authMiddleware, interactionController.rateVideo);

module.exports = router;