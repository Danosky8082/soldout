// src/routes/adminRoutes.ts
import express from 'express';
import { adminLogin, verifyAdmin } from '../controllers/authController';
import { 
  getPendingVideos,
  approveVideo,
  rejectVideo,
  getUsers,
  updateUserRole
} from '../controllers/adminController';

const router = express.Router();

// Admin login
router.post('/login', adminLogin);

// Protected admin routes
router.get('/videos/pending', verifyAdmin, getPendingVideos);
router.post('/videos/:id/approve', verifyAdmin, approveVideo);
router.post('/videos/:id/reject', verifyAdmin, rejectVideo);
router.get('/users', verifyAdmin, getUsers);
router.put('/users/:id', verifyAdmin, updateUserRole);

export default router;