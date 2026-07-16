const express = require('express');
const router = express.Router();
const interactionController = require('../controllers/interactionController');
const { auth } = require('../middleware/auth'); // ✅ destructure auth

// All interaction endpoints require authentication
router.post('/like', auth, interactionController.toggleLike);
router.post('/subscribe', auth, interactionController.toggleSubscribe);
router.post('/comment', auth, interactionController.addComment);
router.post('/reply', auth, interactionController.addReply);
router.post('/trivia', auth, interactionController.addTrivia);
router.delete('/trivia/:id', auth, interactionController.deleteTrivia);
router.post('/rate', auth, interactionController.rateVideo);

module.exports = router;