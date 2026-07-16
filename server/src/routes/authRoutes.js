const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// Public auth routes
router.post('/register', authController.register);
router.post('/login', authController.login);
router.get('/verify-email', authController.verifyEmail);
router.post('/resend-verification', authController.resendVerification);

module.exports = router;