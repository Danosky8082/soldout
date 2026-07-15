// routes/adminRoutes.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { verifyAdmin, verifySuperAdmin } = require('../middleware/auth');
const adminController = require('../controllers/adminController');
const { adminLogin } = require('../controllers/authController');
const { uploadToSupabase } = require('../utils/upload');

const upload = multer({ storage: multer.memoryStorage() });

// ===== PUBLIC =====
router.post('/login', adminLogin);

// ===== PROTECTED (all require admin token) =====
router.use(verifyAdmin);

// Dashboard
router.get('/dashboard', adminController.getAdminDashboard);

// Videos
router.get('/videos/pending', adminController.getPendingVideos);
router.get('/videos/approved', adminController.getApprovedVideos);
router.get('/videos/rejected', adminController.getRejectedVideos);
router.get('/videos/:id', adminController.getVideoById);
router.post('/videos/:id/approve', adminController.approveVideo);
router.post('/videos/:id/reject', adminController.rejectVideo);
router.post('/videos/:id/unpublish', adminController.unpublishVideo);
router.delete('/videos/:id', adminController.deleteVideo);

// Users
router.get('/users', adminController.getUsers);
router.get('/users/:id', adminController.getUserById);
router.put('/users/:id', adminController.updateUser);
router.post('/users/:id/ban', adminController.banUser);
router.post('/users/:id/unban', adminController.unbanUser);

// Admins
router.get('/admins', adminController.getAdmins);
router.get('/admins/:id', adminController.getAdminById);
router.delete('/admins/:id', verifySuperAdmin, adminController.deleteAdmin);
router.post('/register', verifySuperAdmin, adminController.registerAdmin);

// Profile picture upload (for admin)
router.post('/profile-picture', upload.single('profilePicture'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const url = await uploadToSupabase(req.file, 'profiles');
    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: { profilePicture: url }
    });
    res.json({ profilePictureUrl: url, user });
  } catch (error) {
    console.error('Profile picture upload error:', error);
    res.status(500).json({ error: 'Failed to upload profile picture' });
  }
});

// Change password
router.post('/change-password', adminController.changePassword);

module.exports = router;