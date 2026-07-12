// controllers/adminController.ts
import { Request, Response } from 'express';
import prisma from '../prisma';

export const getAdminDashboard = async (req: Request, res: Response) => {
  try {
    const [pendingVideos, approvedVideos, rejectedVideos, totalUsers] = await Promise.all([
      prisma.video.count({ where: { status: 'PENDING' } }),
      prisma.video.count({ where: { status: 'APPROVED' } }),
      prisma.video.count({ where: { status: 'REJECTED' } }),
      prisma.user.count()
    ]);

    res.json({
      pendingVideos,
      approvedVideos,
      rejectedVideos,
      totalUsers
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ error: 'Failed to load dashboard data' });
  }
};

// Add other admin controller functions here
export default {
  getAdminDashboard
  // export other functions
};