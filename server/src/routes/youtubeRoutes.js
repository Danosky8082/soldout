const express = require('express');
const router = express.Router();
const youtubeController = require('../controllers/youtubeController');

router.get('/search', youtubeController.searchYouTube);

module.exports = router;