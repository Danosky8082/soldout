const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const bcrypt = require('bcryptjs');

// ===== DASHBOARD =====
const getAdminDashboard = async (req, res) => {
  try {
    const [pendingVideos, approvedVideos, rejectedVideos, totalUsers] = await Promise.all([
      prisma.video.count({ where: { status: 'PENDING' } }),
      prisma.video.count({ where: { status: 'APPROVED' } }),
      prisma.video.count({ where: { status: 'REJECTED' } }),
      prisma.user.count()
    ]);

    res.json({ pendingVideos, approvedVideos, rejectedVideos, totalUsers });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ error: 'Failed to load dashboard data' });
  }
};

const getPendingVideos = async (req, res) => {
  try {
    const videos = await prisma.video.findMany({
      where: { status: 'PENDING' },
      include: { user: { select: { firstName: true, lastName: true } } },
      orderBy: { createdAt: 'desc' }
    });
    res.json(videos);
  } catch (error) {
    console.error('Pending videos error:', error);
    res.status(500).json({ error: 'Failed to fetch pending videos' });
  }
};

const getApprovedVideos = async (req, res) => {
  try {
    const videos = await prisma.video.findMany({
      where: { status: 'APPROVED' },
      include: { user: { select: { firstName: true, lastName: true } } },
      orderBy: { approvedAt: 'desc' }
    });
    res.json(videos);
  } catch (error) {
    console.error('Approved videos error:', error);
    res.status(500).json({ error: 'Failed to fetch approved videos' });
  }
};

const getRejectedVideos = async (req, res) => {
  try {
    const videos = await prisma.video.findMany({
      where: { status: 'REJECTED' },
      include: { user: { select: { firstName: true, lastName: true } } },
      orderBy: { rejectedAt: 'desc' }
    });
    res.json(videos);
  } catch (error) {
    console.error('Rejected videos error:', error);
    res.status(500).json({ error: 'Failed to fetch rejected videos' });
  }
};

const getVideoById = async (req, res) => {
  try {
    const { id } = req.params;
    const video = await prisma.video.findUnique({
      where: { id: parseInt(id) },
      include: { user: { select: { firstName: true, lastName: true, email: true } } }
    });
    if (!video) return res.status(404).json({ error: 'Video not found' });
    res.json(video);
  } catch (error) {
    console.error('Get video error:', error);
    res.status(500).json({ error: 'Failed to fetch video' });
  }
};

const approveVideo = async (req, res) => {
  try {
    const { id } = req.params;
    const video = await prisma.video.update({
      where: { id: parseInt(id) },
      data: { status: 'APPROVED', approvedAt: new Date() }
    });
    res.json(video);
  } catch (error) {
    console.error('Approve video error:', error);
    res.status(500).json({ error: 'Failed to approve video' });
  }
};

const rejectVideo = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const video = await prisma.video.update({
      where: { id: parseInt(id) },
      data: { status: 'REJECTED', rejectedAt: new Date(), rejectionReason: reason }
    });
    res.json(video);
  } catch (error) {
    console.error('Reject video error:', error);
    res.status(500).json({ error: 'Failed to reject video' });
  }
};

const unpublishVideo = async (req, res) => {
  try {
    const { id } = req.params;
    const video = await prisma.video.update({
      where: { id: parseInt(id) },
      data: { status: 'PENDING', approvedAt: null }
    });
    res.json(video);
  } catch (error) {
    console.error('Unpublish video error:', error);
    res.status(500).json({ error: 'Failed to unpublish video' });
  }
};

const deleteVideo = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.video.delete({ where: { id: parseInt(id) } });
    res.json({ message: 'Video deleted successfully' });
  } catch (error) {
    console.error('Delete video error:', error);
    res.status(500).json({ error: 'Failed to delete video' });
  }
};

const getUsers = async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
        isBanned: true,
        profilePicture: true,
        createdAt: true,
        _count: { select: { videos: true } }
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json(users);
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
};

const getUserById = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await prisma.user.findUnique({
      where: { id: parseInt(id) },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
        isBanned: true,
        profilePicture: true,
        createdAt: true
      }
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
};

const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { firstName, lastName, email, role } = req.body;
    const user = await prisma.user.update({
      where: { id: parseInt(id) },
      data: { firstName, lastName, email, role }
    });
    res.json(user);
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
};

const banUser = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await prisma.user.update({
      where: { id: parseInt(id) },
      data: { isBanned: true }
    });
    res.json(user);
  } catch (error) {
    console.error('Ban user error:', error);
    res.status(500).json({ error: 'Failed to ban user' });
  }
};

const unbanUser = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await prisma.user.update({
      where: { id: parseInt(id) },
      data: { isBanned: false }
    });
    res.json(user);
  } catch (error) {
    console.error('Unban user error:', error);
    res.status(500).json({ error: 'Failed to unban user' });
  }
};

const getAdmins = async (req, res) => {
  try {
    const admins = await prisma.user.findMany({
      where: { role: { in: ['ADMIN', 'SUPER_ADMIN'] } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
        profilePicture: true,
        createdAt: true,
        lastLogin: true
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json(admins);
  } catch (error) {
    console.error('Get admins error:', error);
    res.status(500).json({ error: 'Failed to fetch admins' });
  }
};

const getAdminById = async (req, res) => {
  try {
    const { id } = req.params;
    const admin = await prisma.user.findUnique({
      where: { id: parseInt(id) },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
        profilePicture: true,
        createdAt: true,
        lastLogin: true
      }
    });
    if (!admin) return res.status(404).json({ error: 'Admin not found' });
    res.json(admin);
  } catch (error) {
    console.error('Get admin error:', error);
    res.status(500).json({ error: 'Failed to fetch admin' });
  }
};

const deleteAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const admin = await prisma.user.findUnique({
      where: { id: parseInt(id) },
      select: { role: true }
    });
    if (!admin) return res.status(404).json({ error: 'Admin not found' });
    if (admin.role === 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Cannot delete super admin' });
    }
    await prisma.user.delete({ where: { id: parseInt(id) } });
    res.json({ message: 'Admin removed successfully' });
  } catch (error) {
    console.error('Delete admin error:', error);
    res.status(500).json({ error: 'Failed to delete admin' });
  }
};

const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const adminId = req.user.id;

    const admin = await prisma.user.findUnique({
      where: { id: adminId },
      select: { password: true }
    });
    if (!admin) return res.status(404).json({ error: 'Admin not found' });

    const valid = await bcrypt.compare(currentPassword, admin.password);
    if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });

    const hashed = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: adminId },
      data: { password: hashed }
    });
    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
};

const registerAdmin = async (req, res) => {
  try {
    const { firstName, lastName, email, password, role } = req.body;
    if (!['ADMIN', 'SUPER_ADMIN'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role. Must be ADMIN or SUPER_ADMIN' });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(400).json({ error: 'Email already in use' });

    const hashed = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        firstName,
        lastName,
        email,
        password: hashed,
        role: role,
        isAdmin: true
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true
      }
    });
    res.status(201).json({ message: 'Admin registered successfully', user });
  } catch (error) {
    console.error('Register admin error:', error);
    res.status(500).json({ error: 'Failed to register admin' });
  }
};

module.exports = {
  getAdminDashboard,
  getPendingVideos,
  getApprovedVideos,
  getRejectedVideos,
  getVideoById,
  approveVideo,
  rejectVideo,
  unpublishVideo,
  deleteVideo,
  getUsers,
  getUserById,
  updateUser,
  banUser,
  unbanUser,
  getAdmins,
  getAdminById,
  deleteAdmin,
  changePassword,
  registerAdmin
};