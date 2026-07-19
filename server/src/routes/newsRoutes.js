const express = require('express');
const router = express.Router();
const newsController = require('../controllers/newsController');

// GET /api/news/entertainment?limit=30&category=movies
router.get('/entertainment', newsController.getEntertainmentNews);

module.exports = router;