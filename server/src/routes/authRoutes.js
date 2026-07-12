// server/src/routes/authRoutes.js
const express = require('express');
const router = express.Router();

// Register route
router.post('/register', (req, res) => {
  const authController = require('../controllers/authController');
  authController.register(req, res);
});

// Login route
router.post('/login', (req, res) => {
  const authController = require('../controllers/authController');
  authController.login(req, res);
});

module.exports = router;